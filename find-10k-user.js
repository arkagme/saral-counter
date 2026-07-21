#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccountPath = path.join(
    __dirname,
    "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
  );

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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
    console.error(
      "❌ Firebase credentials not found. Please ensure either:\n" +
        "   1. saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json exists, or\n" +
        "   2. .env.local file with FIREBASE_* variables exists",
    );
    process.exit(1);
  }
}

async function fetchAllUsers() {
  const allUsers = [];
  let pageToken;

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    allUsers.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  return allUsers;
}

function formatUser(user, rank) {
  const dt = new Date(user.metadata.creationTime);
  const email = user.email || "(no email)";
  const providers = (user.providerData || []).map((p) => p.providerId).join(", ") || "none";
  return {
    rank,
    uid: user.uid,
    email,
    creationTime: dt.toISOString(),
    creationTimeLocal: dt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    providers,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
  };
}

function printUser(label, info) {
  console.log(`  ${label}:`);
  console.log(`    UID              : ${info.uid}`);
  console.log(`    Email            : ${info.email}`);
  console.log(`    Sign-up (UTC)    : ${info.creationTime}`);
  console.log(`    Sign-up (IST)    : ${info.creationTimeLocal}`);
  console.log(`    Providers        : ${info.providers}`);
  console.log(`    Email verified   : ${info.emailVerified}`);
  console.log(`    Disabled         : ${info.disabled}`);
  console.log();
}

async function find10kUser() {
  console.log("🔍 Fetching all users from Firebase Auth...\n");

  try {
    const allUsers = await fetchAllUsers();
    console.log(`✅ Fetched ${allUsers.length.toLocaleString()} total accounts\n`);

    // Keep only users with email, dedupe by lowercase email (keep earliest creation)
    const seen = new Map();
    for (const user of allUsers) {
      if (!user.email) continue;
      const lower = user.email.toLowerCase();
      const existing = seen.get(lower);
      if (!existing || user.metadata.creationTime < existing.metadata.creationTime) {
        seen.set(lower, user);
      }
    }

    const uniqueUsers = [...seen.values()].sort(
      (a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime),
    );

    console.log(`📧 Users with email        : ${allUsers.filter((u) => u.email).length.toLocaleString()}`);
    console.log(`🔑 Unique email addresses  : ${uniqueUsers.length.toLocaleString()}\n`);

    if (uniqueUsers.length < 10000) {
      console.log(`⚠️  Only ${uniqueUsers.length.toLocaleString()} unique email users exist — haven't hit 10k yet!\n`);
      return;
    }

    // Rank is 1-indexed; index 9999 = 10,000th user
    const targetIndex = 9999;

    console.log("────────────────────────────────────────────");
    console.log("  🎯 THE 10,000th USER");
    console.log("────────────────────────────────────────────\n");

    printUser(`#10,000 (index ${targetIndex})`, formatUser(uniqueUsers[targetIndex], 10000));

    console.log("────────────────────────────────────────────");
    console.log("  📋 Surrounding sign-ups (for context)");
    console.log("────────────────────────────────────────────\n");

    const indices = [9997, 9998, 9999, 10000, 10001];
    if (uniqueUsers.length > 10001) indices.push(10002);

    for (const idx of indices) {
      if (idx >= 0 && idx < uniqueUsers.length) {
        const rank = idx + 1;
        printUser(`#${rank.toLocaleString()} (index ${idx})`, formatUser(uniqueUsers[idx], rank));
      }
    }

    console.log("────────────────────────────────────────────");
    console.log("  📊 Summary");
    console.log("────────────────────────────────────────────\n");
    console.log(`  Total Firebase Auth accounts : ${allUsers.length.toLocaleString()}`);
    console.log(`  Users with email            : ${allUsers.filter((u) => u.email).length.toLocaleString()}`);
    console.log(`  Unique email users          : ${uniqueUsers.length.toLocaleString()}`);
    console.log(`  First sign-up               : ${uniqueUsers[0]?.email} (${new Date(uniqueUsers[0]?.metadata.creationTime).toISOString()})`);
    console.log(`  Last sign-up                : ${uniqueUsers.at(-1)?.email} (${new Date(uniqueUsers.at(-1)?.metadata.creationTime).toISOString()})`);

    // ── All-accounts ranking (for comparison with other scripts) ──
    console.log();
    console.log("────────────────────────────────────────────");
    console.log("  🔄 All-accounts ranking (no email filter)");
    console.log("────────────────────────────────────────────\n");

    if (allUsers.length >= 10000) {
      console.log("  Note: The Go script counts ALL Firebase Auth records (including no-email");
      console.log("  service/system accounts). Since /api/count filters .filter(u => u.email), the");
      console.log("  dashboard count excludes those. The 2 no-email accounts shift ranking by 2.");
      console.log();
      console.log("  Accounts without email in this project:");
      allUsers.filter((u) => !u.email).forEach((u) => {
        const idx = allUsers.indexOf(u) + 1;
        console.log(`    All-accounts rank #${idx.toLocaleString()}  UID: ${u.uid}  Created: ${new Date(u.metadata.creationTime).toISOString()}`);
      });
      console.log();
      for (let i = 9995; i <= 10005 && i < allUsers.length; i++) {
        const rank = i + 1;
        const u = allUsers[i];
        const label = u.email ? u.email.padEnd(40) : "(no email)".padEnd(40);
        console.log(`    #${rank.toLocaleString()}  ${label} ${new Date(u.metadata.creationTime).toISOString()}`);
      }
    }

    // ── Last sign-ups ──
    console.log();
    if (uniqueUsers.length >= 10000) {
      console.log("  ⏱️  Last 20 unique-email sign-ups:");
      const recently = uniqueUsers.slice(-20);
      recently.forEach((u, i) => {
        const rank = uniqueUsers.length - 20 + i + 1;
        console.log(`     #${rank.toLocaleString()}  ${u.email.padEnd(40)} ${new Date(u.metadata.creationTime).toISOString()}`);
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

find10kUser();
