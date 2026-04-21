#!/usr/bin/env node
/**
 * audit-discrepancy.js
 * Compares paper_metadata vs paper_pipeline to find the source of the gap.
 */
const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log("Fetching paper_pipeline...");
  const pipelineSnap = await db.collection("paper_pipeline").get();
  const pipelineIds = new Set(pipelineSnap.docs.map(d => d.id));
  console.log(`paper_pipeline docs: ${pipelineSnap.size}`);

  console.log("Fetching paper_metadata...");
  const metaSnap = await db.collection("paper_metadata").get();
  const metaIds = new Set(metaSnap.docs.map(d => d.id));
  console.log(`paper_metadata docs: ${metaSnap.size}`);

  // Papers in metadata but NOT in pipeline
  const inMetaNotPipeline = [...metaIds].filter(id => !pipelineIds.has(id));
  // Papers in pipeline but NOT in metadata
  const inPipelineNotMeta = [...pipelineIds].filter(id => !metaIds.has(id));

  console.log(`\n=== Papers in paper_metadata but NOT in paper_pipeline: ${inMetaNotPipeline.length}`);
  inMetaNotPipeline.slice(0, 10).forEach(id => {
    const doc = metaSnap.docs.find(d => d.id === id);
    const data = doc?.data() || {};
    console.log(`  ${id} | created: ${data.created_at ? new Date(data.created_at._seconds * 1000).toISOString().substring(0, 10) : 'N/A'} | source: ${data.source_type || 'N/A'}`);
  });
  if (inMetaNotPipeline.length > 10) console.log(`  ... and ${inMetaNotPipeline.length - 10} more`);

  console.log(`\n=== Papers in paper_pipeline but NOT in paper_metadata: ${inPipelineNotMeta.length}`);
  inPipelineNotMeta.slice(0, 5).forEach(id => console.log(`  ${id}`));

  // Output counts from metadata (what platform stats uses)
  let videosInMeta = 0, reelsInMeta = 0, podcastsInMeta = 0, postersInMeta = 0, briefsInMeta = 0;
  metaSnap.docs.forEach(d => {
    const outputs = d.data().outputs || [];
    if (outputs.includes("video")) videosInMeta++;
    if (outputs.includes("reel")) reelsInMeta++;
    if (outputs.includes("podcast")) podcastsInMeta++;
    if (outputs.includes("poster")) postersInMeta++;
    if (outputs.includes("business_brief") || outputs.includes("brief")) briefsInMeta++;
  });

  console.log("\n=== Counts from paper_metadata (same source as Platform Stats) ===");
  console.log(`  Papers: ${metaSnap.size}`);
  console.log(`  Videos: ${videosInMeta}`);
  console.log(`  Reels:  ${reelsInMeta}`);
  console.log(`  Podcasts: ${podcastsInMeta}`);
  console.log(`  Posters: ${postersInMeta}`);
  console.log(`  Business Briefs: ${briefsInMeta}`);

  console.log("\n=== Counts from paper_pipeline (pipeline analytics) ===");
  console.log(`  Papers: ${pipelineSnap.size}`);
  console.log("\nConclusion:");
  console.log(`  Gap = ${metaSnap.size - pipelineSnap.size} papers exist in metadata but have no pipeline record`);
  console.log(`  These ${inMetaNotPipeline.length} papers were likely uploaded but never processed through the pipeline.`);

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
