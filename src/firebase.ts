import { initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

export type FirebaseClient = {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
};

function envValue(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

let pending: Promise<FirebaseClient> | null = null;

export function client(): Promise<FirebaseClient> {
  pending ??= init();
  return pending;
}

async function init(): Promise<FirebaseClient> {
  const app = initializeApp({
    apiKey: envValue(import.meta.env.VITE_FIREBASE_API_KEY, "demo-api-key"),
    authDomain: envValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "new-raz-prod.firebaseapp.com"),
    projectId: envValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, "new-raz-prod"),
    storageBucket: envValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, "new-raz-prod.firebasestorage.app"),
    messagingSenderId: envValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, "555086285693"),
    appId: envValue(import.meta.env.VITE_FIREBASE_APP_ID, "1:555086285693:web:9b4efe2d2aa152f4849a14"),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, "us-central1");
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  await setPersistence(auth, browserLocalPersistence);
  return { auth, db, storage, functions };
}
