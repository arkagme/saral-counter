import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { head } = await import("@vercel/blob");
    const blob = await head("user-history.json");

    const response = await fetch(blob.url, {
      cache: "no-cache",
    });
    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Error fetching blob data:", error);
    return NextResponse.json(
      {
        history: [],
        message:
          "No data yet. Trigger the cron job manually at /api/trigger-count?secret=YOUR_CRON_SECRET",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }
}
