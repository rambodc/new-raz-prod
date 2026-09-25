import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { app } from "./firebaseApp";

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || "us-central1");
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
if (appCheckSiteKey) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
