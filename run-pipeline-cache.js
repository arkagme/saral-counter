#!/usr/bin/env node
/**
 * run-pipeline-cache.js
 * Fetches ALL paper_pipeline docs, aggregates them, and writes the cache
 * to analytics_cache/pipeline_summary in Firestore.
 *
 * Run once manually:
 *   node run-pipeline-cache.js
 */
const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json"));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ── Error categorisation ─────────────────────────────────────────────────────
function categorizeError(raw) {
  if (!raw || raw === "unknown") return "Unknown error";
  const r = raw.toLowerCase();
  if (r.includes("429") || r.includes("quota") || r.includes("resource exhausted") || r.includes("rate-limit") || r.includes("rate limit")) return "API quota / rate-limit exceeded";
  if (r.includes("sarvam") && r.includes("tts")) return "Sarvam TTS failure";
  if (r.includes("sarvam")) return "Sarvam service failure";
  if (r.includes("unable to deserialize") || r.includes("deserializ")) return "Job deserialization error";
  if (r.includes("500 internal server error") && r.includes("poster")) return "Poster service unavailable";
  if (r.includes("gemini") && (r.includes("fail") || r.includes("error"))) return "Gemini API failure";
  if (r.includes("no .tex files")) return "Missing LaTeX source files";
  if (r.includes("event loop")) return "Async event loop error";
  if (r.includes("no space left")) return "Disk space exhausted";
  if (raw === "'metadata'" || r === "'metadata'") return "Missing metadata field";
  if (r.includes("job expired")) return "Job timed out / expired";
  if (r.includes("broken pipe")) return "Network connection broken";
  if (r.includes("no audio files")) return "No audio files generated";
  if (r.includes("failed to compile latex")) return "LaTeX compilation failed";
  if (raw.length > 80) return raw.substring(0, 80) + "…";
  return raw;
}

// ── Artifact stage mapping ───────────────────────────────────────────────────
const ARTIFACT_STAGES = {
  video: ["script_generation", "slides_generation", "audio_generation", "video_generation"],
  poster: ["poster_generation"],
  reel: ["reel_script_generation", "reel_audio_generation", "reel_video_generation"],
  podcast: ["podcast_script_generation", "podcast_audio_generation", "podcast_audio_combining", "podcast_generation"],
  business_brief: ["business_brief_generation"],
};
const ARTIFACT_FINAL_STAGE = {
  video: "video_generation",
  poster: "poster_generation",
  reel: "reel_video_generation",
  podcast: "podcast_generation",
  business_brief: "business_brief_generation",
};
const ALL_STAGES = Object.values(ARTIFACT_STAGES).flat();

// ── Timestamp helper ─────────────────────────────────────────────────────────
function tsToISO(ts) {
  if (!ts) return new Date(0).toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000).toISOString();
  return new Date(String(ts)).toISOString();
}

