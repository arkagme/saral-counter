import { NextRequest, NextResponse } from "next/server";
import admin from "@/lib/firebase-admin";
import { getFirebaseIdTokenForUser } from "@/lib/firebase-token";

export const maxDuration = 300; // 5 minutes for bulk fetch

const USER_DASHBOARD_URL =
  "https://overhaulapi.democratiseresearch.in/api/api/analytics/user";

const FIRESTORE_COLLECTION = "analytics_cache";
const FIRESTORE_DOC = "user_dashboards";
const BATCH_SIZE = 10;

interface UserDashboardEntry {
  user_id: string;
  email: string;
  total_papers: number;
  papers_by_source: Record<string, number>;
  total_outputs: Record<string, number>;
  papers: Array<{
    paper_id: string;
    title: string;
    source_type: string;
    created_at: string;
    outputs: string[];
    status: string;
  }>;
  fetched_at: string;
  error?: string;
}

// Fetch dashboard for a single user (generates per-user token)
async function fetchUserDashboard(
  userId: string,
  email: string
): Promise<UserDashboardEntry> {
  try {
    // Generate token for THIS specific user
    const token = await getFirebaseIdTokenForUser(userId);

    const response = await fetch(`${USER_DASHBOARD_URL}/${userId}/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        user_id: userId,
        email,
        total_papers: 0,
        papers_by_source: {},
        total_outputs: {},
        papers: [],
        fetched_at: new Date().toISOString(),
        error: `API returned ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      user_id: userId,
      email,
      total_papers: data.total_papers || 0,
      papers_by_source: data.papers_by_source || {},
      total_outputs: data.total_outputs || {},
      papers: data.papers || [],
      fetched_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      user_id: userId,
      email,
      total_papers: 0,
      papers_by_source: {},
      total_outputs: {},
      papers: [],
      fetched_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Process users in batches
async function fetchAllUserDashboards(
  users: Array<{ uid: string; email: string }>
): Promise<UserDashboardEntry[]> {
  const results: UserDashboardEntry[] = [];

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((user) => fetchUserDashboard(user.uid, user.email))
    );

    results.push(...batchResults);
  }

  return results;
}

// Get all Firebase Auth users with emails
async function getAllUsersWithEmails(): Promise<
  Array<{ uid: string; email: string }>
> {
  const users: Array<{ uid: string; email: string }> = [];
  let pageToken: string | undefined;

  do {
    const listResult = await admin.auth().listUsers(1000, pageToken);
    listResult.users.forEach((user) => {
      if (user.email) {
        users.push({ uid: user.uid, email: user.email });
      }
    });
    pageToken = listResult.pageToken;
  } while (pageToken);

  return users;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  try {
    const db = admin.firestore();
    const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);

    // Check cache first (unless force refresh)
    if (!force) {
      const doc = await docRef.get();
      if (doc.exists) {
        const cached = doc.data();
        // Read dashboards from chunks sub-collection
        const chunksSnapshot = await docRef
          .collection("chunks")
          .orderBy("__name__")
          .get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allDashboards: any[] = [];
        chunksSnapshot.docs.forEach((chunkDoc) => {
          const chunkData = chunkDoc.data();
          if (chunkData.dashboards) {
            allDashboards.push(...chunkData.dashboards);
          }
        });

        return NextResponse.json({
          dashboards: allDashboards,
          total_users: cached?.total_users || 0,
          cached_at: cached?.cached_at || null,
          from_cache: true,
        });
      }
    }

    // Fetch all users from Firebase Auth
    const users = await getAllUsersWithEmails();

    // Fetch dashboards for all users in batches (per-user tokens generated internally)
    const dashboards = await fetchAllUserDashboards(users);

    // Store in Firestore (split into sub-documents if too large)
    const cacheData = {
      dashboards,
      total_users: users.length,
      cached_at: new Date().toISOString(),
    };

    // Firestore has a 1MB document limit, so store dashboards in chunks
    const CHUNK_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < dashboards.length; i += CHUNK_SIZE) {
      chunks.push(dashboards.slice(i, i + CHUNK_SIZE));
    }

    // Store metadata
    await docRef.set({
      total_users: users.length,
      total_chunks: chunks.length,
      cached_at: cacheData.cached_at,
    });

    // Store chunks
    const batch = db.batch();
    chunks.forEach((chunk, index) => {
      const chunkRef = docRef.collection("chunks").doc(`chunk_${index}`);
      batch.set(chunkRef, { dashboards: chunk });
    });
    await batch.commit();

    return NextResponse.json({
      dashboards,
      total_users: users.length,
      cached_at: cacheData.cached_at,
      from_cache: false,
    });
  } catch (error) {
    console.error("Error fetching user dashboards:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
