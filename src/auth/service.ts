import { normalizeEmail, normalizeName } from "./validation";

/** Minimal user shape the UI needs (keeps Firebase types out of components and tests). */
export type AuthUser = { uid: string; displayName: string | null; email: string | null };

type FirebaseUserLike = { uid: string; displayName: string | null; email: string | null };

const toUser = (u: FirebaseUserLike | null): AuthUser | null => (u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null);

/** Subscribe to auth state. Firebase is imported lazily so the home page paints without it. */
export async function subscribeToAuth(onUser: (user: AuthUser | null) => void, onError: (error: unknown) => void): Promise<() => void> {
  try {
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("./firebaseClient"), import("firebase/auth")]);
    return onAuthStateChanged(auth, (u) => onUser(toUser(u)), onError);
  } catch (error) {
    onError(error);
    return () => {};
  }
}

export async function currentUser(): Promise<AuthUser | null> {
  const { auth } = await import("./firebaseClient");
  return toUser(auth.currentUser);
}

export async function signIn(email: string, password: string): Promise<void> {
  const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([import("./firebaseClient"), import("firebase/auth")]);
  await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

/**
 * Creates the account, sets the display name and writes `users/{uid}`.
 * The profile document is best-effort: the account exists even if that write fails.
 */
export async function signUp(input: { name: string; email: string; password: string }): Promise<{ profileSaved: boolean }> {
  const [{ auth, getDb }, authSdk] = await Promise.all([import("./firebaseClient"), import("firebase/auth")]);
  const displayName = normalizeName(input.name);
  const credential = await authSdk.createUserWithEmailAndPassword(auth, normalizeEmail(input.email), input.password);
  try {
    await authSdk.updateProfile(credential.user, { displayName });
  } catch (error) {
    console.warn("Could not set the display name", error);
  }
  let profileSaved = true;
  try {
    const [db, { doc, setDoc, serverTimestamp }] = await Promise.all([getDb(), import("firebase/firestore")]);
    await setDoc(doc(db, "users", credential.user.uid), {
      displayName,
      email: credential.user.email,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    profileSaved = false;
    console.warn("Could not save the user profile document", error);
  }
  return { profileSaved };
}

export async function sendPasswordReset(email: string): Promise<void> {
  const [{ auth }, { sendPasswordResetEmail }] = await Promise.all([import("./firebaseClient"), import("firebase/auth")]);
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function signOutUser(): Promise<void> {
  const [{ auth }, { signOut }] = await Promise.all([import("./firebaseClient"), import("firebase/auth")]);
  await signOut(auth);
}
