import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";

initializeApp();

export function platformHealth() {
  return { status: "ok", service: "razzberry", checkedAt: new Date().toISOString() };
}

/** Minimal callable that keeps the Functions package valid and deployable. */
export const healthCheck = onCall({ region: "us-central1" }, () => platformHealth());
