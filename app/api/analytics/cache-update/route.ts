import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdTokenForUser } from "@/lib/firebase-token";

export const maxDuration = 30;

const USER_DASHBOARD_URL =
  "https://overhaulapi.democratiseresearch.in/api/analytics/user";

const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";

/**
 * POST /api/analytics/cache-update
 *
 * Webhook endpoint called by the FastAPI backend whenever a user's content changes
 * (paper uploaded, video/reel/podcast/poster generated).
 *
 * Re-fetches the user's dashboard from the external API and updates
 * only that user's entry in the Firestore cache.
 *
 * Expected payload:
 * {
 *   "secret": "<DASHBOARD_WEBHOOK_SECRET>",
 *   "user_id": "<firebase_uid>",
 *   "email": "<user_email>",
 *   "event": "user_login | paper_uploaded | video_generated | reel_generated | podcast_generated | poster_generated",
 *   "timestamp": "<ISO 8601>",
 *   "data": { ... optional ... }
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    secret?: string;
    user_id?: string;
    email?: string;
    event?: string;
    timestamp?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 1. Verify webhook secret
  const expectedSecret = process.env.DASHBOARD_WEBHOOK_SECRET;
  if (!expectedSecret || body.secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate required fields
  const { user_id, email, event } = body;
  if (!user_id) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }

  console.log(
    `[cache-update] Webhook received: event=${event} user=${email || user_id}`
  );

  // 3. Re-fetch the user's dashboard from the external API
  try {
    let dashboardData = {
      total_papers: 0,
      papers_by_source: {},
      total_outputs: {},
      papers: [],
    };

    try {
      const token = await getFirebaseIdTokenForUser(user_id);

      const response = await fetch(
        `${USER_DASHBOARD_URL}/${user_id}/dashboard`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (response.ok) {
        dashboardData = await response.json();
      } else {
        const errorText = await response.text();
        console.warn(
          `[cache-update] External API returned ${response.status} for ${user_id}: ${errorText}`
        );

        // For non-login events, the data should exist — treat API errors as failures
        if (event !== "user_login") {
          return NextResponse.json(
            {
              error: `External API returned ${response.status}`,
              user_id,
              event,
            },
            { status: 502 }
          );
        }
        // For user_login events, proceed with blank data — user is brand new
        console.log(
          `[cache-update] New user login — creating blank cache entry for ${email || user_id}`
        );
      }
    } catch (fetchError) {
      // If token generation or fetch fails for a login event, still create blank entry
      if (event !== "user_login") {
        throw fetchError;
      }
      console.warn(
        `[cache-update] Could not fetch dashboard for new user ${email || user_id}, creating blank entry`
      );
    }

    const updatedEntry = {
      user_id,
      email: email || "",
      total_papers: dashboardData.total_papers || 0,
      papers_by_source: dashboardData.papers_by_source || {},
      total_outputs: dashboardData.total_outputs || {},
      papers: dashboardData.papers || [],
      fetched_at: new Date().toISOString(),
    };

    // 4. Update the Firestore cache for this user
    const db = admin.firestore();
    const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
    const doc = await docRef.get();

    if (doc.exists) {
      const chunksSnapshot = await docRef.collection("chunks").get();
      let found = false;

      for (const chunkDoc of chunksSnapshot.docs) {
        const chunkData = chunkDoc.data();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dashboards = chunkData.dashboards as any[];
        const userIndex = dashboards.findIndex(
          (d: { user_id: string }) => d.user_id === user_id
        );

        if (userIndex !== -1) {
          dashboards[userIndex] = updatedEntry;
          await chunkDoc.ref.set({ dashboards });
          found = true;
          console.log(
            `[cache-update] Updated cache for ${email || user_id} in ${chunkDoc.id}`
          );
          break;
        }
      }

      // User not found in any chunk — they might be brand new.
      // Append to the last chunk (or create a new one if last chunk is full).
      if (!found) {
        const lastChunkDoc = chunksSnapshot.docs[chunksSnapshot.docs.length - 1];
        if (lastChunkDoc) {
          const lastChunkData = lastChunkDoc.data();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dashboards = lastChunkData.dashboards as any[];

          if (dashboards.length < 100) {
            // Append to last chunk
            dashboards.push(updatedEntry);
            await lastChunkDoc.ref.set({ dashboards });
          } else {
            // Last chunk is full, create a new one
            const newChunkIndex = chunksSnapshot.docs.length;
            await docRef
              .collection("chunks")
              .doc(`chunk_${newChunkIndex}`)
              .set({ dashboards: [updatedEntry] });
          }
        } else {
          // No chunks exist at all, create the first one
          await docRef
            .collection("chunks")
            .doc("chunk_0")
            .set({ dashboards: [updatedEntry] });
        }

        // Update the total_users count in the metadata doc
        const currentMeta = doc.data();
        await docRef.update({
          total_users: (currentMeta?.total_users || 0) + 1,
          cached_at: new Date().toISOString(),
        });

        console.log(
          `[cache-update] Added NEW user ${email || user_id} to cache`
        );
      }
    } else {
      // No cache document exists yet — create one with this single user
      await docRef.set({
        total_users: 1,
        total_chunks: 1,
        cached_at: new Date().toISOString(),
      });
      await docRef
        .collection("chunks")
        .doc("chunk_0")
        .set({ dashboards: [updatedEntry] });

      console.log(
        `[cache-update] Created new cache with user ${email || user_id}`
      );
    }

    return NextResponse.json({
      success: true,
      user_id,
      event,
      updated_at: updatedEntry.fetched_at,
    });
  } catch (error) {
    console.error(`[cache-update] Error processing webhook:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, user_id, event },
      { status: 500 }
    );
  }
}
