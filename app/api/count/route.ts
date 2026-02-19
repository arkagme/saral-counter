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

async function getUserCount() {
  let count = 0;
  let pageToken: string | undefined;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      count += listUsersResult.users.filter((u) => u.email).length;
      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    return count;
  } catch (error) {
    console.error("Error counting users:", error);
    throw error;
  }
}

export async function GET() {
  const startTime = Date.now();

  try {
    // Get real-time user count
    const count = await getUserCount();
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      count,
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
    });
  } catch (error) {
    console.error("Error fetching real-time count:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: message,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
