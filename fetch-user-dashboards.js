#!/usr/bin/env node

/**
 * One-time script to fetch dashboard data for ALL Firebase Auth users
 * and store results in Firestore cache (analytics_cache/user_dashboards).
 *
 * Fetches users one-by-one with progress logging.
 * The website will then read from this cache instantly.
 *
 * Usage:  node fetch-user-dashboards.js
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ── Load .env.local ──────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// ── Init Firebase Admin ──────────────────────────────────────────────
const serviceAccountPath = path.join(
  __dirname,
  "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
);
if (!admin.apps.length) {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    console.error("❌ Firebase credentials not found.");
    process.exit(1);
  }
}

const db = admin.firestore();
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const USER_DASHBOARD_URL =
  "https://testload.democratiseresearch.in/api/api/analytics/user";
const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";
const CHUNK_SIZE = 100;

// ── Per-user token management ────────────────────────────────────────
async function getIdTokenForUser(uid) {
  if (!FIREBASE_API_KEY) {
    throw new Error("FIREBASE_API_KEY not set in .env.local");
  }
  // Create custom token for THIS specific user
  const customToken = await admin.auth().createCustomToken(uid);
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(
      `Token exchange failed for ${uid}: ${err.error?.message || resp.statusText}`,
    );
  }
  const data = await resp.json();
  return data.idToken;
}

// ── Fetch single user dashboard ──────────────────────────────────────
let errorLogCount = 0; // only log details for first 3 failures

async function fetchUserDashboard(uid, email, token) {
  try {
    const url = `${USER_DASHBOARD_URL}/${uid}/dashboard`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      let body = "";
      try {
        body = await resp.text();
      } catch (_) {}

      if (errorLogCount < 3) {
        errorLogCount++;
        console.error(
          `\n\n⚠️  ERROR #${errorLogCount} for ${email} (uid: ${uid})` +
            `\n   URL: ${url}` +
            `\n   Status: ${resp.status} ${resp.statusText}` +
            `\n   Response body: ${body.slice(0, 500)}` +
            `\n   Token (first 50 chars): ${token?.slice(0, 50)}...\n`,
        );
      }

      return {
        user_id: uid,
        email,
        total_papers: 0,
        papers_by_source: {},
        total_outputs: {},
        papers: [],
        fetched_at: new Date().toISOString(),
        error: `API returned ${resp.status}`,
      };
    }
    const d = await resp.json();
    return {
      user_id: uid,
      email,
      total_papers: d.total_papers || 0,
      papers_by_source: d.papers_by_source || {},
      total_outputs: d.total_outputs || {},
      papers: d.papers || [],
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    if (errorLogCount < 3) {
      errorLogCount++;
      console.error(
        `\n\n⚠️  EXCEPTION #${errorLogCount} for ${email} (uid: ${uid})` +
          `\n   ${err.message}\n`,
      );
    }
    return {
      user_id: uid,
      email,
      total_papers: 0,
      papers_by_source: {},
      total_outputs: {},
      papers: [],
      fetched_at: new Date().toISOString(),
      error: err.message || "Unknown error",
    };
  }
}

// ── Helper: read existing cache from Firestore ──────────────────────
async function readExistingCache() {
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
  const doc = await docRef.get();
  if (!doc.exists) return [];

  const chunksSnapshot = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();

  const all = [];
  chunksSnapshot.docs.forEach((chunkDoc) => {
    const data = chunkDoc.data();
    if (data.dashboards) all.push(...data.dashboards);
  });
  return all;
}

// ── Helper: write full cache to Firestore ────────────────────────────
async function writeCache(allDashboards, totalUsers) {
  const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
  const cachedAt = new Date().toISOString();

  const chunks = [];
  for (let i = 0; i < allDashboards.length; i += CHUNK_SIZE) {
    chunks.push(allDashboards.slice(i, i + CHUNK_SIZE));
  }

  // Delete old chunks
  const oldChunks = await docRef.collection("chunks").listDocuments();
  if (oldChunks.length > 0) {
    // Firestore batch limit is 500
    for (let i = 0; i < oldChunks.length; i += 400) {
      const delBatch = db.batch();
      oldChunks.slice(i, i + 400).forEach((d) => delBatch.delete(d));
      await delBatch.commit();
    }
  }

  // Write metadata
  await docRef.set({
    total_users: totalUsers,
    total_chunks: chunks.length,
    cached_at: cachedAt,
  });

  // Write chunks
  for (let i = 0; i < chunks.length; i += 400) {
    const writeBatch = db.batch();
    chunks.slice(i, i + 400).forEach((chunk, idx) => {
      const chunkRef = docRef.collection("chunks").doc(`chunk_${i + idx}`);
      writeBatch.set(chunkRef, { dashboards: chunk });
    });
    await writeBatch.commit();
  }

  return { cachedAt, chunkCount: chunks.length };
}

// ── Main ─────────────────────────────────────────────────────────────
const SAVE_INTERVAL = 50; // save to Firestore every N users

async function main() {
  console.log("🔍 Fetching all users from Firebase Auth...\n");

  // 1. Get all users
  const users = [];
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    result.users.forEach((u) => {
      if (u.email) users.push({ uid: u.uid, email: u.email });
    });
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`✅ Found ${users.length} users with emails\n`);

  // 2. Read existing cache and build set of already-fetched user IDs
  console.log("📂 Reading existing cache from Firestore...\n");
  const existingDashboards = await readExistingCache();
  const cachedMap = new Map(); // user_id -> dashboard entry
  existingDashboards.forEach((d) => cachedMap.set(d.user_id, d));

  const alreadyCached = cachedMap.size;
  console.log(`   Found ${alreadyCached} users already in cache\n`);

  // 3. Filter to only users NOT yet fetched
  const remaining = users.filter((u) => !cachedMap.has(u.uid));
  console.log(`🚀 Need to fetch ${remaining.length} remaining users\n`);

  if (remaining.length === 0) {
    console.log("✅ All users already cached! Nothing to do.\n");
    process.exit(0);
  }

  // 4. Fetch remaining users one-by-one
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let newlyFetched = 0;

  for (let i = 0; i < remaining.length; i++) {
    const user = remaining[i];

    // Generate per-user token
    let token;
    try {
      token = await getIdTokenForUser(user.uid);
    } catch (err) {
      if (errorLogCount < 3) {
        errorLogCount++;
        console.error(
          `\n\n⚠️  TOKEN ERROR for ${user.email} (uid: ${user.uid}): ${err.message}\n`,
        );
      }
      cachedMap.set(user.uid, {
        user_id: user.uid,
        email: user.email,
        total_papers: 0,
        papers_by_source: {},
        total_outputs: {},
        papers: [],
        fetched_at: new Date().toISOString(),
        error: `Token error: ${err.message}`,
      });
      errorCount++;
      newlyFetched++;
      continue;
    }

    const result = await fetchUserDashboard(user.uid, user.email, token);
    cachedMap.set(user.uid, result);
    newlyFetched++;

    if (result.error) {
      errorCount++;
    } else {
      successCount++;
    }

    // Progress
    const total = remaining.length;
    const done = i + 1;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = ((done / total) * 100).toFixed(1);
    const eta =
      i > 0
        ? (((Date.now() - startTime) / done) * (total - done) / 1000).toFixed(0)
        : "?";

    process.stdout.write(
      `\r  [${pct}%] ${done}/${total}  ✓${successCount} ✗${errorCount}  ${elapsed}s elapsed  ~${eta}s remaining  | ${user.email.padEnd(40)}`,
    );

    // 5. Save progress every SAVE_INTERVAL users
    if (newlyFetched % SAVE_INTERVAL === 0) {
      process.stdout.write(`\n  💾 Saving progress (${cachedMap.size} total)...`);
      const allDashboards = Array.from(cachedMap.values());
      await writeCache(allDashboards, users.length);
      process.stdout.write(" done\n");
    }
  }

  console.log("\n");
  console.log(
    `📊 Done fetching: ${successCount} success, ${errorCount} errors (${alreadyCached} were already cached)\n`,
  );

  // 6. Final save
  console.log("💾 Final save to Firestore...\n");
  const allDashboards = Array.from(cachedMap.values());
  const { cachedAt, chunkCount } = await writeCache(allDashboards, users.length);

  console.log(`  📝 ${allDashboards.length} dashboards in ${chunkCount} chunks`);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ All done in ${totalTime}s`);
  console.log(`   Cached at: ${cachedAt}`);
  console.log(
    `   The website will now load this data instantly from Firestore.\n`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
