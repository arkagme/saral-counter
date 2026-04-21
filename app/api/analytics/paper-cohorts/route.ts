import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";

export const maxDuration = 300;

const CACHE_COLLECTION = "analytics_cache";
const CACHE_DOC = "paper_cohorts_summary";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// processing_outputs key → canonical artifact name
// Note: the key in Firestore is "reels" (plural), not "reel"
const OUTPUT_KEY_MAP: Record<string, string> = {
  video: "video",
  reels: "reel",
  podcast: "podcast",
  poster: "poster",
  business_brief: "business_brief",
};

function tsToMs(ts: unknown): number {
  if (!ts) return 0;
  const t = ts as Record<string, number>;
  if (t._seconds !== undefined) return t._seconds * 1000;
  if (t.seconds !== undefined) return t.seconds * 1000;
  return new Date(String(ts)).getTime();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";
  const db = admin.firestore();

  try {
    // Try cache first
    if (!refresh) {
      const cacheRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC);
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const meta = cacheDoc.data()!;
        const cachedAt = meta.cached_at
          ? new Date(meta.cached_at as string).getTime()
          : 0;
        if (Date.now() - cachedAt < CACHE_TTL_MS && meta.cohorts) {
          return NextResponse.json({
            cohorts: meta.cohorts,
            total_papers: meta.total_papers,
            totals: meta.totals,
            cached_at: meta.cached_at,
            from_cache: true,
          });
        }
      }
    }

    // Fetch all paper_metadata docs
    const snap = await db.collection("paper_metadata").get();

    // Build per-paper summary: only include docs with any processing_output
    type PaperRow = {
      paper_id: string;
      created_at: number;
      video: boolean;
      reel: boolean;
      podcast: boolean;
      poster: boolean;
      business_brief: boolean;
    };
    const papers: PaperRow[] = [];

    snap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const po = data.processing_outputs as Record<string, { generated?: boolean }> | undefined;
      if (!po) return;

      // Only include papers that attempted at least one artifact
      const hasAny = Object.values(OUTPUT_KEY_MAP).some((canonicalKey) => {
        // Find how this artifact is stored in processing_outputs
        const firestoreKey = Object.keys(OUTPUT_KEY_MAP).find(
          (k) => OUTPUT_KEY_MAP[k] === canonicalKey
        );
        return firestoreKey && po[firestoreKey] !== undefined;
      });
      if (!hasAny) return;

      papers.push({
        paper_id: doc.id,
        created_at: tsToMs(data.created_at),
        video: po.video?.generated === true,
        reel: po.reels?.generated === true,    // key is "reels" in Firestore!
        podcast: po.podcast?.generated === true,
        poster: po.poster?.generated === true,
        business_brief: po.business_brief?.generated === true,
      });
    });

    // Sort ascending by created_at
    papers.sort((a, b) => a.created_at - b.created_at);

    // Build cohorts of 1000
    const BATCH = 1000;
    const cohorts: Record<string, unknown>[] = [];
    for (let i = 0; i < papers.length; i += BATCH) {
      const batch = papers.slice(i, i + BATCH);
      const idx = Math.floor(i / BATCH);
      const label = idx === 0 ? "Recent 1K" : `${idx}K–${idx + 1}K`;
      cohorts.push({
        label,
        count: batch.length,
        video: batch.filter((p) => p.video).length,
        reel: batch.filter((p) => p.reel).length,
        podcast: batch.filter((p) => p.podcast).length,
        poster: batch.filter((p) => p.poster).length,
        business_brief: batch.filter((p) => p.business_brief).length,
        start_date: batch[0]?.created_at
          ? new Date(batch[0].created_at).toISOString()
          : null,
        end_date: batch[batch.length - 1]?.created_at
          ? new Date(batch[batch.length - 1].created_at).toISOString()
          : null,
      });
    }

    // Overall totals
    const totals = {
      total_papers: papers.length,
      video: papers.filter((p) => p.video).length,
      reel: papers.filter((p) => p.reel).length,
      podcast: papers.filter((p) => p.podcast).length,
      poster: papers.filter((p) => p.poster).length,
      business_brief: papers.filter((p) => p.business_brief).length,
    };

    const cachedAt = new Date().toISOString();

    // Write to cache (single doc — cohort data is small)
    const cacheRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOC);
    await cacheRef.set({
      cohorts,
      totals,
      total_papers: papers.length,
      cached_at: cachedAt,
    });

    return NextResponse.json({
      cohorts,
      total_papers: papers.length,
      totals,
      cached_at: cachedAt,
      from_cache: false,
    });
  } catch (error) {
    console.error("[paper-cohorts] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
