import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdTokenForUser } from "@/lib/firebase-token";

export const maxDuration = 120;

const USER_DASHBOARD_URL =
  "https://testload.democratiseresearch.in/api/api/analytics/user";
const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";

/**
 * POST /api/analytics/sync-cache
 *
 * Audits the dashboard cache against paper_metadata (ground truth),
 * identifies mismatches, and re-fetches from the per-user API to fix them.
 *
 * Returns audit results and fix status.
 */
export async function POST() {
  try {
    const db = admin.firestore();

    // 1. Read paper_metadata (ground truth)
    const paperMetaDocs = await db.collection("paper_metadata").get();

    interface UserMeta {
      email: string;
      paperCount: number;
      outputs: Record<string, number>;
    }

    const userPaperCounts: Record<string, UserMeta> = {};
    let orphanCount = 0;

    paperMetaDocs.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.user_id as string | undefined;
      const email = (data.user_email as string) || "(unknown)";

      if (!userId) {
        orphanCount++;
        return;
      }

      if (!userPaperCounts[userId]) {
        userPaperCounts[userId] = { email, paperCount: 0, outputs: {} };
      }
      userPaperCounts[userId].paperCount++;

      const processingOutputs = (data.processing_outputs || {}) as Record<
        string,
        unknown
      >;
      for (const outType of Object.keys(processingOutputs)) {
        if (typeof processingOutputs[outType] === "object") {
          userPaperCounts[userId].outputs[outType] =
            (userPaperCounts[userId].outputs[outType] || 0) + 1;
        }
      }
    });

    // 2. Read dashboard cache
    const cacheDocRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
    const chunksSnapshot = await cacheDocRef
      .collection("chunks")
      .orderBy("__name__")
      .get();

    interface CacheEntry {
      chunkId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    }
    const cacheMap: Record<string, CacheEntry> = {};
    chunksSnapshot.docs.forEach((chunkDoc) => {
      const chunkData = chunkDoc.data();
      if (chunkData.dashboards) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chunkData.dashboards.forEach((d: any) => {
          cacheMap[d.user_id] = { chunkId: chunkDoc.id, data: d };
        });
      }
    });

    // 3. Find mismatches
    interface Mismatch {
      userId: string;
      email: string;
      type: "mismatch" | "missing";
    }
    const toFix: Mismatch[] = [];

    for (const [userId, meta] of Object.entries(userPaperCounts)) {
      const cached = cacheMap[userId];

      if (!cached) {
        toFix.push({ userId, email: meta.email, type: "missing" });
        continue;
      }

      const cachedPapers = cached.data.total_papers || 0;
      const cachedOutputs = cached.data.total_outputs || {};

      if (cachedPapers !== meta.paperCount) {
        toFix.push({ userId, email: meta.email, type: "mismatch" });
        continue;
      }

      const allOutputTypes = new Set([
        ...Object.keys(cachedOutputs),
        ...Object.keys(meta.outputs),
      ]);
      for (const ot of allOutputTypes) {
        if ((cachedOutputs[ot] || 0) !== (meta.outputs[ot] || 0)) {
          toFix.push({ userId, email: meta.email, type: "mismatch" });
          break;
        }
      }
    }

    if (toFix.length === 0) {
      return NextResponse.json({
        synced: true,
        mismatches: 0,
        fixed: 0,
        errors: 0,
        orphanPapers: orphanCount,
      });
    }

    // 4. Fix mismatches by re-fetching from API
    let fixed = 0;
    let errors = 0;
    const details: Array<{
      email: string;
      type: string;
      status: string;
      papers?: number;
    }> = [];

    for (const item of toFix) {
      try {
        const token = await getFirebaseIdTokenForUser(item.userId);
        const resp = await fetch(
          `${USER_DASHBOARD_URL}/${item.userId}/dashboard`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let freshEntry: any;
        if (resp.ok) {
          const apiData = await resp.json();
          freshEntry = {
            user_id: item.userId,
            email: item.email,
            total_papers: apiData.total_papers || 0,
            papers_by_source: apiData.papers_by_source || {},
            total_outputs: apiData.total_outputs || {},
            papers: apiData.papers || [],
            fetched_at: new Date().toISOString(),
          };
        } else {
          const meta = userPaperCounts[item.userId];
          freshEntry = {
            user_id: item.userId,
            email: item.email,
            total_papers: meta.paperCount,
            papers_by_source: {},
            total_outputs: meta.outputs,
            papers: [],
            fetched_at: new Date().toISOString(),
            error: `API returned ${resp.status}`,
          };
        }

        if (item.type === "mismatch") {
          const cachedInfo = cacheMap[item.userId];
          const chunkRef = cacheDocRef
            .collection("chunks")
            .doc(cachedInfo.chunkId);
          const chunkDoc = await chunkRef.get();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dashboards = chunkDoc.data()?.dashboards as any[];
          const idx = dashboards.findIndex(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => d.user_id === item.userId
          );
          if (idx !== -1) {
            dashboards[idx] = freshEntry;
            await chunkRef.set({ dashboards });
          }
        } else {
          const lastChunkDoc =
            chunksSnapshot.docs[chunksSnapshot.docs.length - 1];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dashboards = lastChunkDoc.data().dashboards as any[];
          if (dashboards.length < 100) {
            dashboards.push(freshEntry);
            await lastChunkDoc.ref.set({ dashboards });
          } else {
            const newChunkIndex = chunksSnapshot.docs.length;
            await cacheDocRef
              .collection("chunks")
              .doc(`chunk_${newChunkIndex}`)
              .set({ dashboards: [freshEntry] });
          }
          const metaDoc = await cacheDocRef.get();
          if (metaDoc.exists) {
            await cacheDocRef.update({
              total_users: (metaDoc.data()?.total_users || 0) + 1,
              cached_at: new Date().toISOString(),
            });
          }
        }

        fixed++;
        details.push({
          email: item.email,
          type: item.type,
          status: "fixed",
          papers: freshEntry.total_papers,
        });
      } catch (err) {
        errors++;
        details.push({
          email: item.email,
          type: item.type,
          status: `error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    return NextResponse.json({
      synced: errors === 0,
      mismatches: toFix.length,
      fixed,
      errors,
      orphanPapers: orphanCount,
      details,
    });
  } catch (error) {
    console.error("[sync-cache] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
