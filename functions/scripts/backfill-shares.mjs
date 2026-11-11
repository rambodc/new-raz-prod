// Idempotent slug backfill. It never deletes artists, events, or tracks.
// Run after the share functions are deployed so preview images generate from the writes:
//   node functions/scripts/backfill-shares.mjs
// Against the emulators, set FIRESTORE_EMULATOR_HOST first.

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { backfillShares } from "../lib/shares.js";

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "new-raz-prod";
initializeApp({ projectId });
const stats = await backfillShares(getFirestore());
console.log(JSON.stringify({ projectId, ...stats }));
