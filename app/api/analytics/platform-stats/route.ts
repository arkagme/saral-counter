import { NextResponse } from "next/server";
import { getFirebaseIdToken } from "@/lib/firebase-token";

export const maxDuration = 30;

const PLATFORM_STATS_URL =
  "https://testload.democratiseresearch.in/api/api/analytics/platform/stats";

export async function GET() {
  try {
    const token = await getFirebaseIdToken();

    const response = await fetch(PLATFORM_STATS_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Platform stats API error:", response.status, errorText);
      return NextResponse.json(
        { error: `External API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Adjust users count by -1 (hardcoded correction)
    if (data.users !== undefined) {
      data.users = data.users -2 ;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
