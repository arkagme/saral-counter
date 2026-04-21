import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const maxDuration = 300;

const CACHE_COLLECTION = "analytics_cache";
const CACHE_DOC = "pipeline_summary";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Error categorisation ──────────────────────────────────────────────────────
function categorizeError(raw: string): string {
  if (!raw || raw === "unknown") return "Unknown error";
  const r = raw.toLowerCase();
  if (
    r.includes("429") ||
    r.includes("quota") ||
    r.includes("resource exhausted") ||
    r.includes("rate-limit") ||
    r.includes("rate limit")
  )
    return "API quota / rate-limit exceeded";
  if (r.includes("sarvam") && r.includes("tts")) return "Sarvam TTS failure";
  if (r.includes("sarvam")) return "Sarvam service failure";
  if (r.includes("unable to deserialize") || r.includes("deserializ"))
    return "Job deserialization error";
  if (r.includes("500 internal server error") && r.includes("poster"))
    return "Poster service unavailable";
  if (r.includes("gemini") && (r.includes("fail") || r.includes("error")))
    return "Gemini API failure";
  if (r.includes("no .tex files")) return "Missing LaTeX source files";
  if (r.includes("event loop")) return "Async event loop error";
  if (r.includes("no space left")) return "Disk space exhausted";
  if (raw === "'metadata'" || r === "'metadata'")
    return "Missing metadata field";
  if (r.includes("job expired")) return "Job timed out / expired";
  if (r.includes("broken pipe")) return "Network connection broken";
  if (r.includes("no audio files")) return "No audio files generated";
  if (r.includes("failed to compile latex")) return "LaTeX compilation failed";
  if (raw.length > 80) return raw.substring(0, 80) + "…";
  return raw;
}

// ── Artifact stage mapping ────────────────────────────────────────────────────
const ARTIFACT_STAGES: Record<string, string[]> = {
  video: [
    "script_generation",
    "slides_generation",
    "audio_generation",
    "video_generation",
  ],
  poster: ["poster_generation"],
  reel: [
    "reel_script_generation",
    "reel_audio_generation",
    "reel_video_generation",
  ],
  podcast: [
    "podcast_script_generation",
    "podcast_audio_generation",
    "podcast_audio_combining",
    "podcast_generation",
  ],
  business_brief: ["business_brief_generation"],
};

const ARTIFACT_FINAL_STAGE: Record<string, string> = {
  video: "video_generation",
  poster: "poster_generation",
  reel: "reel_video_generation",
  podcast: "podcast_generation",
  business_brief: "business_brief_generation",
};

const ALL_STAGES = Object.values(ARTIFACT_STAGES).flat();

// ── Timestamp helper ──────────────────────────────────────────────────────────
function tsToISO(ts: unknown): string {
  if (!ts) return new Date(0).toISOString();
  const t = ts as Record<string, number>;
  if (t._seconds !== undefined)
    return new Date(t._seconds * 1000).toISOString();
  if (t.seconds !== undefined) return new Date(t.seconds * 1000).toISOString();
  return new Date(String(ts)).toISOString();
}

