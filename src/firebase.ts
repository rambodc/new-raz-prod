import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { app } from "./firebaseApp";

export const auth = getAuth(app);

void setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Could not enable persistent sign-in", error);
});
