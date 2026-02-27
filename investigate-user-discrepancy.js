#!/usr/bin/env node

/**
 * Investigates why Platform Stats/User Dashboards shows 5147 users
 * but Live User Count shows 5146.
 *
 * Finds the user(s) that might be causing the discrepancy.
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

async function getAllUsers() {
  console.log("📊 Fetching all Firebase Auth users...\n");

  const allUsers = [];
  let pageToken;

  do {
    const listUsersResult = await admin.auth().listUsers(1000, pageToken);
    allUsers.push(...listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  return allUsers;
}

async function getCachedDashboards() {
  console.log("📦 Fetching cached user dashboards from Firestore...\n");

  const db = admin.firestore();
  const docRef = db.collection("analytics_cache").doc("user_dashboards");

  const doc = await docRef.get();
  if (!doc.exists) {
    console.log("⚠️  No cached dashboards found");
    return [];
  }

  // Read dashboards from chunks
  const chunksSnapshot = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();
  const allDashboards = [];
  chunksSnapshot.docs.forEach((chunkDoc) => {
    const chunkData = chunkDoc.data();
    if (chunkData.dashboards) {
      allDashboards.push(...chunkData.dashboards);
    }
  });

  return allDashboards;
}

async function investigate() {
  try {
    // 1. Get all users from Firebase Auth
    const allUsers = await getAllUsers();
    console.log(`✅ Total users in Firebase Auth: ${allUsers.length}`);

    // 2. Filter users with emails (Live Count logic)
    const usersWithEmail = allUsers.filter((u) => u.email);
    console.log(`✅ Users with email (Live Count): ${usersWithEmail.length}`);

    // 3. Look for any anomalies
    const usersWithoutEmail = allUsers.filter((u) => !u.email);
    console.log(`📋 Users WITHOUT email: ${usersWithoutEmail.length}`);

    if (usersWithoutEmail.length > 0) {
      console.log("\n👤 Users without email:");
      usersWithoutEmail.forEach((u) => {
        console.log(
          `   - UID: ${u.uid}, Provider: ${u.providerData?.map((p) => p.providerId).join(", ") || "none"}`,
        );
      });
    }

    // 4. Check for duplicate emails
    const emailMap = new Map();
    const duplicateEmails = [];

    usersWithEmail.forEach((u) => {
      const email = u.email.toLowerCase();
      if (emailMap.has(email)) {
        duplicateEmails.push({
          email: u.email,
          users: [emailMap.get(email), u],
        });
      } else {
        emailMap.set(email, u);
      }
    });

    if (duplicateEmails.length > 0) {
      console.log(`\n⚠️  Found ${duplicateEmails.length} duplicate email(s):`);
      duplicateEmails.forEach((dup) => {
        console.log(`   Email: ${dup.email}`);
        dup.users.forEach((u) => {
          console.log(
            `      - UID: ${u.uid}, Created: ${u.metadata.creationTime}`,
          );
        });
      });
    } else {
      console.log("\n✅ No duplicate emails found");
    }

    // 5. Get cached dashboards
    const cachedDashboards = await getCachedDashboards();
    console.log(`\n✅ Users in cached dashboards: ${cachedDashboards.length}`);

    // 6. Compare cached vs live
    if (cachedDashboards.length > 0) {
      const cachedUserIds = new Set(cachedDashboards.map((d) => d.user_id));
      const liveUserIds = new Set(usersWithEmail.map((u) => u.uid));

      // Users in cache but not in live
      const inCacheNotLive = [...cachedUserIds].filter(
        (uid) => !liveUserIds.has(uid),
      );
      if (inCacheNotLive.length > 0) {
        console.log(
          `\n⚠️  Users in CACHE but NOT in Live Count: ${inCacheNotLive.length}`,
        );
        inCacheNotLive.forEach((uid) => {
          const cached = cachedDashboards.find((d) => d.user_id === uid);
          console.log(`   - UID: ${uid}`);
          console.log(`     Email: ${cached?.email || "(none)"}`);
          console.log(`     Papers: ${cached?.total_papers || 0}`);
        });
      }

      // Users in live but not in cache
      const inLiveNotCache = [...liveUserIds].filter(
        (uid) => !cachedUserIds.has(uid),
      );
      if (inLiveNotCache.length > 0) {
        console.log(
          `\n⚠️  Users in Live Count but NOT in CACHE: ${inLiveNotCache.length}`,
        );
        inLiveNotCache.slice(0, 5).forEach((uid) => {
          const user = usersWithEmail.find((u) => u.uid === uid);
          console.log(`   - UID: ${uid}, Email: ${user?.email}`);
        });
        if (inLiveNotCache.length > 5) {
          console.log(`   ... and ${inLiveNotCache.length - 5} more`);
        }
      }
    }

    // 7. Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Firebase Auth users: ${allUsers.length}`);
    console.log(`Live Count (with email): ${usersWithEmail.length}`);
    console.log(`Cached dashboards: ${cachedDashboards.length}`);
    console.log(
      `Discrepancy: ${Math.abs(usersWithEmail.length - cachedDashboards.length)}`,
    );

    // 8. Check for weird email values
    console.log("\n🔍 Checking for unusual email values...");
    const suspiciousEmails = usersWithEmail.filter((u) => {
      const email = u.email;
      return (
        !email ||
        email.trim() === "" ||
        email.length < 3 ||
        !email.includes("@") ||
        email.trim() !== email
      );
    });

    if (suspiciousEmails.length > 0) {
      console.log(
        `⚠️  Found ${suspiciousEmails.length} user(s) with suspicious email values:`,
      );
      suspiciousEmails.forEach((u) => {
        console.log(`   - UID: ${u.uid}`);
        console.log(`     Email: "${u.email}" (length: ${u.email?.length})`);
        console.log(`     Email (repr): ${JSON.stringify(u.email)}`);
      });
    } else {
      console.log("✅ All emails look valid");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

investigate();
