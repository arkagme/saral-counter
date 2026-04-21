#!/usr/bin/env node
/**
 * audit-processing-outputs.js
 * Inspect the processing_outputs field in paper_metadata
 * and cross-check with paper_pipeline counts.
 */
const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log("Fetching paper_metadata (all docs)...");
  const metaSnap = await db.collection("paper_metadata").get();
  console.log(`Total paper_metadata: ${metaSnap.size}`);

  // Show first 5 docs' processing_outputs field
  console.log("\n=== Sample processing_outputs values ===");
  let shown = 0;
  for (const doc of metaSnap.docs) {
    const data = doc.data();
    if (data.processing_outputs !== undefined) {
      console.log(`\n  ${doc.id}:`);
      console.log(`  ${JSON.stringify(data.processing_outputs, null, 2).substring(0, 400)}`);
      shown++;
      if (shown >= 5) break;
    }
  }

  // Count artifact successes from processing_outputs
  let videoCount = 0, reelCount = 0, podcastCount = 0, posterCount = 0, briefCount = 0;
  let hasVideo = 0, hasReel = 0, hasPodcast = 0, hasPoster = 0, hasBrief = 0;
  let docsWithOutputs = 0;
  const allOutputKeys = new Set();

  metaSnap.docs.forEach(doc => {
    const data = doc.data();
    const po = data.processing_outputs;
    if (!po) return;
    docsWithOutputs++;

    // Collect all keys inside processing_outputs
    if (typeof po === 'object' && !Array.isArray(po)) {
      Object.keys(po).forEach(k => allOutputKeys.add(k));
      
      // Check video
      const v = po.video || po.video_generation;
      if (v && (v.status === 'completed' || v === 'completed')) { videoCount++; }
      if (v) hasVideo++;

      // Check reel
      const r = po.reel || po.reel_video_generation;
      if (r && (r.status === 'completed' || r === 'completed')) { reelCount++; }
      if (r) hasReel++;

      // Check podcast
      const p = po.podcast || po.podcast_generation;
      if (p && (p.status === 'completed' || p === 'completed')) { podcastCount++; }
      if (p) hasPodcast++;

      // Check poster
      const pos = po.poster || po.poster_generation;
      if (pos && (pos.status === 'completed' || pos === 'completed')) { posterCount++; }
      if (pos) hasPoster++;

      // Check brief
      const b = po.business_brief || po.business_brief_generation;
      if (b && (b.status === 'completed' || b === 'completed')) { briefCount++; }
      if (b) hasBrief++;
    } else if (Array.isArray(po)) {
      // It's an array of strings
      if (po.includes('video') || po.includes('video_generation')) videoCount++;
      if (po.includes('reel') || po.includes('reel_video_generation')) reelCount++;
      if (po.includes('podcast') || po.includes('podcast_generation')) podcastCount++;
      if (po.includes('poster') || po.includes('poster_generation')) posterCount++;
      if (po.includes('business_brief') || po.includes('business_brief_generation')) briefCount++;
    }
  });

  console.log(`\n\n=== Docs with processing_outputs: ${docsWithOutputs} / ${metaSnap.size}`);
  console.log(`=== All keys inside processing_outputs: ${[...allOutputKeys].sort().join(', ')}`);
  
  console.log(`\n=== Artifact counts from paper_metadata.processing_outputs ===`);
  console.log(`  Video completed: ${videoCount} (has any: ${hasVideo})`);
  console.log(`  Reel completed: ${reelCount} (has any: ${hasReel})`);
  console.log(`  Podcast completed: ${podcastCount} (has any: ${hasPodcast})`);
  console.log(`  Poster completed: ${posterCount} (has any: ${hasPoster})`);
  console.log(`  Brief completed: ${briefCount} (has any: ${hasBrief})`);

  // Now count status='processed' papers (what external API likely counts as "papers")
  let statusCounts = {};
  metaSnap.docs.forEach(doc => {
    const s = doc.data().status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  console.log(`\n=== paper_metadata status distribution ===`);
  Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => console.log(`  ${s}: ${c}`));

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
