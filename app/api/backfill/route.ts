import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { readHistory, writeHistory } from "@/lib/storage";

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
        if (!user.email) return; // skip service accounts without email
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

    // Step 3: Get existing history from local file
    let existingHistory: Array<{ date: string; count: number }> = [];
    try {
      existingHistory = await readHistory();
      console.log(`Existing history entries: ${existingHistory.length}`);
    } catch {
      console.log("No existing history found");
    }

    // Step 4: Merge historical data with existing data
    // Create a map for quick lookup
    const mergedMap = new Map<string, number>();

    // Add existing cron data first
    existingHistory.forEach((entry) => {
      mergedMap.set(entry.date, entry.count);
    });

    // Override with fresh backfill data (recalculated from Firebase Auth)
    historicalData.forEach((entry) => {
      mergedMap.set(entry.date, entry.count);
    });

    // Convert back to array and sort
    const finalHistory = Array.from(mergedMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`Final merged history: ${finalHistory.length} entries`);

    // Step 5: Save to local file
    console.log("Saving to file...");
    const filePath = await writeHistory(finalHistory);
    console.log("File saved:", filePath);

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
      filePath,
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
