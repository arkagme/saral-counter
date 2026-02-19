import admin from "./firebase-admin";

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// Service UID used to generate custom tokens for platform-wide endpoints
const SERVICE_UID = "saral-analytics-service";

/**
 * Get a Firebase ID token for platform-wide API calls (no user context needed).
 * Uses a service UID. Cached in memory with auto-refresh.
 */
export async function getFirebaseIdToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("FIREBASE_API_KEY environment variable is not set");
  }

  try {
    // Step 1: Create a custom token
    const customToken = await admin.auth().createCustomToken(SERVICE_UID);

    // Step 2: Exchange custom token for ID token via Firebase REST API
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: customToken,
          returnSecureToken: true,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to exchange custom token: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    cachedToken = data.idToken;
    // ID tokens expire in 1 hour (3600 seconds)
    tokenExpiry = now + (parseInt(data.expiresIn, 10) || 3600) * 1000;

    return cachedToken!;
  } catch (error) {
    // Reset cache on failure
    cachedToken = null;
    tokenExpiry = 0;
    throw error;
  }
}

/**
 * Get a Firebase ID token for a SPECIFIC user.
 * The external API enforces that the bearer token's UID must match
 * the user_id in the URL, so we impersonate each user.
 * NOT cached — each call generates a fresh token.
 */
export async function getFirebaseIdTokenForUser(uid: string): Promise<string> {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("FIREBASE_API_KEY environment variable is not set");
  }

  const customToken = await admin.auth().createCustomToken(uid);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to exchange token for user ${uid}: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return data.idToken;
}
