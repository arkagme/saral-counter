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

  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get current user count
    const count = await getUserCount();
    const today = new Date().toISOString().split("T")[0];

    // Get historical data from Vercel Blob
    let history: Array<{ date: string; count: number }> = [];
    try {
      const { head } = await import("@vercel/blob");
      const blob = await head("user-history.json");
      const response = await fetch(blob.url);
      const data = await response.json();
      history = data.history || [];
    } catch {
      console.log("No history found, starting fresh");
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
    const { put } = await import("@vercel/blob");
    await put(
      "user-history.json",
      JSON.stringify({ history: updatedHistory }),
      {
        access: "public",
        addRandomSuffix: false,
      },
    );

    // Send Slack notification
    await sendSlackNotification(count, previousCount);

    return NextResponse.json({
      success: true,
      count,
      change: count - previousCount,
      date: today,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
