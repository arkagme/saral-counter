#!/usr/bin/env node

/**
 * Check the current state of the dev-swagger-user
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
    console.error("❌ Firebase credentials not found");
    process.exit(1);
  }
}

async function checkUser() {
  try {
    const uid = "dev-swagger-user";

    console.log(`🔍 Checking user: ${uid}\n`);

    // Get from Firebase Auth
    try {
      const userRecord = await admin.auth().getUser(uid);
      console.log("📋 Firebase Auth User Record:");
      console.log(`   UID: ${userRecord.uid}`);
      console.log(`   Email: ${userRecord.email || "(none)"}`);
      console.log(`   Email Verified: ${userRecord.emailVerified}`);
      console.log(`   Display Name: ${userRecord.displayName || "(none)"}`);
      console.log(`   Disabled: ${userRecord.disabled}`);
      console.log(`   Created: ${userRecord.metadata.creationTime}`);
      console.log(`   Last Sign In: ${userRecord.metadata.lastSignInTime}`);
      console.log(
        `   Providers: ${userRecord.providerData.map((p) => p.providerId).join(", ") || "none"}`,
      );
      console.log(
        `   Custom Claims: ${JSON.stringify(userRecord.customClaims || {})}`,
      );
    } catch (error) {
      console.log(`❌ User not found in Firebase Auth: ${error.message}`);
    }

    // Get from cache
    console.log("\n📦 Cached Dashboard:");
    const db = admin.firestore();
    const docRef = db.collection("analytics_cache").doc("user_dashboards");
    const chunksSnapshot = await docRef
      .collection("chunks")
      .orderBy("__name__")
      .get();

    let found = false;
    chunksSnapshot.docs.forEach((chunkDoc) => {
      const chunkData = chunkDoc.data();
      if (chunkData.dashboards) {
        const user = chunkData.dashboards.find((d) => d.user_id === uid);
        if (user) {
          found = true;
          console.log(`   UID: ${user.user_id}`);
          console.log(`   Email: ${user.email || "(none)"}`);
          console.log(`   Total Papers: ${user.total_papers}`);
          console.log(`   Fetched At: ${user.fetched_at}`);
          console.log(`   Error: ${user.error || "none"}`);
          if (user.papers && user.papers.length > 0) {
            console.log(`   Papers:`);
            user.papers.forEach((p) => {
              console.log(
                `      - ${p.title.substring(0, 50)}... (${p.source_type})`,
              );
            });
          }
        }
      }
    });

    if (!found) {
      console.log("   Not found in cache");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    process.exit(0);
  }
}

checkUser();
