#!/usr/bin/env node

/**
 * Test: Simulate what the refresh button does
 * 1. Call the user-dashboard API route locally (or the external API directly)
 * 2. Check if the cache was updated
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

const saPath = path.join(
  __dirname,
  "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
);
if (!admin.apps.length) {
  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const db = admin.firestore();
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

// Test user: bonusairam5@gmail.com
const TEST_UID = "7NR7yzOVeSeYwDNFDNuRhTTigwn2";
const TEST_EMAIL = "bonusairam5@gmail.com";

async function readCacheForUser(uid) {
  const docRef = db.collection("analytics_cache").doc("user_dashboards");
  const chunks = await docRef.collection("chunks").get();
  for (const chunk of chunks.docs) {
    const dashboards = chunk.data().dashboards;
    const found = dashboards.find((d) => d.user_id === uid);
    if (found) {
      return { ...found, _chunk: chunk.id };
    }
  }
  return null;
}

async function main() {
  console.log("=== Testing refresh flow ===\n");

  // Step 1: Read current cache
  console.log("1. Current cache for", TEST_EMAIL);
  const before = await readCacheForUser(TEST_UID);
  if (before) {
    console.log(
      `   total_papers: ${before.total_papers}, outputs: ${JSON.stringify(before.total_outputs)}, chunk: ${before._chunk}`,
    );
  } else {
    console.log("   NOT IN CACHE");
  }

  // Step 2: Call the external API directly (same as what user-dashboard/route.ts does)
  console.log("\n2. Calling external API...");
  const customToken = await admin.auth().createCustomToken(TEST_UID);
  const tokenResp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const tokenData = await tokenResp.json();
  const idToken = tokenData.idToken;

  const apiResp = await fetch(
    `https://overhaulapi.democratiseresearch.in/api/analytics/user/${TEST_UID}/dashboard`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  console.log(`   API status: ${apiResp.status}`);
  if (apiResp.ok) {
    const apiData = await apiResp.json();
    console.log(`   total_papers: ${apiData.total_papers}`);
    console.log(`   total_outputs: ${JSON.stringify(apiData.total_outputs)}`);
    console.log(`   papers_by_source: ${JSON.stringify(apiData.papers_by_source)}`);
    console.log(`   papers count: ${apiData.papers?.length}`);
    console.log(`   Response keys: ${Object.keys(apiData).join(", ")}`);
  } else {
    console.log(`   Error: ${await apiResp.text()}`);
  }

  // Step 3: Now simulate what the route does — update the cache
  console.log("\n3. Simulating cache update (like user-dashboard/route.ts)...");
  const apiData2 = apiResp.ok
    ? await (
        await fetch(
          `https://overhaulapi.democratiseresearch.in/api/analytics/user/${TEST_UID}/dashboard`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
          },
        )
      ).json()
    : null;

  if (apiData2) {
    const docRef = db.collection("analytics_cache").doc("user_dashboards");
    const chunksSnapshot = await docRef.collection("chunks").get();
    let updated = false;
    for (const chunkDoc of chunksSnapshot.docs) {
      const chunkData = chunkDoc.data();
      const dashboards = chunkData.dashboards;
      const userIndex = dashboards.findIndex((d) => d.user_id === TEST_UID);
      if (userIndex !== -1) {
        console.log(
          `   Found in ${chunkDoc.id} at index ${userIndex}`,
        );
        console.log(
          `   BEFORE: papers=${dashboards[userIndex].total_papers}, outputs=${JSON.stringify(dashboards[userIndex].total_outputs)}`,
        );

        dashboards[userIndex] = {
          ...dashboards[userIndex],
          total_papers: apiData2.total_papers || 0,
          papers_by_source: apiData2.papers_by_source || {},
          total_outputs: apiData2.total_outputs || {},
          papers: apiData2.papers || [],
          fetched_at: new Date().toISOString(),
          error: undefined,
        };

        console.log(
          `   AFTER:  papers=${dashboards[userIndex].total_papers}, outputs=${JSON.stringify(dashboards[userIndex].total_outputs)}`,
        );
        // Don't actually write — this is just a diagnostic
        updated = true;
        break;
      }
    }
    if (!updated) {
      console.log("   ❌ USER NOT FOUND IN ANY CHUNK — this is the bug!");
    }
  }

  // Step 4: Re-read cache to confirm
  console.log("\n4. Re-reading cache...");
  const after = await readCacheForUser(TEST_UID);
  if (after) {
    console.log(
      `   total_papers: ${after.total_papers}, outputs: ${JSON.stringify(after.total_outputs)}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
