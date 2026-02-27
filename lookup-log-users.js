#!/usr/bin/env node

/**
 * Looks up Firebase Auth user details for a list of UIDs extracted from logs.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ── UIDs from the logs ───────────────────────────────────────────────
const LOG_UIDS = [
  "NA17soB1rId2zWpsduQtV0hCGoi1",
  "N8SYoTCSydQJkw9LB5WeX0MqLGu1",
  "NArc8XnmRyTuD3Rjc2HibIu1Gnr2",
  "NDgriCsQs4ZdvdNBxKcXc8JHv603",
  "NC5DVHB9N5Rbi8yIaAsxBlEMtGw1",
  "NAJGDlHi2senf6AlS7wo1r04N3m1",
  "NBcca6Q1ZJgr8eSBdb8IB8C73EB3",
  "NCuSbtKnelQ35NGg1PITY5c1ttt2",
  "NPkiCUQwzrTP5IZ2LtDEzLKPyb73",
];

// ── Load .env.local ──────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        )
          value = value.slice(1, -1);
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

async function run() {
  console.log(`Looking up ${LOG_UIDS.length} UIDs from logs...\n`);
  console.log("─".repeat(100));
  console.log(
    `${"#".padStart(2)}  ${"UID".padEnd(30)} ${"EMAIL".padEnd(38)} ${"CREATED".padEnd(22)} LAST SIGN-IN`,
  );
  console.log("─".repeat(100));

  const results = await Promise.all(
    LOG_UIDS.map(async (uid) => {
      try {
        return await admin.auth().getUser(uid);
      } catch {
        return { uid, _notFound: true };
      }
    }),
  );

  results.forEach((u, i) => {
    if (u._notFound) {
      console.log(
        `${String(i + 1).padStart(2)}  ${u.uid.padEnd(30)} ${"(NOT FOUND IN FIREBASE AUTH)".padEnd(38)}`,
      );
      return;
    }
    const email = (u.email || "(no email)").padEnd(38);
    const created = new Date(u.metadata.creationTime)
      .toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })
      .padEnd(22);
    const lastSignIn = u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: false,
        })
      : "never";
    console.log(
      `${String(i + 1).padStart(2)}  ${u.uid.padEnd(30)} ${email} ${created} ${lastSignIn}`,
    );
  });

  console.log("─".repeat(100));

  // ── Explain WHY the backend was hammered ──────────────────────────
  console.log(`
WHY WAS THE BACKEND HIT ALL AT ONCE?
─────────────────────────────────────────────────────────────────────
All ${LOG_UIDS.length} requests hit at 07:50:15 (same second) from IP 106.192.4.249.

IP 106.192.4.249 is the Vercel edge/serverless IP — this is YOUR tracker app
calling back into the FastAPI backend, not a rogue client.

The trigger was one of:
  1. "Refresh All" button clicked in the User Dashboards panel
     → calls GET /api/analytics/user-dashboards?force=true
     → Vercel fetches ALL 5000+ user dashboards in batches of 10
     → results in hundreds of rapid-fire calls to your FastAPI backend

  2. fetch-user-dashboards.js was run locally
     → same flood, from your machine IP

The UIDs above are just whichever batch happened to be in-flight at
07:50:15 (they all start with "N" — alphabetically consecutive UIDs,
confirming they came from a sequential batch loop).

RECOMMENDATION:
  • Avoid hitting "Refresh All" unless necessary — the cache is already
    auto-updated per user via the /api/analytics/cache-update webhook.
  • If you need a full rebuild, use: node fetch-user-dashboards.js
    (it rate-limits itself with batch_size=10, one batch at a time).
─────────────────────────────────────────────────────────────────────`);

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
