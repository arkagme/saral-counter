#!/usr/bin/env node
/**
 * Inspect the paper_pipeline Firestore collection to understand its schema.
 * Run: node inspect-paper-pipeline.js
 */

const admin = require("firebase-admin");
const path = require("path");

// Load service account key
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function inspectCollection() {
  console.log("====== paper_pipeline collection inspection ======\n");

  const snapshot = await db.collection("paper_pipeline").limit(20).get();
  console.log(`Total docs fetched (limit 20): ${snapshot.size}`);
  console.log("---");

  const allKeys = new Set();
  const allStageKeys = new Set();
  const allArtifactKeys = new Set();
  const statusValues = new Set();

  snapshot.docs.forEach((doc, i) => {
    const data = doc.data();
    const docKeys = Object.keys(data);
    docKeys.forEach(k => allKeys.add(k));

    if (i < 5) {
      console.log(`\n--- Document ${i + 1}: ID = ${doc.id} ---`);
      console.log(JSON.stringify(data, null, 2));
    }

    // Collect stage/artifact keys
    if (data.stages) {
      Object.keys(data.stages).forEach(k => allStageKeys.add(k));
    }
    if (data.artifacts) {
      Object.keys(data.artifacts).forEach(k => allArtifactKeys.add(k));
    }
    if (data.status) statusValues.add(data.status);
  });

  console.log("\n\n====== SCHEMA SUMMARY ======");
  console.log("Top-level keys seen across docs:", [...allKeys]);
  console.log("Stage keys seen:", [...allStageKeys]);
  console.log("Artifact keys seen:", [...allArtifactKeys]);
  console.log("Status values seen:", [...statusValues]);

  // Count total docs
  const countSnap = await db.collection("paper_pipeline").get();
  console.log(`\nTotal docs in paper_pipeline: ${countSnap.size}`);

  // Also inspect paper_metadata for comparison
  console.log("\n\n====== paper_metadata spot check (3 docs) ======");
  const metaSnap = await db.collection("paper_metadata").limit(3).get();
  metaSnap.docs.forEach((doc, i) => {
    console.log(`\n--- paper_metadata doc ${i + 1}: ID = ${doc.id} ---`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });

  console.log("\n\n====== analytics_cache spot check ======");
  const cacheSnap = await db.collection("analytics_cache").get();
  cacheSnap.docs.forEach((doc) => {
    console.log(`\nCache doc: ${doc.id}`);
    const d = doc.data();
    // don't print dashboards array (too big)
    const { dashboards, ...rest } = d;
    console.log(JSON.stringify(rest, null, 2));
    if (dashboards) console.log(`  dashboards array length: ${dashboards.length}`);
  });

  // Check user_history_counter
  console.log("\n\n====== user_history_counter spot check ======");
  try {
    const uhSnap = await db.collection("user_history_counter").limit(3).get();
    uhSnap.docs.forEach(doc => {
      console.log(`\nDoc: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  } catch(e) {
    console.log("Collection not found or error:", e.message);
  }

  process.exit(0);
}

inspectCollection().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
