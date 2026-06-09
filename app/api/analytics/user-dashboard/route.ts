import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdTokenForUser } from "@/lib/firebase-token";

export const maxDuration = 30;

const USER_DASHBOARD_URL =
  "https://overhaulapi.democratiseresearch.in/api/analytics/user";

const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const token = await getFirebaseIdTokenForUser(userId);

    const response = await fetch(`${USER_DASHBOARD_URL}/${userId}/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `User dashboard API error for ${userId}:`,
        response.status,
        errorText,
      );
      return NextResponse.json(
        { error: `External API returned ${response.status}` },
        { status: response.status },
      );
    }

    const raw = await response.json();
    const data = raw.data ?? raw;
    if (data.total_outputs) {
      data.total_outputs = {
        video: data.total_outputs.videos ?? data.total_outputs.video ?? 0,
        reel: data.total_outputs.reels ?? data.total_outputs.reel ?? 0,
        podcast: data.total_outputs.podcasts ?? data.total_outputs.podcast ?? 0,
        poster: data.total_outputs.posters ?? data.total_outputs.poster ?? 0,
      };
    }

    // Update cache in Firestore
    try {
      const db = admin.firestore();
      const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
      const doc = await docRef.get();

      if (doc.exists) {
        // Resolve the authoritative email from Firebase Auth (single lightweight lookup)
        let authEmail = "";
        try {
          const userRecord = await admin.auth().getUser(userId);
          authEmail = userRecord.email || "";
        } catch {
          // Non-fatal — will fall back to cached/API value
        }

        // Find which chunk contains this user and update it
        const chunksSnapshot = await docRef.collection("chunks").get();
        let found = false;

        for (const chunkDoc of chunksSnapshot.docs) {
          const chunkData = chunkDoc.data();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dashboards = chunkData.dashboards as any[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const userIndex = dashboards.findIndex(
            (d: any) => d.user_id === userId,
          );

          if (userIndex !== -1) {
            const existingEmail: string = dashboards[userIndex].email || "";
            dashboards[userIndex] = {
              ...dashboards[userIndex],
              // Heal email: prefer Firebase Auth > existing cache email
              email: authEmail || existingEmail,
              total_papers: data.total_papers || 0,
              papers_by_source: data.papers_by_source || {},
              total_outputs: data.total_outputs || {},
              papers: data.papers || [],
              fetched_at: new Date().toISOString(),
              error: undefined,
            };
            await chunkDoc.ref.set({ dashboards });
            found = true;
            console.log(
              `[user-dashboard] Updated cache for ${userId} in ${chunkDoc.id}`,
            );
            break;
          }
        }

        // User not in any chunk — append to last chunk
        if (!found) {
          console.warn(
            `[user-dashboard] User ${userId} not in any cache chunk, appending...`,
          );
          const lastChunkDoc =
            chunksSnapshot.docs[chunksSnapshot.docs.length - 1];
          if (lastChunkDoc) {
            const lastChunkData = lastChunkDoc.data();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dashboards = lastChunkData.dashboards as any[];
            const newEntry = {
              user_id: userId,
              email: authEmail || data.email || "",
              total_papers: data.total_papers || 0,
              papers_by_source: data.papers_by_source || {},
              total_outputs: data.total_outputs || {},
              papers: data.papers || [],
              fetched_at: new Date().toISOString(),
            };

            if (dashboards.length < 100) {
              dashboards.push(newEntry);
              await lastChunkDoc.ref.set({ dashboards });
            } else {
              const newChunkIndex = chunksSnapshot.docs.length;
              await docRef
                .collection("chunks")
                .doc(`chunk_${newChunkIndex}`)
                .set({ dashboards: [newEntry] });
            }

            await docRef.update({
              total_users: (doc.data()?.total_users || 0) + 1,
              cached_at: new Date().toISOString(),
            });
            console.log(
              `[user-dashboard] Appended new user ${userId} to cache`,
            );
          }
        }
      }
    } catch (cacheError) {
      console.error("[user-dashboard] Error updating cache:", cacheError);
      // Don't fail the request if cache update fails
    }

    return NextResponse.json({
      ...data,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching dashboard for user ${userId}:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
