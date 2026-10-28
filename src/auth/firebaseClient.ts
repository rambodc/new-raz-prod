import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const env = import.meta.env;

/** Firebase web config is public client configuration, supplied at build time. */
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

/** Firestore and Functions are loaded on demand, so the sign-in pages stay small. */
export async function getDb() {
  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(app);
}

export async function getFns() {
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(app, "us-central1");
}
