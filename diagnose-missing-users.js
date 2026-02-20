#!/usr/bin/env node

/**
 * Diagnostic: Check why 4 specific users are missing/wrong in the dashboard cache.
 *
 * For each user:
 *   1. Look up in Firebase Auth (get UID)
 *   2. Check what the Firestore cache has for them
 *   3. Call the per-user API to see what it returns
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Target emails to investigate
const TARGET_EMAILS = [
  "swatirajtyagi7@gmail.com",
  "bonusairam5@gmail.com",
  "themidnightdrafts@gmail.com",
  "kesarikhushi1@gmail.com",
];

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
  console.log("DIAGNOSTIC: Missing Users in Dashboard Cache");
  console.log("=" .repeat(70));

  // STEP 1: Find these users in Firebase Auth
  console.log("\n📋 STEP 1: Looking up target emails in Firebase Auth...\n");
  const userMap = {}; // email -> { uid, email }

  for (const email of TARGET_EMAILS) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      userMap[email] = { uid: userRecord.uid, email: userRecord.email };
      console.log(`  ✅ ${email} → UID: ${userRecord.uid}`);
    } catch (err) {
      console.log(`  ❌ ${email} → NOT FOUND in Firebase Auth: ${err.message}`);
      userMap[email] = null;
    }
  }

  // STEP 2: Check what the Firestore cache has for them
  console.log("\n📦 STEP 2: Checking Firestore dashboard cache...\n");

  const docRef = db.collection("analytics_cache").doc("user_dashboards");
  const chunksSnapshot = await docRef.collection("chunks").orderBy("__name__").get();

  const cacheEntries = {}; // uid -> cached entry
  let totalCachedUsers = 0;
  chunksSnapshot.docs.forEach((chunkDoc) => {
    const data = chunkDoc.data();
    if (data.dashboards) {
      data.dashboards.forEach((d) => {
        totalCachedUsers++;
        // Check if this is one of our target users
        for (const email of TARGET_EMAILS) {
          const user = userMap[email];
          if (user && (d.user_id === user.uid || d.email === email)) {
            cacheEntries[email] = { ...d, chunk: chunkDoc.id };
          }
        }
      });
    }
  });

  console.log(`  Total users in cache: ${totalCachedUsers}\n`);

  for (const email of TARGET_EMAILS) {
    const cached = cacheEntries[email];
    if (cached) {
      console.log(`  📁 ${email} (in ${cached.chunk}):`);
      console.log(`     user_id:      ${cached.user_id}`);
      console.log(`     email:        ${cached.email}`);
      console.log(`     total_papers: ${cached.total_papers}`);
      console.log(`     total_outputs: ${JSON.stringify(cached.total_outputs)}`);
      console.log(`     papers count: ${cached.papers?.length || 0}`);
      console.log(`     error:        ${cached.error || "(none)"}`);
      console.log(`     fetched_at:   ${cached.fetched_at}`);
    } else {
      console.log(`  ❌ ${email} → NOT IN CACHE AT ALL`);
    }
    console.log("");
  }

  // STEP 3: Call the per-user API for each to see what it returns NOW
  console.log("🌐 STEP 3: Calling external API for each user...\n");

  for (const email of TARGET_EMAILS) {
    const user = userMap[email];
    if (!user) {
      console.log(`  ⏭️  Skipping ${email} (not in Firebase Auth)\n`);
      continue;
    }

    try {
      const token = await getIdTokenForUser(user.uid);
      const url = `https://testload.democratiseresearch.in/api/api/analytics/user/${user.uid}/dashboard`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log(`  🔍 ${email} (${user.uid}):`);
      console.log(`     API Status: ${resp.status} ${resp.statusText}`);

      if (resp.ok) {
        const data = await resp.json();
        console.log(`     total_papers:  ${data.total_papers}`);
        console.log(`     total_outputs: ${JSON.stringify(data.total_outputs)}`);
        console.log(`     papers count:  ${data.papers?.length || 0}`);
        if (data.papers && data.papers.length > 0) {
          data.papers.forEach((p, i) => {
            console.log(`       [${i+1}] ${p.title?.slice(0, 50) || "no title"} | status: ${p.status} | outputs: ${p.outputs?.join(", ") || "none"}`);
          });
        }
      } else {
        const body = await resp.text();
        console.log(`     Error Body: ${body.slice(0, 300)}`);
      }
    } catch (err) {
      console.log(`  ❌ ${email}: ${err.message}`);
    }
    console.log("");
  }

  // STEP 4: Cross-check — look up these emails directly in Firestore paper_metadata
  console.log("📄 STEP 4: Checking Firestore paper_metadata for these users...\n");

  for (const email of TARGET_EMAILS) {
    const user = userMap[email];
    if (!user) continue;

    const papersSnapshot = await db
      .collection("paper_metadata")
      .where("user_id", "==", user.uid)
      .get();

    console.log(`  ${email} (${user.uid}):`);
    console.log(`     Papers in Firestore: ${papersSnapshot.size}`);
    papersSnapshot.docs.forEach((doc) => {
      const d = doc.data();
      console.log(`       - ${doc.id}: "${d.metadata?.title?.slice(0, 50) || "no title"}" | outputs: ${d.outputs ? Object.keys(d.outputs).join(", ") : "none"}`);
    });
    console.log("");
  }

  console.log("=" .repeat(70));
  console.log("DIAGNOSTIC COMPLETE");
  console.log("=" .repeat(70));

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
