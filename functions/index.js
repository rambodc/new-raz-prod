import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";

initializeApp();

/** Bump when the deployed functions change, so a deploy can be confirmed end to end. */
export const FUNCTIONS_VERSION = "2026.10.25-ui-reset";

export function platformHealth() {
  return { status: "ok", service: "razzberry", version: FUNCTIONS_VERSION, checkedAt: new Date().toISOString() };
}

/** Minimal callable that keeps the Functions package valid and confirms which version is live. */
export const healthCheck = onCall({ region: "us-central1" }, () => platformHealth());
