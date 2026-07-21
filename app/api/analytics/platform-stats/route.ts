import { NextResponse } from "next/server";
import { getFirebaseIdToken } from "@/lib/firebase-token";

export const maxDuration = 45;
const PLATFORM_STATS_TIMEOUT_MS = 20000;

const PLATFORM_STATS_URL =
  "https://overhaulapi.democratiseresearch.in/api/analytics/platform/stats";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedData: { data: Record<string, number>; timestamp: number } | null =
  null;

export async function GET() {
  // Return cached data if fresh
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cachedData.data);
  }

  try {
    const token = await getFirebaseIdToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PLATFORM_STATS_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(PLATFORM_STATS_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Platform stats API error:", response.status, errorText);
      return NextResponse.json(
        { error: `External API returned ${response.status}` },
        { status: response.status },
      );
    }

    const raw = await response.json();
    const ps = raw.data?.platform_stats ?? raw.platform_stats ?? {};

    const data = {
      users: ps.total_users ?? 0,
      logins: ps.total_logins ?? 0,
      papers: ps.total_papers ?? 0,
      videos: ps.total_videos ?? 0,
      reels: ps.total_reels ?? 0,
      podcasts: ps.total_podcasts ?? 0,
      posters: ps.total_posters ?? 0,
      business_briefs: ps.total_business_briefs ?? 0,
    };

    cachedData = { data, timestamp: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Serve stale cache if upstream times out
      if (cachedData) {
        return NextResponse.json(cachedData.data);
      }
      return NextResponse.json(
        { error: "Platform stats upstream timeout" },
        { status: 504 },
      );
    }
    console.error("Error fetching platform stats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
