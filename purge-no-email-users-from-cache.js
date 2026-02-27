#!/usr/bin/env node

/**
 * Removes any user from the Firestore dashboard cache whose UID has
 * no email address in Firebase Auth right now.
 *
 * This keeps the cache in sync with the "Live User Count" logic
 * (which also only counts users WITH an email).
 *
 * No npm run dev / no Next.js server needed.
 * Usage: node purge-no-email-users-from-cache.js
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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
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
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    console.error("❌ Firebase credentials not found");
    process.exit(1);
  }
}

const db = admin.firestore();
const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";
const CHUNK_SIZE = 100;

// ── 1. Get all UIDs that have an email in Firebase Auth ──────────────
async function getValidUids() {
  const validUids = new Set();
  let pageToken;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    result.users.forEach((u) => {
      if (u.email) validUids.add(u.uid);
    });
    pageToken = result.pageToken;
  } while (pageToken);
  return validUids;
}

// ── 2. Read current cache from Firestore ────────────────────────────
async function readCache(docRef) {
  const chunksSnap = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();
  const all = [];
  chunksSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.dashboards) all.push(...data.dashboards);
  });
  return all;
}

// ── 3. Write cleaned cache back to Firestore ────────────────────────
async function writeCache(docRef, dashboards) {
  const cachedAt = new Date().toISOString();

  // Split into chunks (Firestore 1 MB doc limit)
  const chunks = [];
  for (let i = 0; i < dashboards.length; i += CHUNK_SIZE) {
    chunks.push(dashboards.slice(i, i + CHUNK_SIZE));
  }

  // Delete old chunk docs first
  const oldDocs = await docRef.collection("chunks").listDocuments();
  if (oldDocs.length > 0) {
    const delBatch = db.batch();
    oldDocs.forEach((ref) => delBatch.delete(ref));
    await delBatch.commit();
    console.log(`   🗑️  Deleted ${oldDocs.length} old chunk(s)`);
  }

  // Write metadata doc
  await docRef.set({
    total_users: dashboards.length,
    total_chunks: chunks.length,
    cached_at: cachedAt,
  });

  // Write new chunk docs
  const writeBatch = db.batch();
  chunks.forEach((chunk, idx) => {
    const ref = docRef.collection("chunks").doc(`chunk_${idx}`);
    writeBatch.set(ref, { dashboards: chunk });
  });
  await writeBatch.commit();

  console.log(
    `   ✅ Wrote ${chunks.length} chunk(s) — ${dashboards.length} users`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────
async function run() {
  try {
    console.log("Step 1: Loading Firebase Auth users with email...");
    const validUids = await getValidUids();
    console.log(`   ✅ ${validUids.size} users have an email in Firebase Auth`);

    const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);

    console.log("\nStep 2: Reading current Firestore cache...");
    const cached = await readCache(docRef);
    console.log(`   ✅ ${cached.length} entries in cache`);

    // Find which ones would be removed
    const toRemove = cached.filter((d) => !validUids.has(d.user_id));
    const cleaned = cached.filter((d) => validUids.has(d.user_id));

    if (toRemove.length === 0) {
      console.log("\n✅ Cache is already clean — no phantom users found.");
      process.exit(0);
    }

    console.log(`\n⚠️  Found ${toRemove.length} user(s) to purge:`);
    toRemove.forEach((u) => {
      console.log(
        `   - UID: ${u.user_id}  |  Cached email: "${u.email || "(none)"}"  |  Papers: ${u.total_papers}`,
      );
    });

    console.log("\nStep 3: Writing cleaned cache back to Firestore...");
    await writeCache(docRef, cleaned);

    console.log("\n" + "=".repeat(60));
    console.log("✅ DONE");
    console.log(`   Before : ${cached.length} users`);
    console.log(`   Removed: ${toRemove.length} user(s)`);
    console.log(`   After  : ${cleaned.length} users`);
    console.log(
      "   Live Count, Platform Stats & User Dashboards should now all agree.",
    );
    console.log("=".repeat(60));
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