// ── Process one Firestore doc ─────────────────────────────────────────────────
// Data has LITERAL flat dot-keys: "stages.script_generation", "stages.video_generation", etc.
// The "stages: {}" field is always an empty object and should be ignored.
function processPipelineDoc(docId: string, data: Record<string, unknown>) {
  const lastSuccessful = (data.last_successful_stage as string) || "";
  const currentStage = (data.current_stage as string) || "";
  const rawUserId = data.user_id as string | undefined;

  const paper: {
    paper_id: string;
    user_id?: string;
    created_at: string;
    current_stage: string;
    last_successful_stage: string;
    artifacts: Record<
      string,
      { status: string; failed_at_stage?: string; error?: string }
    >;
    stages: Record<string, { status: string; duration_seconds?: number }>;
  } = {
    paper_id: (data.paper_id as string) || docId,
    created_at: tsToISO(data.created_at),
    current_stage: currentStage,
    last_successful_stage: lastSuccessful,
    artifacts: {},
    stages: {},
  };

  // Never store undefined in Firestore payloads.
  if (typeof rawUserId === "string" && rawUserId.length > 0) {
    paper.user_id = rawUserId;
  }

  // Extract per-stage info from literal dot-key fields
  for (const stageName of ALL_STAGES) {
    const sd = data[`stages.${stageName}`] as
      | Record<string, unknown>
      | undefined;
    if (sd) {
      const stageInfo: { status: string; duration_seconds?: number } = {
        status: (sd.status as string) || "in_progress",
      };
      if (typeof sd.duration_seconds === "number") {
        stageInfo.duration_seconds = sd.duration_seconds;
      }
      paper.stages[stageName] = stageInfo;
    }
  }

  // Determine per-artifact outcome
  for (const [artifact, stages] of Object.entries(ARTIFACT_STAGES)) {
    const finalStage = ARTIFACT_FINAL_STAGE[artifact];
    const finalStageData = data[`stages.${finalStage}`] as
      | Record<string, unknown>
      | undefined;

    // Primary success: final stage has "completed" status
    if (finalStageData?.status === "completed") {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    // Fallback success: last_successful_stage equals the final stage for this artifact
    if (lastSuccessful === finalStage) {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    // Check if any stage for this artifact exists in the doc
    const hasAnyStage = stages.some((s) => Boolean(data[`stages.${s}`]));

    // Detect failed artifact from current_stage pattern (e.g. "video_generation_failed")
    const failedStageName = currentStage.endsWith("_failed")
      ? currentStage.replace("_failed", "")
      : "";
    const isThisArtifactFailed = Boolean(
      failedStageName && stages.includes(failedStageName),
    );

    if (!hasAnyStage && !isThisArtifactFailed) {
      paper.artifacts[artifact] = { status: "not_attempted" };
      continue;
    }

    // Find first failed stage (explicit status)
    let failedStage: string | undefined;
    let errorReason: string | undefined;
    let inProgress = false;

    for (const stageName of stages) {
      const sd = data[`stages.${stageName}`] as
        | Record<string, unknown>
        | undefined;
      if (!sd) continue;
      if (sd.status === "failed") {
        failedStage = stageName;
        const raw =
          (sd.error_root_cause as string) ||
          (sd.error as string) ||
          "Unknown error";
        errorReason = categorizeError(raw);
        break;
      }
      if (sd.status === "in_progress") inProgress = true;
    }

    // Fallback: current_stage ends with _failed
    if (!failedStage && isThisArtifactFailed) {
      failedStage = failedStageName;
      const sd = data[`stages.${failedStageName}`] as
        | Record<string, unknown>
        | undefined;
      const raw =
        (sd?.error_root_cause as string) ||
        (sd?.error as string) ||
        "Unknown error";
      errorReason = categorizeError(raw);
    }

    if (failedStage) {
      paper.artifacts[artifact] = {
        status: "failed",
        failed_at_stage: failedStage,
        error: errorReason,
      };
    } else if (inProgress || hasAnyStage) {
      paper.artifacts[artifact] = { status: "in_progress" };
    } else {
      paper.artifacts[artifact] = { status: "not_attempted" };
    }
  }

  return paper;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";
  const db = admin.firestore();

  try {
    // Try cache first (unless forced refresh)
    if (!refresh) {
      const cacheRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC);
      const cacheDoc = await cacheRef.get();

      if (cacheDoc.exists) {
        const meta = cacheDoc.data()!;
        const cachedAt = meta.pipeline_cached_at
          ? new Date(meta.pipeline_cached_at as string).getTime()
          : 0;

        if (Date.now() - cachedAt < CACHE_TTL_MS) {
          const chunksSnap = await cacheRef
            .collection("pipeline_chunks")
            .orderBy("__name__")
            .get();
          const papers: unknown[] = [];
          chunksSnap.docs.forEach((doc) => {
            const d = doc.data();
            if (Array.isArray(d.papers)) papers.push(...d.papers);
          });

          if (papers.length > 0) {
            return NextResponse.json({
              papers,
              cached_at: meta.pipeline_cached_at,
              total: meta.pipeline_total || papers.length,
              from_cache: true,
            });
          }
        }
      }
    }

    // Full fetch from Firestore
    const snapshot = await db.collection("paper_pipeline").get();
    const papers = snapshot.docs.map((doc) =>
      processPipelineDoc(doc.id, doc.data() as Record<string, unknown>),
    );

    // Sort ascending by created_at
    papers.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const cachedAt = new Date().toISOString();
    const cacheRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC);

    // Delete old pipeline chunks
    const oldChunks = await cacheRef.collection("pipeline_chunks").get();
    if (oldChunks.size > 0) {
      const DEL_BATCH = 400;
      for (let i = 0; i < oldChunks.docs.length; i += DEL_BATCH) {
        const batchDel = db.batch();
        oldChunks.docs
          .slice(i, i + DEL_BATCH)
          .forEach((d) => batchDel.delete(d.ref));
        await batchDel.commit();
      }
    }

    // Write metadata
    await cacheRef.set(
      { pipeline_total: papers.length, pipeline_cached_at: cachedAt },
      { merge: true },
    );

    // Write chunked cache
    const CHUNK_SIZE = 200;
    for (let i = 0; i < papers.length; i += CHUNK_SIZE) {
      const idx = Math.floor(i / CHUNK_SIZE);
      await cacheRef
        .collection("pipeline_chunks")
        .doc(`chunk_${String(idx).padStart(3, "0")}`)
        .set({ papers: papers.slice(i, i + CHUNK_SIZE) });
    }

    return NextResponse.json({
      papers,
      cached_at: cachedAt,
      total: papers.length,
      from_cache: false,
    });
  } catch (error) {
    console.error("[pipeline-analytics] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
