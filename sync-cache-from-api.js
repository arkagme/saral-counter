#!/usr/bin/env node

/**
 * sync-cache-from-api.js
 *
 * Audits the dashboard cache against the LIVE per-user API responses.
 * For every user who has papers in paper_metadata, it:
 *   1. Reads their current cache entry
 *   2. Calls the external API to get their latest data
 *   3. Compares cache vs API
 *   4. If mismatch → updates the Firestore cache chunk in-place
 *
 * This fixes all stale cache entries in one go.
 *
 * Usage:  node sync-cache-from-api.js [--dry-run]
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DRY_RUN = process.argv.includes("--dry-run");

// Load .env.local
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

// Init Firebase Admin
const saPath = path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json");
if (!admin.apps.length) {
  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const USER_DASHBOARD_URL = "https://overhaulapi.democratiseresearch.in/api/analytics/user";

async function getIdTokenForUser(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`Token exchange failed: ${err.error?.message || resp.statusText}`);
  }
  return (await resp.json()).idToken;
}

async function main() {
  console.log("=" .repeat(70));
  console.log(DRY_RUN ? "AUDIT ONLY (--dry-run)" : "AUDIT + FIX MODE");
  console.log("=" .repeat(70));

  // ── STEP 1: Read paper_metadata to find all users with papers ──
  console.log("\n📄 STEP 1: Reading paper_metadata (ground truth)...\n");

  const paperMetaDocs = await db.collection("paper_metadata").get();
  const userPaperCounts = {};  // user_id -> { email, paperCount, outputs }
  let orphanCount = 0;

  paperMetaDocs.docs.forEach((doc) => {
    const data = doc.data();
    const userId = data.user_id;
    const email = data.user_email || "(unknown)";

    if (!userId) {
      orphanCount++;
      return;
    }

    if (!userPaperCounts[userId]) {
      userPaperCounts[userId] = { email, paperCount: 0, outputs: {} };
    }
    userPaperCounts[userId].paperCount++;

    // Count outputs
    const processingOutputs = data.processing_outputs || {};
    for (const outType of Object.keys(processingOutputs)) {
      if (typeof processingOutputs[outType] === "object") {
        userPaperCounts[userId].outputs[outType] =
          (userPaperCounts[userId].outputs[outType] || 0) + 1;
      }
    }
  });

  const usersWithPapers = Object.entries(userPaperCounts);
  console.log(`  Total paper_metadata docs: ${paperMetaDocs.size}`);
  console.log(`  Users with papers:         ${usersWithPapers.length}`);
  console.log(`  Orphan papers:             ${orphanCount}\n`);

  // ── STEP 2: Read the dashboard cache ──
  console.log("📦 STEP 2: Reading dashboard cache...\n");

  const cacheDocRef = db.collection("analytics_cache").doc("user_dashboards");
  const chunksSnapshot = await cacheDocRef.collection("chunks").orderBy("__name__").get();

  // Build a map: user_id -> { chunkId, index, data }
  const cacheMap = {};
  chunksSnapshot.docs.forEach((chunkDoc) => {
    const chunkData = chunkDoc.data();
    if (chunkData.dashboards) {
      chunkData.dashboards.forEach((d, idx) => {
        cacheMap[d.user_id] = {
          chunkId: chunkDoc.id,
          index: idx,
          data: d,
        };
      });
    }
  });

  console.log(`  Total cached users: ${Object.keys(cacheMap).length}\n`);

  // ── STEP 3: Compare and find mismatches ──
  console.log("🔍 STEP 3: Comparing paper_metadata vs cache...\n");

  const mismatches = [];
  const missingFromCache = [];

  for (const [userId, meta] of usersWithPapers) {
    const cached = cacheMap[userId];

    if (!cached) {
      missingFromCache.push({ userId, ...meta });
      continue;
    }

    const cachedPapers = cached.data.total_papers || 0;
    const cachedOutputs = cached.data.total_outputs || {};

    // Check paper count mismatch
    if (cachedPapers !== meta.paperCount) {
      mismatches.push({
        userId,
        email: meta.email,
        cachePapers: cachedPapers,
        metaPapers: meta.paperCount,
        cacheOutputs: cachedOutputs,
        metaOutputs: meta.outputs,
        chunkId: cached.chunkId,
      });
      continue;
    }

    // Check output count mismatches
    const allOutputTypes = new Set([
      ...Object.keys(cachedOutputs),
      ...Object.keys(meta.outputs),
    ]);
    let outputMismatch = false;
    for (const ot of allOutputTypes) {
      if ((cachedOutputs[ot] || 0) !== (meta.outputs[ot] || 0)) {
        outputMismatch = true;
        break;
      }
    }

    if (outputMismatch) {
      mismatches.push({
        userId,
        email: meta.email,
        cachePapers: cachedPapers,
        metaPapers: meta.paperCount,
        cacheOutputs: cachedOutputs,
        metaOutputs: meta.outputs,
        chunkId: cached.chunkId,
      });
    }
  }

  console.log(`  Mismatched users:      ${mismatches.length}`);
  console.log(`  Missing from cache:    ${missingFromCache.length}`);
  console.log(`  Total to fix:          ${mismatches.length + missingFromCache.length}\n`);

  if (mismatches.length > 0) {
    console.log("  📊 MISMATCHES:");
    mismatches.forEach((m) => {
      console.log(
        `    ${m.email}: cache=${m.cachePapers} papers ${JSON.stringify(m.cacheOutputs)} ` +
        `→ actual=${m.metaPapers} papers ${JSON.stringify(m.metaOutputs)}`
      );
    });
    console.log("");
  }

  if (missingFromCache.length > 0) {
    console.log("  ❌ MISSING FROM CACHE:");
    missingFromCache.forEach((m) => {
      console.log(`    ${m.email} (${m.userId}): ${m.paperCount} papers`);
    });
    console.log("");
  }

  if (mismatches.length === 0 && missingFromCache.length === 0) {
    console.log("  ✅ Everything is in sync! Nothing to fix.\n");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log("🔒 DRY RUN — not making any changes. Run without --dry-run to fix.\n");
    process.exit(0);
  }

  // ── STEP 4: Fix mismatches by re-fetching from API ──
  console.log("🔧 STEP 4: Fixing mismatches by re-fetching from API...\n");

  const allToFix = [
    ...mismatches.map((m) => ({ userId: m.userId, email: m.email, type: "mismatch" })),
    ...missingFromCache.map((m) => ({ userId: m.userId, email: m.email, type: "missing" })),
  ];

  let fixed = 0;
  let errors = 0;

  for (let i = 0; i < allToFix.length; i++) {
    const { userId, email, type } = allToFix[i];
    process.stdout.write(`  [${i + 1}/${allToFix.length}] ${email} (${type})... `);

    try {
      // Fetch fresh data from API
      const token = await getIdTokenForUser(userId);
      const resp = await fetch(`${USER_DASHBOARD_URL}/${userId}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      let freshEntry;
      if (resp.ok) {
        const apiData = await resp.json();
        freshEntry = {
          user_id: userId,
          email: email,
          total_papers: apiData.total_papers || 0,
          papers_by_source: apiData.papers_by_source || {},
          total_outputs: apiData.total_outputs || {},
          papers: apiData.papers || [],
          fetched_at: new Date().toISOString(),
        };
      } else {
        // API error — create entry reflecting what paper_metadata says
        console.log(`API ${resp.status}, using paper_metadata data`);
        const meta = userPaperCounts[userId];
        freshEntry = {
          user_id: userId,
          email: email,
          total_papers: meta.paperCount,
          papers_by_source: {},
          total_outputs: meta.outputs,
          papers: [],
          fetched_at: new Date().toISOString(),
          error: `API returned ${resp.status} — counts from paper_metadata`,
        };
      }

      // Update cache
      if (type === "mismatch") {
        // Find and update in existing chunk
        const cachedInfo = cacheMap[userId];
        const chunkRef = cacheDocRef.collection("chunks").doc(cachedInfo.chunkId);
        const chunkDoc = await chunkRef.get();
        const dashboards = chunkDoc.data().dashboards;
        const idx = dashboards.findIndex((d) => d.user_id === userId);
        if (idx !== -1) {
          dashboards[idx] = freshEntry;
          await chunkRef.set({ dashboards });
        }
      } else {
        // Missing from cache — append to last chunk
        const lastChunkDoc = chunksSnapshot.docs[chunksSnapshot.docs.length - 1];
        const lastChunkData = lastChunkDoc.data();
        const dashboards = lastChunkData.dashboards;

        if (dashboards.length < 100) {
          dashboards.push(freshEntry);
          await lastChunkDoc.ref.set({ dashboards });
        } else {
          const newChunkIndex = chunksSnapshot.docs.length;
          await cacheDocRef
            .collection("chunks")
            .doc(`chunk_${newChunkIndex}`)
            .set({ dashboards: [freshEntry] });
        }

        // Update metadata
        const metaDoc = await cacheDocRef.get();
        if (metaDoc.exists) {
          await cacheDocRef.update({
            total_users: (metaDoc.data().total_users || 0) + 1,
            cached_at: new Date().toISOString(),
          });
        }
      }

      console.log(
        `✅ ${freshEntry.total_papers} papers, ${JSON.stringify(freshEntry.total_outputs)}`
      );
      fixed++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      errors++;
    }
  }

  console.log("\n" + "=" .repeat(70));
  console.log(`RESULTS: ${fixed} fixed, ${errors} errors`);
  console.log("=" .repeat(70));

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
