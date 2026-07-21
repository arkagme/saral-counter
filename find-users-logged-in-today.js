#!/usr/bin/env node

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
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

// Parse internal team emails (comma-separated, lowercased)
const internalEmails = new Set(
  (process.env.INTERNAL_TEAM_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

// ── Init Firebase Admin ──────────────────────────────────────────────
if (!admin.apps.length) {
  const saPath = path.join(
    __dirname,
    "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
  );
  if (fs.existsSync(saPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
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

// ── Time window (IST → UTC) ─────────────────────────────────────────
// July 21, 2026  11:30 AM – 1:00 PM IST  =  UTC 06:00 – 07:30
const WINDOW_START = new Date("2026-07-21T06:00:00.000Z");
const WINDOW_END   = new Date("2026-07-21T07:30:00.000Z");

function inWindow(d) {
  return d >= WINDOW_START && d <= WINDOW_END;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function toIST(utcDate) {
  return utcDate.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ── Main ─────────────────────────────────────────────────────────────
async function findUsersLoggedInToday() {
  console.log("🔍 Fetching all users from Firebase Auth...\n");

  try {
    // Fetch all users
    const allUsers = [];
    let pageToken;
    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      allUsers.push(...result.users);
      pageToken = result.pageToken;
    } while (pageToken);

    console.log(`✅ Fetched ${allUsers.length.toLocaleString()} total accounts\n`);

    // Classify each user
    const rows = []; // { email, type, utc, ist }

    for (const user of allUsers) {
      if (!user.email) continue;

      const emailLower = user.email.toLowerCase();
      if (internalEmails.has(emailLower)) continue;

      const created = parseDate(user.metadata.creationTime);
      const lastSignIn = parseDate(user.metadata.lastSignInTime);

      let type, ts;
      if (created && inWindow(created)) {
        type = "New Signup";
        ts = created;
      } else if (lastSignIn && inWindow(lastSignIn)) {
        type = "Returning Login";
        ts = lastSignIn;
      } else {
        continue;
      }

      rows.push({
        email: user.email,
        type,
        utc: ts.toISOString(),
        ist: toIST(ts),
      });
    }

    // Sort by timestamp ascending
    rows.sort((a, b) => a.utc.localeCompare(b.utc));

    // ── Output ──────────────────────────────────────────────────────
    const newUsers   = rows.filter((r) => r.type === "New Signup");
    const returning  = rows.filter((r) => r.type === "Returning Login");

    console.log(`📧 New signups in window     : ${newUsers.length.toLocaleString()}`);
    console.log(`🔁 Returning logins in window : ${returning.length.toLocaleString()}`);
    console.log(`📊 Total unique users        : ${rows.length.toLocaleString()}\n`);

    if (rows.length === 0) {
      console.log("No users found in the 11:30–13:00 IST window.");
      return;
    }

    // Write CSV
    let csv = "Email,Type,Timestamp (UTC),Timestamp (IST)\n";
    for (const r of rows) {
      const escaped = r.email.includes(",") ? `"${r.email}"` : r.email;
      csv += `${escaped},${r.type},${r.utc},${r.ist}\n`;
    }

    const outName = `users-logged-in-2026-07-21-1130-1300.csv`;
    const outPath = path.join(__dirname, outName);
    fs.writeFileSync(outPath, csv, "utf8");

    console.log(`✅ Written to ${outName}\n`);

    // Print first few + last few
    console.log("── First 5 ──");
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.ist}  ${r.type.padEnd(16)}  ${r.email}`);
    }
    if (rows.length > 10) {
      console.log("  ...");
      console.log(`── Last 5 ──`);
      for (const r of rows.slice(-5)) {
        console.log(`  ${r.ist}  ${r.type.padEnd(16)}  ${r.email}`);
      }
    }

    // Summary
    console.log(`\n📁 ${outPath}`);
    console.log(`   ${rows.length} users (${newUsers.length} new, ${returning.length} returning)`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

findUsersLoggedInToday();
