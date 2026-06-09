#!/usr/bin/env node
/**
 * COMPREHENSIVE AUDIT: User Count Discrepancy
 *
 * Investigates why:
 *   Live User Count      = 5147  (Firebase Auth, emails only)
 *   Platform Stats       = 5149  (External Saral API)
 *   User Dashboards Cache= 5148  (Firestore cached snapshot)
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ─── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    });
  console.log("✅ Loaded .env.local\n");
} else {
  console.warn("⚠️  No .env.local found — relying on system env vars\n");
}

// ─── Init Firebase Admin ───────────────────────────────────────────────────────
const serviceAccountPath = path.join(
  __dirname,
  "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
);

if (!admin.apps.length) {
  if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
    });
    console.log("✅ Firebase Admin initialised via service account JSON\n");
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin initialised via env vars\n");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function separator(title) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

// ─── 1. Firebase Auth full audit ───────────────────────────────────────────────
async function auditFirebaseAuth() {
  separator("1. FIREBASE AUTH — Full User Enumeration");

  let totalUsers = 0;
  let withEmail = 0;
  let withoutEmail = 0;
  let emailVerified = 0;
  let emailUnverified = 0;
  let googleProvider = 0;
  let passwordProvider = 0;
  let otherProvider = 0;
  let disabled = 0;
  let pageToken;
  const allEmails = new Set();

  do {
    const result = await admin.auth().listUsers(1000, pageToken);
    result.users.forEach((u) => {
      totalUsers++;
      if (u.email) {
        withEmail++;
        allEmails.add(u.email.toLowerCase());
        if (u.emailVerified) emailVerified++;
        else emailUnverified++;
      } else {
        withoutEmail++;
      }
      if (u.disabled) disabled++;
      const providers = (u.providerData || []).map((p) => p.providerId);
      if (providers.includes("google.com")) googleProvider++;
      if (providers.includes("password")) passwordProvider++;
      if (!providers.includes("google.com") && !providers.includes("password"))
        otherProvider++;
    });
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`Total Firebase Auth users (all) : ${totalUsers}`);
  console.log(
    `  → With email                  : ${withEmail}   ← used by /api/count`,
  );
  console.log(`  → Without email               : ${withoutEmail}`);
  console.log(`  → Email verified              : ${emailVerified}`);
  console.log(`  → Email NOT verified          : ${emailUnverified}`);
  console.log(`  → Disabled accounts           : ${disabled}`);
  console.log(`  → Google provider             : ${googleProvider}`);
  console.log(`  → Password provider           : ${passwordProvider}`);
  console.log(`  → Other providers             : ${otherProvider}`);

  return { totalUsers, withEmail, withoutEmail, allEmails };
}

// ─── 2. Firestore cache audit ──────────────────────────────────────────────────
async function auditFirestoreCache() {
  separator("2. FIRESTORE CACHE — analytics_cache/user_dashboards");

  const db = admin.firestore();
  const docRef = db.collection("analytics_cache").doc("user_dashboards");

  const doc = await docRef.get();
  if (!doc.exists) {
    console.log("❌ Cache document does NOT exist");
    return { cacheExists: false };
  }

  const meta = doc.data();
  console.log(`Cache metadata:`);
  console.log(`  total_users (stored)  : ${meta.total_users}`);
  console.log(`  total_chunks          : ${meta.total_chunks}`);
  console.log(`  cached_at             : ${meta.cached_at}`);

  // Age of cache
  const cachedAt = new Date(meta.cached_at);
  const ageMs = Date.now() - cachedAt.getTime();
  const ageHours = (ageMs / 3600000).toFixed(1);
  const ageDays = (ageMs / 86400000).toFixed(1);
  console.log(`  Cache age             : ${ageHours} hours (${ageDays} days)`);

  // Read all chunks
  const chunksSnap = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();
  let totalDashboardsInCache = 0;
  let withErrors = 0;
  let withoutErrors = 0;
  const cacheEmails = new Set();

  chunksSnap.docs.forEach((chunkDoc) => {
    const data = chunkDoc.data();
    if (data.dashboards) {
      data.dashboards.forEach((d) => {
        totalDashboardsInCache++;
        if (d.email) cacheEmails.add(d.email.toLowerCase());
        if (d.error) withErrors++;
        else withoutErrors++;
      });
    }
  });

  console.log(
    `\nActual dashboards in chunks : ${totalDashboardsInCache}   ← shown as "X users" in UI`,
  );
  console.log(`  → Without errors          : ${withoutErrors}`);
  console.log(`  → With fetch errors       : ${withErrors}`);
  console.log(`  → Unique emails in cache  : ${cacheEmails.size}`);
  console.log(`  → Chunk docs read         : ${chunksSnap.size}`);
  console.log(
    `\nDrift: meta.total_users (${meta.total_users}) vs actual dashboards (${totalDashboardsInCache}) → diff = ${
      totalDashboardsInCache - meta.total_users
    }`,
  );

  return {
    cacheExists: true,
    metaTotalUsers: meta.total_users,
    cachedAt: meta.cached_at,
    ageHours,
    totalDashboardsInCache,
    withErrors,
    cacheEmails,
  };
}

// ─── 3. Platform Stats API audit ───────────────────────────────────────────────
async function auditPlatformStats() {
  separator("3. PLATFORM STATS API — External Saral Backend");

  const PLATFORM_STATS_URL =
    "https://overhaulapi.democratiseresearch.in/api/api/analytics/platform/stats";
  const SERVICE_UID = "saral-analytics-service";
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    console.log("⚠️  FIREBASE_API_KEY not set — skipping platform stats fetch");
    return { platformUsers: null };
  }

  try {
    // Get custom token → exchange for ID token
    const customToken = await admin.auth().createCustomToken(SERVICE_UID);
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    const signInData = await signInRes.json();
    const idToken = signInData.idToken;

    // Call platform stats
    const statsRes = await fetch(PLATFORM_STATS_URL, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!statsRes.ok) {
      console.log(`❌ Platform stats API returned HTTP ${statsRes.status}`);
      return { platformUsers: null };
    }

    const stats = await statsRes.json();
    console.log(`Raw response from platform stats API:`);
    console.log(JSON.stringify(stats, null, 2));
    console.log(`\nusers field (raw, no adjustment) : ${stats.users}`);
    console.log(
      `  → Currently route applies      : data.users = data.users  (no-op, comment says -1 but it's not applied)`,
    );
    console.log(`  → Displayed in UI              : ${stats.users}`);

    return { platformUsers: stats.users, rawStats: stats };
  } catch (err) {
    console.log(`❌ Error calling platform stats: ${err.message}`);
    return { platformUsers: null };
  }
}

// ─── 4. Cross-reference discrepancies ─────────────────────────────────────────
async function crossReference(authResult, cacheResult, platformResult) {
  separator("4. CROSS-REFERENCE & ROOT CAUSE ANALYSIS");

  const authCount = authResult.withEmail; // 5147
  const cacheCount = cacheResult.totalDashboardsInCache; // 5148
  const platformCount = platformResult.platformUsers; // 5149

  console.log(`SUMMARY OF COUNTS:`);
  console.log(`  Firebase Auth (with email)   : ${authCount}   ← /api/count`);
  console.log(
    `  Firestore Dashboard Cache    : ${cacheCount}   ← User Content Dashboards`,
  );
  console.log(
    `  Platform Stats API (raw)     : ${platformCount}   ← Platform Statistics`,
  );

  console.log(`\nDISCREPANCIES:`);

  // A: Cache vs Auth
  const cacheVsAuth = cacheCount - authCount;
  if (cacheVsAuth > 0) {
    console.log(
      `\nA) Cache has ${cacheVsAuth} MORE entry/entries than Firebase Auth:`,
    );
    console.log(
      `   → The cache was built at ${cacheResult.cachedAt} (${cacheResult.ageHours}h ago)`,
    );
    console.log(
      `   → Since then, ${cacheVsAuth} user(s) were DELETED from Firebase Auth but remain in the cache`,
    );

    // Find which emails are in cache but not in auth
    const ghostEmails = [...cacheResult.cacheEmails].filter(
      (e) => !authResult.allEmails.has(e),
    );
    if (ghostEmails.length > 0) {
      console.log(`   → Ghost users (in cache, NOT in Firebase Auth):`);
      ghostEmails.forEach((e) => console.log(`       • ${e}`));
    } else {
      console.log(
        `   → Could not find ghost emails (they may have blank email in cache or email casing issue)`,
      );
    }
  } else if (cacheVsAuth < 0) {
    console.log(
      `\nA) Auth has ${Math.abs(cacheVsAuth)} MORE user(s) than cache:`,
    );
    console.log(
      `   → ${Math.abs(cacheVsAuth)} user(s) joined AFTER the last cache sync`,
    );
    console.log(`   → Cache is stale — run a force refresh to update`);
  } else {
    console.log(`\nA) Cache = Firebase Auth ✅ in sync`);
  }

  // B: Platform vs Auth
  if (platformCount !== null) {
    const platVsAuth = platformCount - authCount;
    if (platVsAuth > 0) {
      console.log(
        `\nB) Platform Stats has ${platVsAuth} MORE user(s) than Firebase Auth:`,
      );
      console.log(`   → Possible causes:`);
      console.log(
        `     1. Platform DB registered users that have no email in Firebase Auth`,
      );
      console.log(
        `     2. Platform DB counts users differently (e.g. includes soft-deleted or anonymous)`,
      );
      console.log(
        `     3. "saral-analytics-service" service account itself is counted in platform DB as a user`,
      );
      console.log(
        `     4. Firebase Auth has ${authResult.withoutEmail} user(s) without email — if any map to platform records`,
      );
    } else if (platVsAuth < 0) {
      console.log(
        `\nB) Firebase Auth has ${Math.abs(platVsAuth)} MORE user(s) than Platform Stats:`,
      );
      console.log(
        `   → Some Firebase Auth users never completed onboarding on the platform`,
      );
    } else {
      console.log(`\nB) Platform Stats = Firebase Auth ✅`);
    }

    // C: Platform vs Cache
    const platVsCache = platformCount - cacheCount;
    if (platVsCache !== 0) {
      console.log(
        `\nC) Platform Stats (${platformCount}) vs Cache (${cacheCount}): diff = ${platVsCache}`,
      );
      if (platVsCache > 0)
        console.log(`   → Platform has ${platVsCache} more — cache is behind`);
      else
        console.log(
          `   → Cache has ${Math.abs(platVsCache)} extra ghost entries not in platform`,
        );
    }
  }

  separator("5. CODE-LEVEL AUDIT — Why Each Number is Wrong");

  console.log(`
A) Live User Count = ${authCount} (ACCURATE for Firebase Auth emails)
   Source : /api/count → admin.auth().listUsers() → filter(u => u.email)
   Issue  : Counts only Firebase Auth users WITH an email field set.
            ${authResult.withoutEmail} user(s) have no email → excluded.
            This is the "ground truth" for registered email users.

B) Platform Statistics = ${platformCount} (FROM EXTERNAL API, NO ADJUSTMENT)
   Source : /api/analytics/platform-stats → external Saral backend
   Issue  : The code currently reads:
              data.users = data.users;   // ← THIS IS A NO-OP
            The comment says "-1 (hardcoded correction)" but the subtraction
            was removed/reverted. The raw API value (${platformCount}) passes through unchanged.
            The external API counts users in its OWN database — different source of truth.
            Likely includes service accounts or counts differently.

C) User Dashboards = ${cacheCount} (STALE CACHE, ${cacheResult.ageHours}h OLD)
   Source : Firestore analytics_cache/user_dashboards (chunks)
   Issue  : Cache was last built at ${cacheResult.cachedAt}.
            At that moment Firebase Auth had ${cacheCount} users with email.
            Since then the live count changed to ${authCount} (diff = ${authCount - cacheCount}).
            The UI shows userDashboards.length (actual array size from cache),
            which is ${cacheCount} — NOT the stored meta.total_users (${cacheResult.metaTotalUsers}).
  `);

  separator("6. RECOMMENDED FIXES");
  console.log(`
1. PLATFORM STATS -1 CORRECTION (route.ts line 33):
   The line "data.users = data.users" is a no-op leftover.
   Decide: if the external API overcounts by 2, restore "data.users = data.users - 2"
   or remove the adjustment entirely. Currently it shows the raw API value.

2. CACHE STALENESS (${cacheResult.ageHours}h old):
   Force-refresh the dashboard cache to resync with current Firebase Auth state.
   This will fix the 5148 vs 5147 discrepancy.
   Run: GET /api/analytics/user-dashboards?force=true

3. PLATFORM VS FIREBASE DISCREPANCY (+2):
   Investigate the ${platformCount - authCount} extra users in the platform DB.
   Could be: service accounts, anonymous sign-ins, or orphan platform records.
   Check if "saral-analytics-service" UID is registered as a platform user.
  `);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   USER COUNT DISCREPANCY AUDIT                          ║");
  console.log("║   Expected: Auth=5147  Cache=5148  PlatformAPI=5149     ║");
  console.log(`║   Run time: ${new Date().toISOString()}  ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const authResult = await auditFirebaseAuth();
  const cacheResult = await auditFirestoreCache();
  const platformResult = await auditPlatformStats();
  await crossReference(authResult, cacheResult, platformResult);

  console.log("\n✅ Audit complete.\n");
  process.exit(0);
})().catch((err) => {
  console.error("\n❌ Audit failed:", err);
  process.exit(1);
});
