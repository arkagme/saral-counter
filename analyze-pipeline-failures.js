#!/usr/bin/env node
/**
 * Extract detailed failure reasons from paper_pipeline flat-key documents.
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function analyzeFailures() {
  console.log("Analyzing all failure reasons from paper_pipeline...\n");

  const allDocs = await db.collection("paper_pipeline").get();
  console.log(`Total docs: ${allDocs.size}\n`);

  // All stage names that can exist as flat keys
  const FLAT_STAGE_KEYS = [
    'stages.script_generation',
    'stages.slides_generation',
    'stages.audio_generation',
    'stages.video_generation',
    'stages.poster_generation',
    'stages.reel_script_generation',
    'stages.reel_audio_generation',
    'stages.reel_video_generation',
    'stages.podcast_script_generation',
    'stages.podcast_audio_generation',
    'stages.podcast_audio_combining',
    'stages.podcast_generation',
    'stages.business_brief_generation',
  ];

  // Aggregate: { stageName: { status: count } }
  const stageStatusCounts = {};
  // Aggregate failure reasons: { stageName: { reason: count } }
  const failureReasons = {};
  
  // Per-artifact aggregate
  const ARTIFACT_STAGES = {
    video: ['stages.script_generation', 'stages.slides_generation', 'stages.audio_generation', 'stages.video_generation'],
    poster: ['stages.poster_generation'],
    reel: ['stages.reel_script_generation', 'stages.reel_audio_generation', 'stages.reel_video_generation'],
    podcast: ['stages.podcast_script_generation', 'stages.podcast_audio_generation', 'stages.podcast_audio_combining', 'stages.podcast_generation'],
    business_brief: ['stages.business_brief_generation'],
  };

  const ARTIFACT_FINAL_STAGE = {
    video: 'stages.video_generation',
    poster: 'stages.poster_generation',
    reel: 'stages.reel_video_generation',
    podcast: 'stages.podcast_generation',
    business_brief: 'stages.business_brief_generation',
  };

  // Per-artifact counts from current_stage
  const artifactSuccess = { video: 0, poster: 0, reel: 0, podcast: 0, business_brief: 0 };
  const artifactFailure = { video: 0, poster: 0, reel: 0, podcast: 0, business_brief: 0 };
  const artifactInProgress = { video: 0, poster: 0, reel: 0, podcast: 0, business_brief: 0 };

  const FINAL_STAGES = {
    video_generation: 'video',
    poster_generation: 'poster',
    reel_video_generation: 'reel',
    podcast_generation: 'podcast',
    business_brief_generation: 'business_brief',
  };

  const FAILED_STAGES = {
    video_generation_failed: 'video',
    script_generation_failed: 'video',
    slides_generation_failed: 'video',
    audio_generation_failed: 'video',
    poster_generation_failed: 'poster',
    reel_script_generation_failed: 'reel',
    reel_audio_generation_failed: 'reel',
    reel_video_generation_failed: 'reel',
    podcast_generation_failed: 'podcast',
    podcast_script_generation_failed: 'podcast',
    podcast_audio_generation_failed: 'podcast',
    podcast_audio_combining_failed: 'podcast',
    business_brief_generation_failed: 'business_brief',
  };

  const IN_PROGRESS_STAGES = {
    video_generation: 'video',
    script_generation: 'video',
    slides_generation: 'video',
    audio_generation: 'video',
    poster_generation: 'poster',
    reel_script_generation: 'reel',
    reel_audio_generation: 'reel',
    reel_video_generation: 'reel',
    podcast_generation: 'podcast',
    podcast_script_generation: 'podcast',
    podcast_audio_generation: 'podcast',
    podcast_audio_combining: 'podcast',
    business_brief_generation: 'business_brief',
  };

  const overallFailureReasons = {}; // { reason: count }
  const stageFailureExample = {}; // a sample of actual error messages

  allDocs.docs.forEach(doc => {
    const data = doc.data();
    const currentStage = data.current_stage || '';
    const lastSuccessful = data.last_successful_stage || '';

    // Map current_stage to determine artifact outcome
    if (FINAL_STAGES[currentStage] && lastSuccessful === currentStage) {
      artifactSuccess[FINAL_STAGES[currentStage]]++;
    } else if (FAILED_STAGES[currentStage]) {
      artifactFailure[FAILED_STAGES[currentStage]]++;
    }

    // Process each flat stage key for status counts and error reasons
    FLAT_STAGE_KEYS.forEach(flatKey => {
      const stageData = data[flatKey];
      if (!stageData) return;
      
      const stageName = flatKey.replace('stages.', '');
      if (!stageStatusCounts[stageName]) stageStatusCounts[stageName] = {};
      const status = stageData.status || 'unknown';
      stageStatusCounts[stageName][status] = (stageStatusCounts[stageName][status] || 0) + 1;

      if (status === 'failed') {
        // Extract error reason
        const reason = stageData.error_root_cause || stageData.error || stageData.failure_reason || stageData.reason || 'unknown';
        const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason).substring(0, 150);
        
        if (!failureReasons[stageName]) failureReasons[stageName] = {};
        failureReasons[stageName][reasonStr] = (failureReasons[stageName][reasonStr] || 0) + 1;
        
        // Overall failure reasons
        overallFailureReasons[reasonStr] = (overallFailureReasons[reasonStr] || 0) + 1;

        // Store example
        if (!stageFailureExample[stageName]) {
          stageFailureExample[stageName] = { ...stageData, paper_id: data.paper_id };
        }
      }
    });
  });

  console.log("=== PER-STAGE STATUS COUNTS ===");
  Object.entries(stageStatusCounts).sort().forEach(([stage, counts]) => {
    const parts = Object.entries(counts).map(([s,c])=>`${s}=${c}`).join(', ');
    console.log(`  ${stage}: { ${parts} }`);
  });

  console.log("\n\n=== ARTIFACT SUCCESS vs FAILURE (from current_stage) ===");
  Object.entries(artifactSuccess).forEach(([artifact, successes]) => {
    const failures = artifactFailure[artifact];
    const total = successes + failures;
    const pct = total > 0 ? ((successes/total)*100).toFixed(1) : 'N/A';
    console.log(`  ${artifact}: success=${successes}, failure=${failures}, total=${total}, success_rate=${pct}%`);
  });

  console.log("\n\n=== TOP FAILURE REASONS PER STAGE ===");
  Object.entries(failureReasons).sort().forEach(([stage, reasons]) => {
    const sorted = Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,10);
    console.log(`\n  ${stage}:`);
    sorted.forEach(([r,c]) => console.log(`    [${c}] ${r}`));
  });

  console.log("\n\n=== OVERALL FAILURE REASONS (ALL STAGES) ===");
  const sortedOverall = Object.entries(overallFailureReasons).sort((a,b)=>b[1]-a[1]).slice(0,20);
  sortedOverall.forEach(([r,c]) => console.log(`  [${c}] ${r}`));

  console.log("\n\n=== SAMPLE FAILED STAGE DOCS ===");
  Object.entries(stageFailureExample).forEach(([stage, ex]) => {
    console.log(`\n  ${stage}:`);
    console.log(`    paper_id: ${ex.paper_id}`);
    console.log(`    error_root_cause: ${ex.error_root_cause || 'N/A'}`);
    console.log(`    status: ${ex.status}`);
    console.log(`    duration_seconds: ${ex.duration_seconds}`);
  });

  // Overall statistics
  console.log("\n\n=== CURRENT STAGE DISTRIBUTION (full) ===");
  const currentStageDist = {};
  allDocs.docs.forEach(doc => {
    const cs = doc.data().current_stage || 'none/missing';
    currentStageDist[cs] = (currentStageDist[cs] || 0) + 1;
  });
  Object.entries(currentStageDist).sort((a,b)=>b[1]-a[1]).forEach(([cs,c]) => {
    console.log(`  ${cs}: ${c}`);
  });

  // Docs with no current_stage (just uploaded/none)
  const noPipeline = allDocs.docs.filter(d => !d.data().current_stage || d.data().current_stage === 'uploaded').length;
  console.log(`\nDocs with no pipeline progress (just uploaded): ${noPipeline}`);

  process.exit(0);
}

analyzeFailures().catch(err => { console.error(err); process.exit(1); });
