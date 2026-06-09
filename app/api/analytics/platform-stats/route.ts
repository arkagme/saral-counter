import { NextResponse } from "next/server";
import { getFirebaseIdToken } from "@/lib/firebase-token";

export const maxDuration = 30;
const PLATFORM_STATS_TIMEOUT_MS = 12000;

const PLATFORM_STATS_URL =
  "https://overhaulapi.democratiseresearch.in/api/analytics/platform/stats";

export async function GET() {
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

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
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
