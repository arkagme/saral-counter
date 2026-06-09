import { NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdTokenForUser } from "@/lib/firebase-token";

export const maxDuration = 120;

const USER_DASHBOARD_URL =
  "https://overhaulapi.democratiseresearch.in/api/analytics/user";
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

    // 0. Load all Firebase Auth users — authoritative email source
    const authEmailMap: Record<string, string> = {};
    try {
      let pageToken: string | undefined;
      do {
        const listResult = await admin.auth().listUsers(1000, pageToken);
        listResult.users.forEach((u) => {
          if (u.email) authEmailMap[u.uid] = u.email;
        });
        pageToken = listResult.pageToken;
      } while (pageToken);
    } catch (authErr) {
      console.warn("[sync-cache] Could not load Firebase Auth users:", authErr);
    }

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
      // Prefer Firebase Auth email, fall back to paper_metadata.user_email
      const email =
        (userId && authEmailMap[userId]) ||
        (data.user_email as string) ||
        "(unknown)";

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

    // 3b. Heal stale / blank emails in cache entries that are NOT already in toFix
    //     Firebase Auth is the authoritative email source.
    const toFixIds = new Set(toFix.map((m) => m.userId));
    interface EmailHeal {
      userId: string;
      correctEmail: string;
      chunkId: string;
    }
    const emailHeals: EmailHeal[] = [];
    for (const [userId, entry] of Object.entries(cacheMap)) {
      if (toFixIds.has(userId)) continue; // will be fixed by main loop
      const cachedEmail: string = entry.data.email || "";
      const authEmail = authEmailMap[userId];
      if (authEmail && (!cachedEmail || cachedEmail === "(unknown)")) {
        emailHeals.push({
          userId,
          correctEmail: authEmail,
          chunkId: entry.chunkId,
        });
      }
    }

    if (emailHeals.length > 0) {
      // Group heals by chunk for minimal writes
      const healsByChunk: Record<string, EmailHeal[]> = {};
      for (const h of emailHeals) {
        if (!healsByChunk[h.chunkId]) healsByChunk[h.chunkId] = [];
        healsByChunk[h.chunkId].push(h);
      }
      for (const [chunkId, heals] of Object.entries(healsByChunk)) {
        const chunkRef = cacheDocRef.collection("chunks").doc(chunkId);
        const chunkDoc = await chunkRef.get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dashboards = chunkDoc.data()?.dashboards as any[];
        let changed = false;
        for (const heal of heals) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const idx = dashboards.findIndex(
            (d: any) => d.user_id === heal.userId,
          );
          if (idx !== -1) {
            dashboards[idx] = { ...dashboards[idx], email: heal.correctEmail };
            changed = true;
          }
        }
        if (changed) await chunkRef.set({ dashboards });
      }
      console.log(
        `[sync-cache] Healed emails for ${emailHeals.length} cache entries`,
      );
    }

    if (toFix.length === 0) {
      return NextResponse.json({
        synced: true,
        mismatches: 0,
        fixed: 0,
        errors: 0,
        emailsHealed: emailHeals.length,
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
          },
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let freshEntry: any;
        // Prefer Firebase Auth email (authoritative) over paper_metadata-derived email
        const resolvedEmail = authEmailMap[item.userId] || item.email;
        if (resp.ok) {
          const raw = await resp.json();
          const apiData = raw.data ?? raw;
          if (apiData.total_outputs) {
            apiData.total_outputs = {
              video: apiData.total_outputs.videos ?? apiData.total_outputs.video ?? 0,
              reel: apiData.total_outputs.reels ?? apiData.total_outputs.reel ?? 0,
              podcast: apiData.total_outputs.podcasts ?? apiData.total_outputs.podcast ?? 0,
              poster: apiData.total_outputs.posters ?? apiData.total_outputs.poster ?? 0,
            };
          }
          freshEntry = {
            user_id: item.userId,
            email: resolvedEmail,
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
            email: resolvedEmail,
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
            (d: any) => d.user_id === item.userId,
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
          email: resolvedEmail,
          type: item.type,
          status: "fixed",
          papers: freshEntry.total_papers,
        });
      } catch (err) {
        errors++;
        details.push({
          email: authEmailMap[item.userId] || item.email,
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
      emailsHealed: emailHeals.length,
      orphanPapers: orphanCount,
      details,
    });
  } catch (error) {
    console.error("[sync-cache] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
