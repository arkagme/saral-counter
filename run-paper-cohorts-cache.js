#!/usr/bin/env node
/**
 * run-paper-cohorts-cache.js
 * Reads paper_metadata.processing_outputs and writes 1K-paper cohort data
 * to analytics_cache/paper_cohorts_summary in Firestore.
 *
 * Run: node run-paper-cohorts-cache.js
 */
const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Firestore key → canonical name
const OUTPUT_KEY_MAP = {
  video: "video",
  reels: "reel",      // ← plural in Firestore!
  podcast: "podcast",
  poster: "poster",
  business_brief: "business_brief",
};

function tsToMs(ts) {
  if (!ts) return 0;
  if (ts._seconds !== undefined) return ts._seconds * 1000;
  if (ts.seconds !== undefined) return ts.seconds * 1000;
  return new Date(String(ts)).getTime();
}

async function main() {
  console.log("Fetching all paper_metadata docs...");
  const snap = await db.collection("paper_metadata").get();
  console.log(`Total paper_metadata docs: ${snap.size}`);

  const papers = [];
  let skipped = 0;

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const po = data.processing_outputs;
    if (!po || typeof po !== "object" || Array.isArray(po)) { skipped++; return; }

    // Only include if at least one artifact key is present
    const fsKeys = Object.keys(OUTPUT_KEY_MAP);
    const hasAny = fsKeys.some((k) => po[k] !== undefined);
    if (!hasAny) { skipped++; return; }

    papers.push({
      paper_id: doc.id,
      created_at: tsToMs(data.created_at),
      video:          po.video?.generated === true,
      reel:           po.reels?.generated === true,   // note: "reels" key
      podcast:        po.podcast?.generated === true,
      poster:         po.poster?.generated === true,
      business_brief: po.business_brief?.generated === true,
    });
  });

  // Sort ascending by created_at
  papers.sort((a, b) => a.created_at - b.created_at);
  console.log(`Papers with processing_outputs: ${papers.length} (skipped: ${skipped})`);

  // Print per-artifact totals
  const totals = {
    total_papers: papers.length,
    video:          papers.filter((p) => p.video).length,
    reel:           papers.filter((p) => p.reel).length,
    podcast:        papers.filter((p) => p.podcast).length,
    poster:         papers.filter((p) => p.poster).length,
    business_brief: papers.filter((p) => p.business_brief).length,
  };
  console.log("\n=== Totals from paper_metadata.processing_outputs ===");
  Object.entries(totals).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Build 1K cohorts
  const BATCH = 1000;
  const cohorts = [];
  for (let i = 0; i < papers.length; i += BATCH) {
    const batch = papers.slice(i, i + BATCH);
    const idx = Math.floor(i / BATCH);
    cohorts.push({
      label:          idx === 0 ? "Recent 1K" : `${idx}K–${idx + 1}K`,
      count:          batch.length,
      video:          batch.filter((p) => p.video).length,
      reel:           batch.filter((p) => p.reel).length,
      podcast:        batch.filter((p) => p.podcast).length,
      poster:         batch.filter((p) => p.poster).length,
      business_brief: batch.filter((p) => p.business_brief).length,
      start_date:     batch[0]?.created_at ? new Date(batch[0].created_at).toISOString() : null,
      end_date:       batch[batch.length - 1]?.created_at ? new Date(batch[batch.length - 1].created_at).toISOString() : null,
    });
  }

  console.log("\n=== Cohort breakdown ===");
  cohorts.forEach((c) => {
    console.log(`  ${c.label}: ${c.count} papers | video=${c.video} reel=${c.reel} podcast=${c.podcast} poster=${c.poster} brief=${c.business_brief}`);
  });

  // Write to Firestore cache
  console.log("\nWriting to analytics_cache/paper_cohorts_summary...");
  const cachedAt = new Date().toISOString();
  await db.collection("analytics_cache").doc("paper_cohorts_summary").set({
    cohorts,
    totals,
    total_papers: papers.length,
    cached_at: cachedAt,
  });

  console.log(`Done! Cached at ${cachedAt}`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
