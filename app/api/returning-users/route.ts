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

interface ReturningUser {
  email: string;
  createdAt: string;
  lastSignIn: string;
  daysActive: number;
}

async function getReturningUsers(): Promise<{
  returningUsers: ReturningUser[];
  totalUsers: number;
}> {
  const returningUsers: ReturningUser[] = [];
  let totalUsers = 0;
  let pageToken: string | undefined;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      totalUsers += listUsersResult.users.length;

      listUsersResult.users.forEach((user) => {
        if (!user.email) return;

        const creationTime = new Date(user.metadata.creationTime);
        const lastSignInTime = user.metadata.lastSignInTime
          ? new Date(user.metadata.lastSignInTime)
          : null;

        if (!lastSignInTime) return;

        // A "returning user" is one whose last sign-in is meaningfully
        // after their account creation (more than 1 hour gap to filter noise)
        const diffMs = lastSignInTime.getTime() - creationTime.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays >= 1) {
          returningUsers.push({
            email: user.email,
            createdAt: creationTime.toISOString().split("T")[0],
            lastSignIn: lastSignInTime.toISOString().split("T")[0],
            daysActive: diffDays,
          });
        }
      });

      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    // Sort by daysActive descending (most engaged first)
    returningUsers.sort((a, b) => b.daysActive - a.daysActive);

    return { returningUsers, totalUsers };
  } catch (error) {
    console.error("Error fetching returning users:", error);
    throw error;
  }
}

export async function GET() {
  const startTime = Date.now();

  try {
    const { returningUsers, totalUsers } = await getReturningUsers();
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      returningUsers,
      totalUsers,
      returningCount: returningUsers.length,
      returningPercentage:
        totalUsers > 0
          ? ((returningUsers.length / totalUsers) * 100).toFixed(1)
          : "0",
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
    });
  } catch (error) {
    console.error("Error fetching returning users:", error);
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
