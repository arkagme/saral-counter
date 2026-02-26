const admin = require("firebase-admin");
const sa = require("./saral-cc011-firebase-adminsdk-fbsvc-bcd0a278a2.json");
if (!admin.apps.length)
  admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const ORPHAN_ID = "cb9f5e8a-51ca-46b6-8cc2-5c301d60dec6";
  const doc = await db.collection("paper_metadata").doc(ORPHAN_ID).get();
  if (!doc.exists) {
    console.log("Document not found.");
    process.exit(0);
  }
  console.log("=== Orphan document ===");
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
})();