// ── Process one doc ──────────────────────────────────────────────────────────
function processDoc(docId, data) {
  const paper = {
    paper_id: data.paper_id || docId,
    user_id: data.user_id,
    created_at: tsToISO(data.created_at),
    current_stage: data.current_stage || "",
    last_successful_stage: data.last_successful_stage || "",
    artifacts: {},
    stages: {},
  };

  // Extract per-stage info — keys are LITERAL "stages.xxx" dot-keys
  ALL_STAGES.forEach((stageName) => {
    const sd = data[`stages.${stageName}`];
    if (sd) {
      paper.stages[stageName] = {
        status: sd.status || "in_progress",
        duration_seconds: sd.duration_seconds,
      };
    }
  });

  // Determine per-artifact outcome
  for (const [artifact, stages] of Object.entries(ARTIFACT_STAGES)) {
    const finalStage = ARTIFACT_FINAL_STAGE[artifact];
    const finalStageData = data[`stages.${finalStage}`];

    // Success: final stage completed
    if (finalStageData?.status === "completed") {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    // Also check last_successful_stage as success signal
    if (paper.last_successful_stage === finalStage) {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    const hasAnyStage = stages.some((s) => data[`stages.${s}`]);
    const cs = data.current_stage || "";
    const failedStageName = cs.endsWith("_failed") ? cs.replace("_failed", "") : "";
    const isThisArtifactFailed = failedStageName && stages.includes(failedStageName);

    if (!hasAnyStage && !isThisArtifactFailed) {
      paper.artifacts[artifact] = { status: "not_attempted" };
      continue;
    }

    // Find first failed stage
    let failedStage;
    let errorReason;
    let inProgress = false;

    for (const stageName of stages) {
      const sd = data[`stages.${stageName}`];
      if (!sd) continue;
      if (sd.status === "failed") {
        failedStage = stageName;
        const raw = sd.error_root_cause || sd.error || "Unknown error";
        errorReason = categorizeError(raw);
        break;
      }
      if (sd.status === "in_progress") inProgress = true;
    }

    // Fallback: detect from current_stage pattern
    if (!failedStage && isThisArtifactFailed) {
      failedStage = failedStageName;
      const sd = data[`stages.${failedStageName}`];
      const raw = sd?.error_root_cause || sd?.error || "Unknown error";
      errorReason = categorizeError(raw);
    }

    if (failedStage) {
      paper.artifacts[artifact] = { status: "failed", failed_at_stage: failedStage, error: errorReason };
    } else if (inProgress || hasAnyStage) {
      paper.artifacts[artifact] = { status: "in_progress" };
    } else {
      paper.artifacts[artifact] = { status: "not_attempted" };
    }
  }

  return paper;
}

async function main() {
  console.log("Fetching all paper_pipeline docs...");
  const snap = await db.collection("paper_pipeline").get();
  console.log(`Total docs: ${snap.size}`);

  const papers = snap.docs.map((doc) => processDoc(doc.id, doc.data()));
  papers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Quick stats printout
  const ARTIFACTS = ["video", "poster", "reel", "podcast", "business_brief"];
  const stats = {};
  ARTIFACTS.forEach((art) => { stats[art] = { success: 0, failed: 0, in_progress: 0, not_attempted: 0 }; });
  papers.forEach((p) => {
    ARTIFACTS.forEach((art) => {
      const s = p.artifacts[art]?.status || "not_attempted";
      stats[art][s]++;
    });
  });
  console.log("\n=== Artifact Stats ===");
  ARTIFACTS.forEach((art) => {
    const s = stats[art];
    console.log(`  ${art}: success=${s.success} failed=${s.failed} in_progress=${s.in_progress} not_attempted=${s.not_attempted}`);
  });

  // Write to Firestore cache
  console.log("\nWriting to Firestore cache (analytics_cache/pipeline_summary)...");
  const cachedAt = new Date().toISOString();
  const cacheRef = db.collection("analytics_cache").doc("pipeline_summary");

  // Delete old chunks
  const oldChunks = await cacheRef.collection("pipeline_chunks").get();
  if (oldChunks.size > 0) {
    console.log(`Deleting ${oldChunks.size} old chunks...`);
    const DEL_BATCH_SIZE = 400;
    for (let i = 0; i < oldChunks.docs.length; i += DEL_BATCH_SIZE) {
      const batchDel = db.batch();
      oldChunks.docs.slice(i, i + DEL_BATCH_SIZE).forEach((d) => batchDel.delete(d.ref));
      await batchDel.commit();
    }
  }

  // Write metadata
  await cacheRef.set({ pipeline_total: papers.length, pipeline_cached_at: cachedAt }, { merge: true });

  // Strip undefined values via JSON round-trip (Firestore rejects undefined)
  const cleanPapers = JSON.parse(JSON.stringify(papers));

  // Write chunks of 200
  const CHUNK_SIZE = 200;
  const totalChunks = Math.ceil(cleanPapers.length / CHUNK_SIZE);
  for (let i = 0; i < cleanPapers.length; i += CHUNK_SIZE) {
    const idx = Math.floor(i / CHUNK_SIZE);
    const chunkRef = cacheRef.collection("pipeline_chunks").doc(`chunk_${String(idx).padStart(3, "0")}`);
    await chunkRef.set({ papers: cleanPapers.slice(i, i + CHUNK_SIZE) });
    process.stdout.write(`\r  Writing chunk ${idx + 1}/${totalChunks}...`);
  }

  console.log(`\n\nDone! Cached ${papers.length} papers at ${cachedAt}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
