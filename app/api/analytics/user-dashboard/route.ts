import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdToken } from "@/lib/firebase-token";

export const maxDuration = 30;

const USER_DASHBOARD_URL =
  "https://testload.democratiseresearch.in/api/api/analytics/user";

const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const token = await getFirebaseIdToken();

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
        errorText
      );
      return NextResponse.json(
        { error: `External API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Update cache in Firestore
    try {
      const db = admin.firestore();
      const docRef = db
        .collection(FIRESTORE_COLLECTION)
        .doc(FIRESTORE_DOC);
      const doc = await docRef.get();

      if (doc.exists) {
        // Find which chunk contains this user and update it
        const chunksSnapshot = await docRef.collection("chunks").get();
        for (const chunkDoc of chunksSnapshot.docs) {
          const chunkData = chunkDoc.data();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dashboards = chunkData.dashboards as any[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const userIndex = dashboards.findIndex((d: any) => d.user_id === userId);

          if (userIndex !== -1) {
            dashboards[userIndex] = {
              ...dashboards[userIndex],
              total_papers: data.total_papers || 0,
              papers_by_source: data.papers_by_source || {},
              total_outputs: data.total_outputs || {},
              papers: data.papers || [],
              fetched_at: new Date().toISOString(),
              error: undefined,
            };
            await chunkDoc.ref.set({ dashboards });
            break;
          }
        }
      }
    } catch (cacheError) {
      console.error("Error updating cache:", cacheError);
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
