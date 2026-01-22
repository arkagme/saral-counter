import { NextResponse } from "next/server";
import admin from "firebase-admin";

// Set maximum execution time (60s for Pro, 10s for Hobby)
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

async function getUserCount() {
  let count = 0;
  let pageToken: string | undefined;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      count += listUsersResult.users.length;
      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    return count;
  } catch (error) {
    console.error("Error counting users:", error);
    throw error;
  }
}

async function sendSlackNotification(count: number, previousCount: number) {
  if (
    !process.env.SLACK_WEBHOOK_URL ||
    process.env.SLACK_WEBHOOK_URL.includes("YOUR")
  ) {
    console.log("Slack webhook not configured, skipping notification");
    return;
  }

  const change = count - previousCount;
  const emoji = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";
  const changeText = change > 0 ? `+${change}` : change.toString();

  const message = {
    text: `Daily User Report ${emoji}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📊 Daily User Report - ${new Date().toLocaleDateString()}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Total Users:*\n${count.toLocaleString()}`,
          },
          {
            type: "mrkdwn",
            text: `*Change from Yesterday:*\n${changeText} ${emoji}`,
          },
        ],
      },
    ],
  };

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
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
          error: "Add ?secret=YOUR_CRON_SECRET to manually trigger",
        },
        { status: 401 },
      );
    }

    // Quick env check
    const envCheck = {
      hasFirebaseProject: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasFirebaseKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      hasCronSecret: !!process.env.CRON_SECRET,
    };

    console.log("Environment check:", envCheck);

    if (
      !envCheck.hasFirebaseProject ||
      !envCheck.hasFirebaseEmail ||
      !envCheck.hasFirebaseKey
    ) {
      return NextResponse.json(
        {
          error: "Firebase credentials missing",
          envCheck,
        },
        { status: 500 },
      );
    }

    if (!envCheck.hasBlobToken) {
      return NextResponse.json(
        {
          error: "BLOB_READ_WRITE_TOKEN missing - enable Vercel Blob Storage",
          envCheck,
        },
        { status: 500 },
      );
    }

    console.log("Starting user count...");
    // Get current user count with timeout
    const count = await Promise.race([
      getUserCount(),
      new Promise<number>((_, reject) =>
        setTimeout(
          () => reject(new Error("Firebase getUserCount timed out after 30s")),
          30000,
        ),
      ),
    ]);

    console.log(`User count: ${count}, took ${Date.now() - startTime}ms`);
    const today = new Date().toISOString().split("T")[0];

    // Get historical data from Vercel Blob
    let history: Array<{ date: string; count: number }> = [];
    let blobExists = false;

    try {
      console.log("Fetching blob history...");
      const { head } = await import("@vercel/blob");
      const blob = await head("user-history.json");
      console.log("Blob found:", blob.url);
      const response = await fetch(blob.url);
      const data = await response.json();
      history = data.history || [];
      blobExists = true;
      console.log(`History loaded: ${history.length} entries`);
    } catch (error) {
      console.log(
        "No history found, creating initial data:",
        error instanceof Error ? error.message : error,
      );
    }

    // Get previous count
    const previousCount =
      history.length > 0 ? history[history.length - 1].count : count;

    // Add today's count
    const newEntry = { date: today, count };
    const updatedHistory = [
      ...history.filter((h) => h.date !== today),
      newEntry,
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Save to Vercel Blob
    console.log("Saving to blob...");
    const { put } = await import("@vercel/blob");
    const result = await put(
      "user-history.json",
      JSON.stringify({ history: updatedHistory }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      },
    );
    console.log("Blob saved:", result.url);

    // Send Slack notification
    console.log("Sending Slack notification...");
    await sendSlackNotification(count, previousCount);
    console.log("Notification sent");

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      count,
      change: count - previousCount,
      date: today,
      blobUrl: result.url,
      blobExists,
      historyLength: updatedHistory.length,
      executionTime: `${totalTime}ms`,
      message:
        "User count updated successfully! Check /api/data to see the history.",
    });
  } catch (error) {
    console.error("Manual trigger error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const totalTime = Date.now() - startTime;

    return NextResponse.json(
      {
        error: message,
        executionTime: `${totalTime}ms`,
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
