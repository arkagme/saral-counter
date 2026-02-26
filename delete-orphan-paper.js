const admin = require("firebase-admin");
const sa = require("./saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json");
if (!admin.apps.length)
  admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const docs = await db.collection("paper_metadata").get();
  const orphans = docs.docs.filter((d) => !d.data().user_id);
  console.log("Total paper_metadata docs:", docs.size);
  console.log("Orphans (no user_id):", orphans.length);

  if (orphans.length === 0) {
    console.log("All clear — no orphans found.");
    process.exit(0);
  }

  for (const orphan of orphans) {
    const title = orphan.data().metadata?.title || "(no title)";
    console.log(`Deleting: ${orphan.id} — "${title}"`);
    await db.collection("paper_metadata").doc(orphan.id).delete();
    console.log("  Deleted.");
  }

  const after = await db.collection("paper_metadata").get();
  console.log(`\nDone. paper_metadata count is now: ${after.size}`);
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
