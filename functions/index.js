import { onCall, HttpsError } from "firebase-functions/v2/https";

export function platformHealth() {
  return { status: "ok", service: "razzberry", checkedAt: new Date().toISOString() };
}

// Keep this platform smoke check available only to authenticated starter users.
export const healthCheck = onCall({ region: "us-central1" }, (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to check workspace services.");
  }
  return platformHealth();
});
