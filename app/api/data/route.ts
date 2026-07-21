import { NextResponse } from "next/server";
import { readHistory } from "@/lib/storage";

export async function GET() {
  try {
    const history = await readHistory();

    return NextResponse.json(
      { history },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching history data:", error);
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
