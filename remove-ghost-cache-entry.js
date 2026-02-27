#!/usr/bin/env node
/**
 * Removes ghost user entries from the Firestore dashboard cache.
 * A ghost is a user that exists in the cache but NO LONGER exists in Firebase Auth.
 *
 * Usage:
 *   node remove-ghost-cache-entry.js           # dry-run (no writes)
 *   node remove-ghost-cache-entry.js --fix     # actually removes ghosts
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DRY_RUN = !process.argv.includes("--fix");

// ─── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    });
}

// ─── Init Firebase Admin ──────────────────────────────────────────────────────
const serviceAccountPath = path.join(
  __dirname,
  "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
);
if (!admin.apps.length) {
  if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(
    DRY_RUN
      ? "🔍 DRY-RUN mode — no writes will happen. Pass --fix to apply changes.\n"
      : "🔧 FIX mode — ghost entries will be removed from the cache.\n",
  );

  const db = admin.firestore();
  const docRef = db.collection("analytics_cache").doc("user_dashboards");

  // ── Step 1: collect all Firebase Auth UIDs/emails ──────────────────────────
  console.log("Step 1: Fetching all live Firebase Auth users...");
  const liveEmails = new Set();
  const liveUIDs = new Set();
  let pageToken;
  let totalAuth = 0;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    result.users.forEach((u) => {
      totalAuth++;
      if (u.email) liveEmails.add(u.email.toLowerCase());
      liveUIDs.add(u.uid);
    });
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(
    `  → ${totalAuth} total Firebase Auth users (${liveEmails.size} with email)\n`,
  );

  // ── Step 2: read all cache chunks ─────────────────────────────────────────
  console.log("Step 2: Reading Firestore cache chunks...");
  const chunksSnap = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();
  console.log(`  → ${chunksSnap.size} chunk documents found\n`);

  // ── Step 3: identify ghosts ───────────────────────────────────────────────
  console.log("Step 3: Identifying ghost entries...");
  const ghosts = []; // { chunkId, email, user_id }
  const chunkPatches = new Map(); // chunkId → filtered dashboards array

  chunksSnap.docs.forEach((chunkDoc) => {
    const data = chunkDoc.data();
    const dashboards = data.dashboards || [];
    const cleaned = [];
    let foundInChunk = 0;

    dashboards.forEach((d) => {
      const emailLower = (d.email || "").toLowerCase();
      const isGhost =
        (d.email && !liveEmails.has(emailLower)) ||
        (d.user_id && !liveUIDs.has(d.user_id));

      if (isGhost) {
        ghosts.push({
          chunkId: chunkDoc.id,
          email: d.email,
          user_id: d.user_id,
        });
        foundInChunk++;
      } else {
        cleaned.push(d);
      }
    });

    if (foundInChunk > 0) {
      chunkPatches.set(chunkDoc.id, cleaned);
    }
  });

  if (ghosts.length === 0) {
    console.log("  ✅ No ghost entries found — cache is clean.\n");
    process.exit(0);
  }

  console.log(`  ⚠️  Found ${ghosts.length} ghost(s):`);
  ghosts.forEach((g) =>
    console.log(
      `     • email="${g.email || "(none)"}"  uid="${g.user_id}"  chunk=${g.chunkId}`,
    ),
  );
  console.log();

  if (DRY_RUN) {
    console.log("Dry-run complete. Run with --fix to remove these entries.\n");
    process.exit(0);
  }

  // ── Step 4: write patched chunks back ─────────────────────────────────────
  console.log("Step 4: Writing cleaned chunks back to Firestore...");

  for (const [chunkId, cleanedDashboards] of chunkPatches.entries()) {
    const chunkRef = docRef.collection("chunks").doc(chunkId);
    await chunkRef.update({ dashboards: cleanedDashboards });
    console.log(
      `  ✅ Updated ${chunkId} (removed ${
        (chunksSnap.docs.find((d) => d.id === chunkId)?.data()?.dashboards
          ?.length || 0) - cleanedDashboards.length
      } ghost(s))`,
    );
  }

  // ── Step 5: update metadata total_users ────────────────────────────────────
  const doc = await docRef.get();
  const oldMeta = doc.data() || {};
  const newTotal = (oldMeta.total_users || 0) - ghosts.length;

  await docRef.update({
    total_users: newTotal,
    last_ghost_purge: new Date().toISOString(),
  });

  console.log(
    `\n  ✅ Updated metadata: total_users ${oldMeta.total_users} → ${newTotal}`,
  );
  console.log(
    `\n✅ Done — removed ${ghosts.length} ghost(s) from cache. Cache now has ${newTotal} users.\n`,
  );
  process.exit(0);
})().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
