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

// ── Old Python stage name → New Go step name normalisation ───────────────────
const OLD_TO_NEW_STAGE: Record<string, string> = {
  script_generation: "script_gen",
  slides_generation: "beamer_compile",
  audio_generation: "audio_gen",
  video_generation: "ffmpeg_stitch",
  podcast_script_generation: "podcast_script_gen",
  podcast_audio_generation: "podcast_audio_gen",
  // old podcast pipeline had two extra stages; collapse both into podcast_audio_gen
  podcast_audio_combining: "podcast_audio_gen",
  podcast_generation: "podcast_audio_gen",
  reel_script_generation: "reel_script_gen",
  reel_audio_generation: "reel_audio_gen",
  reel_video_generation: "reel_video_gen",
  poster_generation: "poster_compile",
  business_brief_generation: "business_brief",
};

function normalizeStage(name: string): string {
  return OLD_TO_NEW_STAGE[name] ?? name;
}

// ── Artifact stage mapping (new Go step names) ────────────────────────────────
// These are the canonical stage names used throughout the dashboard.
const ARTIFACT_STAGES: Record<string, string[]> = {
  video: [
    "pdf_extract",
    "metadata_extract",
    "script_gen",
    "beamer_compile",
    "audio_gen",
    "ffmpeg_stitch",
  ],
  poster: ["poster_compile"],
  reel: ["reel_script_gen", "reel_audio_gen", "reel_video_gen"],
  podcast: ["podcast_script_gen", "podcast_audio_gen"],
  business_brief: ["business_brief"],
};

const ARTIFACT_FINAL_STAGE: Record<string, string> = {
  video: "ffmpeg_stitch",
  poster: "poster_compile",
  reel: "reel_video_gen",
  podcast: "podcast_audio_gen",
  business_brief: "business_brief",
};

// run_mode value → dashboard artifact type
const RUN_MODE_TO_ARTIFACT: Record<string, string> = {
  video: "video",
  slides: "video", // slides-only pipeline is part of the video artifact column
  podcast: "podcast",
  reel: "reel",
  poster: "poster",
};

// The final stage that marks a particular run_mode as "successfully completed"
const RUN_MODE_FINAL_STAGE: Record<string, string> = {
  video: "ffmpeg_stitch",
  slides: "beamer_compile",
  podcast: "podcast_audio_gen",
  reel: "reel_video_gen",
  poster: "poster_compile",
};

// All canonical stage names (new names only – old names are handled via lookup)
const ALL_STAGES = [
  ...new Set(Object.values(ARTIFACT_STAGES).flat()),
  "linkedin_draft",
  "twitter_draft",
];

// ── Timestamp helper ──────────────────────────────────────────────────────────
function tsToISO(ts: unknown): string {
  if (!ts) return new Date(0).toISOString();
  const t = ts as Record<string, number>;
  if (t._seconds !== undefined)
    return new Date(t._seconds * 1000).toISOString();
  if (t.seconds !== undefined) return new Date(t.seconds * 1000).toISOString();
  return new Date(String(ts)).toISOString();
}

// ── Find stage data in a flat-dot-key doc (handles both old & new names) ──────
// Old docs store stages as literal flat keys: "stages.script_generation"
// New docs store stages as literal flat keys: "stages.script_gen"
// We always look up by the new (canonical) name, falling back to the old name.
const NEW_TO_OLD_STAGE: Record<string, string[]> = Object.entries(
  OLD_TO_NEW_STAGE,
).reduce(
  (acc, [oldName, newName]) => {
    if (!acc[newName]) acc[newName] = [];
    acc[newName].push(oldName);
    return acc;
  },
  {} as Record<string, string[]>,
);

function findStageData(
  data: Record<string, unknown>,
  newStageName: string,
): Record<string, unknown> | undefined {
  const direct = data[`stages.${newStageName}`] as
    | Record<string, unknown>
    | undefined;
  if (direct) return direct;
  const oldNames = NEW_TO_OLD_STAGE[newStageName] ?? [];
  for (const oldName of oldNames) {
    const sd = data[`stages.${oldName}`] as Record<string, unknown> | undefined;
    if (sd) return sd;
  }
  return undefined;
}

