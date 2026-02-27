#!/usr/bin/env node
/**
 * Diagnoses the 1-user gap between:
 *   Platform Statistics users  = 5,146   (displayedPlatformStats.users)
 *   User Content Dashboards    = 5,145   (filteredUserDashboards.length)
 *   Live User Count            = 5,145   (displayedLiveCount)
 * when the "Show team data" toggle is OFF.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ── Load .env.local ──────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  // Join continuation lines (lines without KEY=) onto their previous entry
  const rawLines = fs.readFileSync(envPath, "utf8").split("\n");
  const joined = [];
  for (const line of rawLines) {
    if (/^[^=:#\s][^=]*=/.test(line) || joined.length === 0) {
      joined.push(line);
    } else {
      joined[joined.length - 1] += line.trim();
    }
  }
  joined.forEach((line) => {
    const match = line.match(/^([^=:#\s][^=]*)=(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

// ── Internal emails from env (same logic as lib/internal-emails.ts) ──
const INTERNAL_EMAILS = new Set(
  (process.env.INTERNAL_TEAM_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

const SYSTEM_UIDS = new Set(["dev-swagger-user", "saral-analytics-service"]);

// ── Init Firebase Admin ──────────────────────────────────────────────
const svcPath = path.join(
  __dirname,
  "saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json",
);
if (!admin.apps.length) {
  if (fs.existsSync(svcPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(svcPath)),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(
          /\\n/g,
          "\n",
        ),
      }),
    });
  }
}
const db = admin.firestore();
const auth = admin.auth();

// ── Helpers ──────────────────────────────────────────────────────────
async function getAllAuthUsers() {
  const users = [];
  let page = await auth.listUsers(1000);
  while (true) {
    users.push(...page.users);
    if (!page.pageToken) break;
    page = await auth.listUsers(1000, page.pageToken);
  }
  return users;
}

async function getAllCachedDashboards() {
  const docRef = db.collection("analytics_cache").doc("user_dashboards");
  const doc = await docRef.get();
  if (!doc.exists) return [];
  const chunksSnap = await docRef
    .collection("chunks")
    .orderBy("__name__")
    .get();
  const all = [];
  chunksSnap.docs.forEach((d) => {
    if (d.data().dashboards) all.push(...d.data().dashboards);
  });
  return all;
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  TOGGLE-OFF DISCREPANCY DIAGNOSTIC");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Internal emails configured
  console.log(`📧 INTERNAL_TEAM_EMAILS (${INTERNAL_EMAILS.size} addresses):`);
  [...INTERNAL_EMAILS].forEach((e) => console.log(`   • ${e}`));
  console.log(
    `\n🤖 SYSTEM_EXCLUDED_USER_IDS: ${[...SYSTEM_UIDS].join(", ")}\n`,
  );

  // 2. Firebase Auth
  console.log("⏳ Fetching Firebase Auth users…");
  const authUsers = await getAllAuthUsers();
  const authWithEmail = authUsers.filter((u) => !!u.email);
  const authWithoutEmail = authUsers.filter((u) => !u.email);
  const rawLiveCount = authWithEmail.length;

  // Which internal emails actually exist in Firebase Auth?
  const internalInAuth = authWithEmail.filter((u) =>
    INTERNAL_EMAILS.has(u.email.toLowerCase()),
  );
  const internalUserCount = internalInAuth.length; // what internalUserCount memo produces

  console.log(`\n📊 Firebase Auth`);
  console.log(`   Total users            : ${authUsers.length}`);
  console.log(`   With email  (liveCount): ${rawLiveCount}`);
  console.log(`   Without email          : ${authWithoutEmail.length}`);
  authWithoutEmail.forEach((u) => console.log(`     UID: ${u.uid}`));
  console.log(`   Internal emails in Auth: ${internalUserCount}`);
  internalInAuth.forEach((u) =>
    console.log(`     • ${u.email}  (uid: ${u.uid})`),
  );

  // 3. Firestore cache
  console.log("\n⏳ Fetching cached user dashboards from Firestore…");
  const allCached = await getAllCachedDashboards();

  const systemInCache = allCached.filter((u) => SYSTEM_UIDS.has(u.user_id));
  const nonSystemCached = allCached.filter((u) => !SYSTEM_UIDS.has(u.user_id));
  const internalInCache = nonSystemCached.filter((u) =>
    INTERNAL_EMAILS.has((u.email || "").toLowerCase()),
  );
  const filteredDashboards = nonSystemCached.filter(
    (u) => !INTERNAL_EMAILS.has((u.email || "").toLowerCase()),
  );

  console.log(`\n📊 Cached Dashboards`);
  console.log(`   Total in cache         : ${allCached.length}`);
  console.log(`   System UIDs in cache   : ${systemInCache.length}`);
  systemInCache.forEach((u) =>
    console.log(
      `     • uid=${u.user_id}  email=${u.email || "(none)"}  papers=${u.total_papers || 0}`,
    ),
  );
  console.log(`   Internal emails in cache: ${internalInCache.length}`);
  internalInCache.forEach((u) =>
    console.log(`     • ${u.email}  (uid: ${u.user_id})`),
  );
  console.log(
    `   filteredUserDashboards.length (toggle OFF): ${filteredDashboards.length}`,
  );

  // 4. Platform Stats API
  console.log("\n⏳ Fetching raw platform stats from external API…");
  let rawPlatformUsers = null;
  try {
    // Use the Firebase token approach like the route does
    const tokenResp = await admin.auth().createCustomToken("diagnostic-script");
    // For the API call we just need to know rawPlatformUsers — fetch from Vercel/local
    // instead, estimate from the math we already have
    console.log(
      "   (Skipping direct API call — computing from known values below)",
    );
  } catch (_) {}

  // 5. Reconstruct UI math
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  RECONSTRUCTED UI MATH");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("── Live User Count (displayedLiveCount) ──");
  console.log(`   rawLiveCount (Firebase Auth with email) : ${rawLiveCount}`);
  console.log(
    `   internalUserCount (in Auth & INTERNAL_EMAILS, not system) : ${internalUserCount}`,
  );
  console.log(
    `   displayedLiveCount = ${rawLiveCount} - ${internalUserCount} = ${rawLiveCount - internalUserCount}`,
  );

  console.log(
    "\n── User Content Dashboards (filteredUserDashboards.length) ──",
  );
  console.log(`   allCached              : ${allCached.length}`);
  console.log(`   minus system UIDs      : -${systemInCache.length}`);
  console.log(`   minus internal (cache) : -${internalInCache.length}`);
  console.log(
    `   filteredUserDashboards = ${allCached.length} - ${systemInCache.length} - ${internalInCache.length} = ${filteredDashboards.length}`,
  );

  console.log(
    "\n── Platform Statistics .users (displayedPlatformStats.users) ──",
  );
  console.log(
    "   rawPlatformStats.users = ??? (fetched from external API at runtime)",
  );
  console.log(
    `   systemContrib.users    = ${systemInCache.length}   (cache entries with system UID)`,
  );
  console.log(
    `   teamContrib.users      = ${internalInCache.length}   (cache entries with internal email)`,
  );
  console.log(
    `   displayedPlatformStats.users = rawPlatformStats.users - ${systemInCache.length} - ${internalInCache.length}`,
  );
  console.log(
    `   Currently shows 5,146  →  rawPlatformStats.users must be ${5146 + systemInCache.length + internalInCache.length}`,
  );

  // 6. Key check: internal emails in Auth not in cache (or vice versa)
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  CROSS-CHECKS");
  console.log("═══════════════════════════════════════════════════════════\n");

  const internalInAuthEmails = new Set(
    internalInAuth.map((u) => u.email.toLowerCase()),
  );
  const internalInCacheEmails = new Set(
    internalInCache.map((u) => (u.email || "").toLowerCase()),
  );

  const inAuthNotInCache = [...internalInAuthEmails].filter(
    (e) => !internalInCacheEmails.has(e),
  );
  const inCacheNotInAuth = [...internalInCacheEmails].filter(
    (e) => !internalInAuthEmails.has(e),
  );

  if (inAuthNotInCache.length) {
    console.log(
      `⚠️  Internal emails in Firebase Auth but NOT in cache (${inAuthNotInCache.length}):`,
    );
    inAuthNotInCache.forEach((e) => console.log(`   • ${e}`));
    console.log(
      "   → These reduce displayedLiveCount but NOT displayedPlatformStats.users",
    );
    console.log(
      "     (platform-stats subtract from cache; these aren't there to subtract)",
    );
  } else {
    console.log("✅ All internal Auth users are also in the cache.");
  }

  if (inCacheNotInAuth.length) {
    console.log(
      `\n⚠️  Internal emails in cache but NOT in Firebase Auth (${inCacheNotInAuth.length}):`,
    );
    inCacheNotInAuth.forEach((e) => console.log(`   • ${e}`));
    console.log(
      "   → These reduce displayedPlatformStats.users but NOT displayedLiveCount",
    );
  } else {
    console.log("✅ All internal cache users are also in Firebase Auth.");
  }

  // 7. System UIDs in Auth
  const systemInAuth = authUsers.filter((u) => SYSTEM_UIDS.has(u.uid));
  console.log(`\n── System UIDs in Firebase Auth: ${systemInAuth.length} ──`);
  systemInAuth.forEach((u) =>
    console.log(`   • uid=${u.uid}  email=${u.email || "(none)"}`),
  );
  if (systemInAuth.length === 0) {
    console.log(
      "   → System UIDs are NOT in Firebase Auth at all (as expected).",
    );
    console.log(
      "     So liveCount never includes them — only the cache side subtracts them",
    );
    console.log(
      "     from platform stats. This is correct and is NOT the gap.",
    );
  }

  // 8. Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY OF GAP");
  console.log("═══════════════════════════════════════════════════════════\n");

  const liveShown = rawLiveCount - internalUserCount;
  const dashboardShown = filteredDashboards.length;
  const rawPlatEst = 5146 + systemInCache.length + internalInCache.length;
  const platformShown =
    rawPlatEst - systemInCache.length - internalInCache.length;

  console.log(`  displayedLiveCount             : ${liveShown}`);
  console.log(`  filteredUserDashboards.length  : ${dashboardShown}`);
  console.log(
    `  displayedPlatformStats.users   : ${platformShown}  (estimated from UI value)`,
  );
  console.log();

  const gapPlatVsLive = platformShown - liveShown;
  const gapPlatVsDash = platformShown - dashboardShown;

  console.log(`  Gap: platform - live      = ${gapPlatVsLive}`);
  console.log(`  Gap: platform - dashboard = ${gapPlatVsDash}`);
  console.log();

  if (inAuthNotInCache.length > 0) {
    console.log(
      `💡 ROOT CAUSE: ${inAuthNotInCache.length} internal email(s) exist in Firebase Auth`,
    );
    console.log("   but have NO entry in the Firestore cache.");
    console.log("   - displayedLiveCount subtracts them (they ARE in Auth).");
    console.log(
      "   - displayedPlatformStats.users does NOT subtract them (no cache entry → teamContrib misses them).",
    );
    console.log(
      "   - filteredUserDashboards excludes them only if they appear in cache, so the dashboard count may be unaffected.",
    );
    console.log(
      "\n   FIX: Either add their cache entries (run sync) — or subtract internalUserCount",
    );
    console.log(
      "   from platformStats.users instead of relying solely on the cache-based teamContrib.",
    );
  } else if (gapPlatVsLive === 1 && gapPlatVsDash === 1) {
    console.log(
      "💡 Likely ROOT CAUSE: rawPlatformStats.users (from external API) counts 1 extra user",
    );
    console.log(
      "   that is neither in the cache nor in Firebase Auth with email.",
    );
    console.log(
      "   This could be a platform-side user who never completed Firebase registration.",
    );
  } else {
    console.log(
      "💡 No clear single cause found from cache/auth data — the external platform API",
    );
    console.log(
      "   may be counting users differently. Check the raw platformStats.users value at runtime.",
    );
  }

  process.exit(0);
})();
