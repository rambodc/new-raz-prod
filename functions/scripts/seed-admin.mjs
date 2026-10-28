// One-off: make an existing account an admin.
//   cd functions && npm ci
//   gcloud auth application-default login          (or set GOOGLE_APPLICATION_CREDENTIALS)
//   node scripts/seed-admin.mjs someone@example.com
// The person must already have signed up in the app. This writes admins/{uid}, which clients cannot write.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/seed-admin.mjs <email>");
  process.exit(1);
}

initializeApp({ projectId: "new-raz-prod" });
const user = await getAuth().getUserByEmail(email.trim().toLowerCase());
await getFirestore().doc(`admins/${user.uid}`).set({ email: user.email, addedAt: new Date() });
console.log(`${user.email} (${user.uid}) is now an admin.`);
