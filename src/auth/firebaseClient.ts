import { Capacitor } from "@capacitor/core";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, initializeAuth, type Auth } from "firebase/auth";

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

function createAuth(firebaseApp: FirebaseApp): Auth {
  // WKWebView can leave IndexedDB persistence unresolved, which keeps the shell on the splash.
  // The website keeps the default Firebase persistence.
  if (!Capacitor.isNativePlatform()) return getAuth(firebaseApp);
  try {
    return initializeAuth(firebaseApp, { persistence: browserLocalPersistence });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const auth = createAuth(app);

/** Firestore and Functions are loaded on demand, so the sign-in pages stay small. */
export async function getDb() {
  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(app);
}

export async function getFns() {
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(app, "us-central1");
}
