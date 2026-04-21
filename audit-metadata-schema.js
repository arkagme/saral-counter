#!/usr/bin/env node
/**
 * audit-metadata-schema.js
 * Inspect what paper_metadata actually looks like and where output counts live.
 */
const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  // Sample a few docs from paper_metadata
  const metaSnap = await db.collection("paper_metadata").limit(10).get();
  console.log("=== paper_metadata sample (first 10 docs) ===");
  metaSnap.docs.forEach((doc, i) => {
    const data = doc.data();
    const safe = JSON.stringify(data, (k, v) => {
      if (v && v._seconds !== undefined) return `Timestamp(${new Date(v._seconds * 1000).toISOString().substring(0,10)})`;
      return v;
    }, 2);
    console.log(`\n--- DOC ${i+1}: ${doc.id} ---`);
    // Show only first 600 chars
    console.log(safe.substring(0, 800));
  });

  // Check top-level keys across all docs
  console.log("\n\nChecking top-level keys in paper_metadata (sample of 500)...");
  const sample = await db.collection("paper_metadata").limit(500).get();
  const keyCounts = {};
  const outputKeyValues = {};
  sample.docs.forEach(doc => {
    const data = doc.data();
    Object.keys(data).forEach(k => {
      keyCounts[k] = (keyCounts[k] || 0) + 1;
      // Track what output-related keys contain
      if (k.toLowerCase().includes("output") || k.toLowerCase().includes("video") || 
          k.toLowerCase().includes("status") || k.toLowerCase().includes("artifact")) {
        if (!outputKeyValues[k]) outputKeyValues[k] = new Set();
        const v = data[k];
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          outputKeyValues[k].add(String(v).substring(0, 50));
        } else if (Array.isArray(v)) {
          outputKeyValues[k].add(JSON.stringify(v).substring(0, 80));
        }
      }
    });
  });

  console.log("\n=== Top-level key frequency (out of 500 docs) ===");
  Object.entries(keyCounts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v}`);
  });

  console.log("\n=== Output/Status-related key sample values ===");
  Object.entries(outputKeyValues).forEach(([k, vals]) => {
    console.log(`\n  ${k}:`);
    [...vals].slice(0, 5).forEach(v => console.log(`    ${v}`));
  });

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
