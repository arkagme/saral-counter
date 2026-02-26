/**
 * manage-orphans.js
 * Detects orphaned paper_metadata documents (missing user_id) and
 * interactively prompts before deleting each one.
 *
 * Usage:
 *   node manage-orphans.js           — interactive (ask per orphan)
 *   node manage-orphans.js --all     — delete all orphans without prompting
 *   node manage-orphans.js --dry-run — list orphans only, no deletion
 */

const admin = require("firebase-admin");
const readline = require("readline");
const sa = require("./saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json");

if (!admin.apps.length)
  admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DELETE_ALL = args.includes("--all");

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTs(firestoreTs) {
  if (!firestoreTs) return "unknown";
  const ms =
    typeof firestoreTs.toMillis === "function"
      ? firestoreTs.toMillis()
      : firestoreTs._seconds * 1000 +
        Math.floor((firestoreTs._nanoseconds || 0) / 1e6);
  return new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");
}

function printOrphan(index, id, data) {
  const title = data.metadata?.title || data.title || "(no title)";
  const source = data.source_type || "unknown";
  const created = formatTs(data.created_at);
  const updated = formatTs(data.updated_at);
  const status = data.status || "—";
  const arxivId = data.metadata?.arxiv_id || "—";
  const patentId = data.metadata?.patent_id || "—";
  const assignee = data.metadata?.assignee || "—";

  console.log(`\n┌─ Orphan #${index} ${"─".repeat(60 - String(index).length)}`);
  console.log(`│  ID          : ${id}`);
  console.log(`│  Title       : ${title}`);
  console.log(`│  Source type : ${source}`);
  console.log(`│  Status      : ${status}`);
  if (arxivId !== "—") console.log(`│  arXiv ID    : ${arxivId}`);
  if (patentId !== "—") console.log(`│  Patent ID   : ${patentId}`);
  if (assignee !== "—") console.log(`│  Assignee    : ${assignee}`);
  console.log(`│  Created     : ${created}`);
  console.log(`│  Updated     : ${updated}`);
  console.log(`└${"─".repeat(68)}`);
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n🔍  Scanning paper_metadata for orphans (missing user_id)…\n");

  const snapshot = await db.collection("paper_metadata").get();
  const total = snapshot.size;
  const orphans = snapshot.docs.filter((d) => !d.data().user_id);

  console.log(`   Total docs  : ${total}`);
  console.log(`   Orphans     : ${orphans.length}`);

  if (orphans.length === 0) {
    console.log("\n✅  No orphans found — everything looks clean.\n");
    process.exit(0);
  }

  // ── Print details for every orphan ──────────────────────────────────────────
  orphans.forEach((doc, i) => printOrphan(i + 1, doc.id, doc.data()));

  if (DRY_RUN) {
    console.log("\n⚠️   Dry-run mode — no documents were deleted.\n");
    process.exit(0);
  }

  // ── Interactive / bulk deletion ──────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let deleted = 0;
  let skipped = 0;

  if (DELETE_ALL) {
    console.log(
      "\n⚡  --all flag set — deleting all orphans without prompting…",
    );
  }

  for (let i = 0; i < orphans.length; i++) {
    const doc = orphans[i];
    const data = doc.data();
    const title = data.metadata?.title || data.title || "(no title)";

    let confirm = "y";

    if (!DELETE_ALL) {
      confirm = await ask(rl, `\nDelete orphan #${i + 1} "${title}" [y/N]? `);
      confirm = confirm.trim().toLowerCase();
    }

    if (confirm === "y" || confirm === "yes") {
      await db.collection("paper_metadata").doc(doc.id).delete();
      console.log(`🗑️   Deleted: ${doc.id} — "${title}"`);
      deleted++;
    } else {
      console.log(`⏭️   Skipped: ${doc.id}`);
      skipped++;
    }
  }

  rl.close();

  // ── Final summary ──────────────────────────────────────────────────────────
  const after = await db.collection("paper_metadata").get();
  console.log(`\n${"═".repeat(70)}`);
  console.log(`   Orphans found   : ${orphans.length}`);
  console.log(`   Deleted         : ${deleted}`);
  console.log(`   Skipped         : ${skipped}`);
  console.log(`   Remaining total : ${after.size} paper_metadata docs`);
  console.log(`${"═".repeat(70)}\n`);

  process.exit(0);
})().catch((e) => {
  console.error("\n❌  Error:", e.message);
  process.exit(1);
});