// ── Process ONE flat Firestore doc (old structure, no runs subcollection) ─────
function processPipelineDoc(docId: string, data: Record<string, unknown>) {
  // Normalize stage names in the scalar fields
  const lastSuccessful = normalizeStage(
    (data.last_successful_stage as string) || "",
  );
  const currentStageRaw = (data.current_stage as string) || "";
  const currentStage = normalizeStage(currentStageRaw);
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

  if (typeof rawUserId === "string" && rawUserId.length > 0) {
    paper.user_id = rawUserId;
  }

  // Extract per-stage info using canonical (new) names, falling back to old names
  for (const stageName of ALL_STAGES) {
    const sd = findStageData(data, stageName);
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
    const finalStageData = findStageData(data, finalStage);

    // Primary success: final stage has "completed" status
    if (finalStageData?.status === "completed") {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    // Fallback success: last_successful_stage (normalised) equals the final stage
    if (lastSuccessful === finalStage) {
      paper.artifacts[artifact] = { status: "success" };
      continue;
    }

    // Check if any stage for this artifact exists
    const hasAnyStage = stages.some((s) => Boolean(findStageData(data, s)));

    // Detect failed artifact from current_stage pattern (e.g. "ffmpeg_stitch_failed")
    // Works for both old names (video_generation_failed) and new names
    const rawFailedBase = currentStageRaw.endsWith("_failed")
      ? currentStageRaw.replace("_failed", "")
      : "";
    const failedStageName = rawFailedBase ? normalizeStage(rawFailedBase) : "";
    const isThisArtifactFailed = Boolean(
      failedStageName && stages.includes(failedStageName),
    );

    if (!hasAnyStage && !isThisArtifactFailed) {
      paper.artifacts[artifact] = { status: "not_attempted" };
      continue;
    }

    let failedStage: string | undefined;
    let errorReason: string | undefined;
    let inProgress = false;

    for (const stageName of stages) {
      const sd = findStageData(data, stageName);
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

    if (!failedStage && isThisArtifactFailed) {
      failedStage = failedStageName;
      const sd = findStageData(data, failedStageName);
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

// ── Process ONE run doc (new structure: paper_pipeline/{id}/runs/{runId}) ─────
function processRunDoc(runData: Record<string, unknown>) {
  const runMode = (runData.run_mode as string) || undefined;
  const artifactType = runMode ? (RUN_MODE_TO_ARTIFACT[runMode] ?? null) : null;
  const lastSuccessful = (runData.last_successful_stage as string) || "";
  const currentStage = (runData.current_stage as string) || "";
  const finalStage = runMode ? (RUN_MODE_FINAL_STAGE[runMode] ?? null) : null;

  // Collect stage data from flat dot-key fields (new names only in run docs)
  const runStages: Record<
    string,
    { status: string; duration_seconds?: number }
  > = {};
  for (const stageName of ALL_STAGES) {
    const sd = runData[`stages.${stageName}`] as
      | Record<string, unknown>
      | undefined;
    if (sd) {
      runStages[stageName] = {
        status: (sd.status as string) || "in_progress",
        ...(typeof sd.duration_seconds === "number" && {
          duration_seconds: sd.duration_seconds,
        }),
      };
    }
  }

  // Determine artifact status for this specific run
  let artifactStatus: "success" | "failed" | "in_progress" | "not_attempted" =
    "not_attempted";
  let failedAtStage: string | undefined;
  let errorReason: string | undefined;

  if (finalStage) {
    const finalStageData = runData[`stages.${finalStage}`] as
      | Record<string, unknown>
      | undefined;

    if (
      finalStageData?.status === "completed" ||
      lastSuccessful === finalStage
    ) {
      artifactStatus = "success";
    } else {
      // Check for any explicitly-failed stage
      for (const [stageName, stageInfo] of Object.entries(runStages)) {
        if (stageInfo.status === "failed") {
          artifactStatus = "failed";
          failedAtStage = stageName;
          const sd = runData[`stages.${stageName}`] as
            | Record<string, unknown>
            | undefined;
          errorReason = categorizeError(
            (sd?.error_root_cause as string) ||
              (sd?.error_message as string) ||
              (sd?.error as string) ||
              "Unknown error",
          );
          break;
        }
      }

      if (artifactStatus !== "failed") {
        // Check top-level error_code on the run document
        const errCode = runData.error_code as string | null | undefined;
        if (errCode && errCode !== "null" && errCode !== "") {
          artifactStatus = "failed";
          errorReason = categorizeError(errCode);
        } else if (Object.keys(runStages).length > 0) {
          artifactStatus = "in_progress";
        }
      }
    }
  } else if (Object.keys(runStages).length > 0) {
    artifactStatus = "in_progress";
  }

  return {
    run_mode: runMode,
    artifact_type: artifactType,
    created_at: runData.created_at,
    current_stage: currentStage,
    last_successful_stage: lastSuccessful,
    artifact_status: artifactStatus,
    failed_at_stage: failedAtStage,
    error: errorReason,
    stages: runStages,
  };
}

// ── Aggregate multiple runs into a single ProcessedPaper (new structure) ──────
function processNewStructurePaper(
  paperId: string,
  parentData: Record<string, unknown>,
  runs: { id: string; data: Record<string, unknown> }[],
) {
  // Prefer user_id from a run that has it; fall back to parent doc
  const userId =
    (runs.find((r) => typeof r.data.user_id === "string" && r.data.user_id)
      ?.data.user_id as string | undefined) ||
    (parentData.user_id as string | undefined);

  // Use created_at from the parent doc when available; otherwise the earliest run
  let createdAt: string;
  if (parentData.created_at) {
    createdAt = tsToISO(parentData.created_at);
  } else {
    const sorted = [...runs].sort((a, b) => {
      const ta =
        (a.data.created_at as { _seconds: number } | undefined)?._seconds ??
        Infinity;
      const tb =
        (b.data.created_at as { _seconds: number } | undefined)?._seconds ??
        Infinity;
      return ta - tb;
    });
    createdAt = sorted[0]?.data.created_at
      ? tsToISO(sorted[0].data.created_at)
      : new Date(0).toISOString();
  }

  const processedRuns = runs.map((r) => processRunDoc(r.data));

  // Aggregate stages from all runs into one map
  const allStages: Record<
    string,
    { status: string; duration_seconds?: number }
  > = {};
  processedRuns.forEach((r) => Object.assign(allStages, r.stages));

  // Aggregate artifact status (best result per artifact type across all runs)
  const artifacts: Record<
    string,
    { status: string; failed_at_stage?: string; error?: string }
  > = {};

  for (const artType of Object.keys(ARTIFACT_STAGES)) {
    if (artType === "business_brief") continue; // handled below
    const relevantRuns = processedRuns.filter(
      (r) => r.artifact_type === artType,
    );

    if (relevantRuns.length === 0) {
      artifacts[artType] = { status: "not_attempted" };
      continue;
    }

    const successRun = relevantRuns.find(
      (r) => r.artifact_status === "success",
    );
    if (successRun) {
      artifacts[artType] = { status: "success" };
      continue;
    }
    const inProgressRun = relevantRuns.find(
      (r) => r.artifact_status === "in_progress",
    );
    if (inProgressRun) {
      artifacts[artType] = { status: "in_progress" };
      continue;
    }
    const failedRun = relevantRuns.find((r) => r.artifact_status === "failed");
    if (failedRun) {
      artifacts[artType] = {
        status: "failed",
        ...(failedRun.failed_at_stage && {
          failed_at_stage: failedRun.failed_at_stage,
        }),
        ...(failedRun.error && { error: failedRun.error }),
      };
      continue;
    }
    artifacts[artType] = { status: "not_attempted" };
  }

  // business_brief: tracked as a stage within video runs (no dedicated run_mode)
  const bbStage = allStages["business_brief"];
  if (bbStage?.status === "completed") {
    artifacts["business_brief"] = { status: "success" };
  } else if (bbStage?.status === "failed") {
    artifacts["business_brief"] = {
      status: "failed",
      failed_at_stage: "business_brief",
    };
  } else if (bbStage) {
    artifacts["business_brief"] = { status: "in_progress" };
  } else {
    artifacts["business_brief"] = { status: "not_attempted" };
  }

  // current_stage comes from the most-recently-updated run
  const latestRun = [...processedRuns].sort((a, b) => {
    const ta =
      (a.created_at as { _seconds: number } | undefined)?._seconds ?? 0;
    const tb =
      (b.created_at as { _seconds: number } | undefined)?._seconds ?? 0;
    return tb - ta;
  })[0];

  const result: Record<string, unknown> = {
    paper_id: paperId,
    created_at: createdAt,
    current_stage: latestRun?.current_stage ?? "",
    last_successful_stage: latestRun?.last_successful_stage ?? "",
    artifacts,
    stages: allStages,
  };

  if (typeof userId === "string" && userId.length > 0) {
    result.user_id = userId;
  }

  return result;
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

    // ── Full fetch from Firestore ─────────────────────────────────────────────

    // Fetch all paper_pipeline top-level docs AND all runs at once in parallel
    const [snapshot, runsSnapshot] = await Promise.all([
      db.collection("paper_pipeline").get(),
      db.collectionGroup("runs").get(),
    ]);

    // Group run docs by their parent paper ID
    const runsByPaperId = new Map<
      string,
      { id: string; data: Record<string, unknown> }[]
    >();
    const validPaperIds = new Set(snapshot.docs.map((d) => d.id));

    runsSnapshot.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      // paper_id is stored on the run doc; fall back to reading the parent path
      const paperId =
        (data.paper_id as string) || doc.ref.parent.parent?.id || "";
      // Only include runs that belong to a known paper_pipeline document
      if (!paperId || !validPaperIds.has(paperId)) return;
      if (!runsByPaperId.has(paperId)) runsByPaperId.set(paperId, []);
      runsByPaperId.get(paperId)!.push({ id: doc.id, data });
    });

    // Build one processed record per paper
    const papers = snapshot.docs.map((doc) => {
      const paperId = doc.id;
      const parentData = doc.data() as Record<string, unknown>;
      const runs = runsByPaperId.get(paperId) ?? [];

      if (runs.length > 0) {
        // New subcollection structure
        return processNewStructurePaper(paperId, parentData, runs);
      } else {
        // Legacy flat-doc structure
        return processPipelineDoc(paperId, parentData);
      }
    });

    // Sort ascending by created_at
    papers.sort(
      (a, b) =>
        new Date(a.created_at as string).getTime() -
        new Date(b.created_at as string).getTime(),
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
