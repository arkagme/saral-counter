#!/usr/bin/env node
/**
 * Deep inspection of paper_pipeline collection schema and statistics.
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function deepInspect() {
  console.log("Fetching ALL paper_pipeline docs... (may take a few seconds)\n");

  const allDocs = await db.collection("paper_pipeline").get();
  console.log(`Total pipeline docs: ${allDocs.size}\n`);

  // Understand stage structure — look at first 5 docs fully
  const sampleDocs = allDocs.docs.slice(0, 5);
  console.log("=== FULL SAMPLE DOCS (first 5) ===");
  sampleDocs.forEach((doc, i) => {
    console.log(`\n--- DOC ${i+1} id=${doc.id} ---`);
    const data = doc.data();
    // Print with circular-safe JSON
    const safe = JSON.stringify(data, (key, val) => {
      if (val && val._seconds !== undefined) return `Timestamp(${val._seconds})`;
      return val;
    }, 2);
    console.log(safe);
  });

  // Now gather statistics
  const stageNames = new Set();
  const stageStatusValues = {}; // { stageName: Set<status> }
  const topLevelKeys = new Set();
  const failureReasons = {}; // { stageName: { reason: count } }
  const artifactSuccess = { video: 0, poster: 0, reel: 0, podcast: 0, business_brief: 0 };
  const artifactFailure = { video: 0, poster: 0, reel: 0, podcast: 0, business_brief: 0 };
  const stageFailCounts = {};

  // Map from stage names to artifact type
  const STAGE_TO_ARTIFACT = {
    // Video
    script_generation: 'video',
    slides_generation: 'video',
    audio_generation: 'video',
    video_generation: 'video',
    // Poster (from stages)
    poster_generation: 'poster',
    // Reel
    reel_script_generation: 'reel',
    reel_audio_generation: 'reel',
    reel_video_generation: 'reel',
    // Podcast
    podcast_script_generation: 'podcast',
    podcast_audio_generation: 'podcast',
    podcast_audio_combining: 'podcast',
    podcast_generation: 'podcast',
    // Business brief (if exists)
    business_brief_generation: 'business_brief',
  };

  // Final stage for each artifact (indicates full success)
  const ARTIFACT_FINAL_STAGE = {
    video: 'video_generation',
    poster: 'poster_generation',
    reel: 'reel_video_generation',
    podcast: ['podcast_generation', 'podcast_audio_combining'],
    business_brief: 'business_brief_generation',
  };

  let docsWithNestedStages = 0;
  let docsWithFlatStages = 0;

  allDocs.docs.forEach(doc => {
    const data = doc.data();
    
    // Top level keys
    Object.keys(data).forEach(k => topLevelKeys.add(k));

    // Check if stages is nested object or flat keys
    if (data.stages && typeof data.stages === 'object') {
      docsWithNestedStages++;
      Object.entries(data.stages).forEach(([stageName, stageData]) => {
        stageNames.add(stageName);
        if (!stageStatusValues[stageName]) stageStatusValues[stageName] = new Set();
        if (stageData && stageData.status) {
          stageStatusValues[stageName].add(stageData.status);
        }
        if (stageData && stageData.status === 'failed') {
          stageFailCounts[stageName] = (stageFailCounts[stageName] || 0) + 1;
          // Capture failure reason
          const reason = stageData.error || stageData.failure_reason || stageData.reason || 'unknown';
          if (!failureReasons[stageName]) failureReasons[stageName] = {};
          const reasonKey = typeof reason === 'string' ? reason.substring(0, 100) : 'unknown';
          failureReasons[stageName][reasonKey] = (failureReasons[stageName][reasonKey] || 0) + 1;
        }
      });
    } else {
      // Flat key format like "stages.script_generation"
      const flatStageKeys = Object.keys(data).filter(k => k.startsWith('stages.'));
      if (flatStageKeys.length > 0) docsWithFlatStages++;
      flatStageKeys.forEach(k => {
        const stageName = k.replace('stages.', '');
        stageNames.add(stageName);
        const stageData = data[k];
        if (!stageStatusValues[stageName]) stageStatusValues[stageName] = new Set();
        if (stageData && stageData.status) {
          stageStatusValues[stageName].add(stageData.status);
        }
        if (stageData && stageData.status === 'failed') {
          stageFailCounts[stageName] = (stageFailCounts[stageName] || 0) + 1;
          const reason = stageData.error || stageData.failure_reason || stageData.reason || 'unknown';
          if (!failureReasons[stageName]) failureReasons[stageName] = {};
          const reasonKey = typeof reason === 'string' ? reason.substring(0, 100) : 'unknown';
          failureReasons[stageName][reasonKey] = (failureReasons[stageName][reasonKey] || 0) + 1;
        }
      });
    }
  });

  console.log("\n\n=== TOP LEVEL KEYS ===");
  console.log([...topLevelKeys].sort().join(', '));

  console.log("\n\n=== STAGE NAMES FOUND ===");
  console.log([...stageNames].sort().join(', '));

  console.log("\n\n=== docs with nested stages object:", docsWithNestedStages);
  console.log("=== docs with flat stages.xxx keys:", docsWithFlatStages);

  console.log("\n\n=== STATUS VALUES PER STAGE ===");
  Object.entries(stageStatusValues).forEach(([stage, statuses]) => {
    console.log(`  ${stage}: [${[...statuses].join(', ')}]`);
  });

  console.log("\n\n=== FAILURE COUNTS PER STAGE ===");
  Object.entries(stageFailCounts).sort((a,b) => b[1]-a[1]).forEach(([stage, count]) => {
    console.log(`  ${stage}: ${count} failures`);
  });

  console.log("\n\n=== TOP FAILURE REASONS PER STAGE ===");
  Object.entries(failureReasons).forEach(([stage, reasons]) => {
    const sorted = Object.entries(reasons).sort((a,b) => b[1]-a[1]).slice(0,5);
    console.log(`\n  ${stage}:`);
    sorted.forEach(([r, c]) => console.log(`    [${c}] ${r}`));
  });

  // Check last_successful_stage values
  const lastStageValues = {};
  const currentStageValues = {};
  allDocs.docs.forEach(doc => {
    const d = doc.data();
    const ls = d.last_successful_stage || d['last_successful_stage'] || 'none';
    lastStageValues[ls] = (lastStageValues[ls] || 0) + 1;
    const cs = d.current_stage || 'none';
    currentStageValues[cs] = (currentStageValues[cs] || 0) + 1;
  });

  console.log("\n\n=== last_successful_stage distribution ===");
  Object.entries(lastStageValues).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`  ${v}: ${c}`));

  console.log("\n\n=== current_stage distribution ===");
  Object.entries(currentStageValues).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`  ${v}: ${c}`));

  // Output sample of a failed document
  const failedDoc = allDocs.docs.find(doc => {
    const d = doc.data();
    const stages = d.stages || {};
    return Object.values(stages).some(s => s && s.status === 'failed');
  });
  if (failedDoc) {
    console.log("\n\n=== SAMPLE FAILED DOC ===");
    const safe = JSON.stringify(failedDoc.data(), (key, val) => {
      if (val && val._seconds !== undefined) return `Timestamp(${val._seconds})`;
      return val;
    }, 2);
    console.log(safe.substring(0, 3000));
  }

  process.exit(0);
}

deepInspect().catch(err => { console.error(err); process.exit(1); });
