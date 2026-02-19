import admin from "./firebase-admin";

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// Service UID used to generate custom tokens
const SERVICE_UID = "saral-analytics-service";

/**
 * Get a Firebase ID token for server-to-server API calls.
 * 
 * Flow:
 * 1. Create a custom token using Firebase Admin SDK
 * 2. Exchange it for an ID token via Firebase Auth REST API
 * 3. Cache the token in memory (auto-refresh 5 min before expiry)
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
