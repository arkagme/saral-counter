import { NextResponse } from "next/server";
import admin from "firebase-admin";

// Set maximum execution time
export const maxDuration = 60;

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

interface UsersByDate {
  [date: string]: number;
}

async function getAllUsersWithCreationDates() {
  const usersByDate: UsersByDate = {};
  let pageToken: string | undefined;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);

      listUsersResult.users.forEach((user) => {
        // Get user creation date (metadata.creationTime is ISO string)
        const creationDate = new Date(user.metadata.creationTime);
        const dateKey = creationDate.toISOString().split("T")[0]; // YYYY-MM-DD format

        // Count users per date
        usersByDate[dateKey] = (usersByDate[dateKey] || 0) + 1;
      });

      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    return usersByDate;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

function buildCumulativeHistory(usersByDate: UsersByDate) {
  // Sort dates
  const sortedDates = Object.keys(usersByDate).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  // Build cumulative counts
  let cumulativeCount = 0;
  const history = sortedDates.map((date) => {
    cumulativeCount += usersByDate[date];
    return {
      date,
      count: cumulativeCount,
    };
  });

  return history;
}

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // Optional: Add simple auth for manual triggering
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        {
          error: "Add ?secret=YOUR_CRON_SECRET to manually trigger backfill",
        },
        { status: 401 },
      );
    }

    console.log("Starting backfill process...");

    // Step 1: Get all users with their creation dates
    console.log("Fetching all users from Firebase Auth...");
    const usersByDate = await getAllUsersWithCreationDates();
    console.log(`Users found across ${Object.keys(usersByDate).length} dates`);

    // Step 2: Build cumulative historical dataset
    console.log("Building cumulative history...");
    const historicalData = buildCumulativeHistory(usersByDate);
    console.log(`Historical data points: ${historicalData.length}`);

    // Step 3: Get existing blob data (if any)
    let existingHistory: Array<{ date: string; count: number }> = [];
    try {
      const { head } = await import("@vercel/blob");
      const blob = await head("user-history.json");
      const response = await fetch(blob.url);
      const data = await response.json();
      existingHistory = data.history || [];
      console.log(`Existing history entries: ${existingHistory.length}`);
    } catch {
      console.log("No existing history found");
    }

    // Step 4: Merge historical data with existing data
    // Create a map for quick lookup
    const mergedMap = new Map<string, number>();

    // Add all historical data (from Firebase backfill)
    historicalData.forEach((entry) => {
      mergedMap.set(entry.date, entry.count);
    });

    // Override with existing cron data (cron data is more recent and accurate)
    existingHistory.forEach((entry) => {
      mergedMap.set(entry.date, entry.count);
    });

    // Convert back to array and sort
    const finalHistory = Array.from(mergedMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`Final merged history: ${finalHistory.length} entries`);

    // Step 5: Save to Vercel Blob
    console.log("Saving to blob...");
    const { put } = await import("@vercel/blob");
    const result = await put(
      "user-history.json",
      JSON.stringify({ history: finalHistory }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      },
    );
    console.log("Blob saved:", result.url);

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: "Backfill completed successfully!",
      stats: {
        historicalDataPoints: historicalData.length,
        existingDataPoints: existingHistory.length,
        finalDataPoints: finalHistory.length,
        firstDate: finalHistory[0]?.date,
        lastDate: finalHistory[finalHistory.length - 1]?.date,
        totalUsers: finalHistory[finalHistory.length - 1]?.count,
      },
      blobUrl: result.url,
      executionTime: `${totalTime}ms`,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const totalTime = Date.now() - startTime;

    return NextResponse.json(
      {
        error: message,
        executionTime: `${totalTime}ms`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
