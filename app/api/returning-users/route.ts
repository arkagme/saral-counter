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

// NOTE: Firebase Auth only stores two timestamps per user:
//   • creationTime  → the very first sign-in (account creation)
//   • lastSignInTime → the most recent sign-in
// There is NO per-login history or login-count stored in Firebase Auth.
// "loginSpanDays" = calendar days between first and last login (span, not active-day count).

interface ReturningUser {
  email: string;
  firstLogin: string; // creationTime (ISO date)
  lastLogin: string; // lastSignInTime (ISO date)
  loginSpanDays: number; // calendar days between first and last login
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

        // Compare calendar dates (YYYY-MM-DD), not raw timestamps.
        // A "returning user" = someone whose last sign-in is on a DIFFERENT
        // calendar day than their account-creation day.
        const firstDate = creationTime.toISOString().split("T")[0];
        const lastDate = lastSignInTime.toISOString().split("T")[0];

        if (firstDate === lastDate) return; // only logged in on the day they signed up

        // Span in whole calendar days between first and last login
        const diffMs = lastSignInTime.getTime() - creationTime.getTime();
        const loginSpanDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        returningUsers.push({
          email: user.email,
          firstLogin: firstDate,
          lastLogin: lastDate,
          loginSpanDays,
        });
      });

      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    // Sort by loginSpanDays descending: longest-running users first
    returningUsers.sort((a, b) => b.loginSpanDays - a.loginSpanDays);

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
