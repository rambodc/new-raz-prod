import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithCustomToken, signOut, type Auth } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable, FunctionsError } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { client } from "./firebase";
import { readInvite } from "./inviteApi";
import { readProfile, type Profile } from "./profile";
import { resizeImage } from "./resizeImage";

export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; uid: string; email: string; profile: Profile | null };

const REASONS: Record<string, string> = {
  "wrong-code": "That code is incorrect.",
  expired: "That code has expired. Send a new one.",
  "too-many-attempts": "Too many tries. Send a new code.",
  "too-soon": "Please wait a minute before requesting another code.",
  "rate-limited": "Too many codes were requested. Try again later.",
  "bad-email": "Enter a valid email address.",
  "bad-code": "Enter the 6-digit code.",
  "send-failed": "Could not send the email. Try again.",
  "token-failed": "Could not finish signing you in.",
  "same-email": "That's already your email.",
  "email-taken": "That email is already on another account.",
};

export function authFailure(error: unknown): { message: string; reason: string; retryAfterSeconds: number } {
  let reason = "";
  let retryAfterSeconds = 0;
  if (error instanceof FunctionsError && error.details && typeof error.details === "object") {
    const details = error.details as { reason?: unknown; retryAfterSeconds?: unknown };
    if (details.reason) reason = String(details.reason);
    const retry = Number(details.retryAfterSeconds);
    if (Number.isFinite(retry) && retry > 0) retryAfterSeconds = Math.ceil(retry);
  }
  if (!reason && error instanceof FunctionsError && error.code === "functions/resource-exhausted") reason = "too-soon";
  return { message: explain(error), reason, retryAfterSeconds };
}

export function explain(error: unknown): string {
  if (error instanceof FunctionsError) {
    const details = error.details;
    const reason = details && typeof details === "object" && "reason" in details ? String(details.reason) : "";
    if (reason && REASONS[reason]) return REASONS[reason];
    if (error.code === "functions/resource-exhausted") return "Please wait a minute before requesting another code.";
    if (error.code === "functions/unavailable" || error.code === "functions/deadline-exceeded") return "You appear to be offline. Try again.";
    if (error.code === "functions/invalid-argument") return "Check what you entered and try again.";
  }
  if (error instanceof FirebaseError) {
    if (error.code.includes("permission-denied") || error.code.includes("unauthorized")) return "You don't have permission to do that.";
    if (error.code.includes("unavailable") || error.code.includes("deadline-exceeded") || error.code.includes("network-request-failed")) return "You appear to be offline. Try again.";
  }
  if (error instanceof Error && error.message && !error.message.startsWith("Firebase")) return error.message;
  return "Something went wrong. Try again.";
}

export function watchSession(onChange: (session: Session) => void): () => void {
  let stop = () => {};
  let cancelled = false;
  void client().then(({ auth, db }) => {
    if (cancelled) return;
    stop = onAuthStateChanged(auth, (user) => {
      if (!user) {
        onChange({ status: "signed-out" });
        return;
      }
      void loadProfile(db, user.uid)
        .then((profile) => {
          onChange({ status: "signed-in", uid: user.uid, email: user.email ?? "", profile });
        })
        .catch(() => {
          onChange({ status: "signed-in", uid: user.uid, email: user.email ?? "", profile: null });
        });
    });
  }).catch(() => {
    if (!cancelled) onChange({ status: "signed-out" });
  });
  return () => {
    cancelled = true;
    stop();
  };
}

async function loadProfile(db: Awaited<ReturnType<typeof client>>["db"], uid: string): Promise<Profile | null> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? readProfile(snap.data()) : null;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw last;
}

async function settleSignIn(auth: Auth, uid: string): Promise<void> {
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  if (auth.currentUser?.uid === uid) {
    await auth.currentUser.getIdToken();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      reject(new Error("Could not finish signing you in."));
    }, 8000);
    const stop = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid) return;
      window.clearTimeout(timer);
      stop();
      resolve();
    });
  });
  await auth.currentUser?.getIdToken();
  if (auth.currentUser?.uid !== uid) throw new Error("Could not finish signing you in.");
}

export async function requestCode(email: string): Promise<void> {
  const { functions } = await client();
  const send = httpsCallable(functions, "sendLoginCode");
  await send({ email });
}

export async function verifyCode(email: string, code: string): Promise<{ needsProfile: boolean }> {
  const { auth, functions } = await client();
  const verify = httpsCallable<{ email: string; code: string; inviteCode?: string }, { token: string; needsProfile: boolean }>(functions, "verifyLoginCode");
  const inviteCode = readInvite();
  const result = await verify({ email, code, inviteCode: inviteCode || undefined });
  const token = result.data?.token;
  if (typeof token !== "string" || token.length === 0) throw new Error("Could not finish signing you in.");
  const credential = await signInWithCustomToken(auth, token);
  await settleSignIn(auth, credential.user.uid);
  return { needsProfile: result.data.needsProfile === true };
}

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const { storage } = await client();
  const stored = ref(storage, `users/${uid}/avatar`);
  await uploadBytes(stored, blob, { contentType: "image/jpeg", cacheControl: "private,max-age=3600" });
  return getDownloadURL(stored);
}

export async function saveProfile(uid: string, input: { firstName: string; lastName: string; photoURL: string }): Promise<void> {
  const { db } = await client();
  await updateDoc(doc(db, "users", uid), {
    firstName: input.firstName,
    lastName: input.lastName,
    photoURL: input.photoURL,
    updatedAt: serverTimestamp(),
  });
}

export async function requestEmailChange(email: string): Promise<void> {
  const { functions } = await client();
  const send = httpsCallable(functions, "requestEmailChange");
  await send({ email });
}

export async function confirmEmailChange(code: string): Promise<string> {
  const { auth, functions } = await client();
  const confirm = httpsCallable<{ code: string }, { email: string }>(functions, "confirmEmailChange");
  const result = await confirm({ code });
  const email = result.data?.email;
  if (typeof email !== "string" || email.length === 0) throw new Error("Could not update the email.");
  try {
    await auth.currentUser?.reload();
    await auth.currentUser?.getIdToken(true);
  } catch {
    // The address is already saved. A failed token refresh must not look like the change failed.
  }
  return email;
}

export async function signOutUser(): Promise<void> {
  const { auth } = await client();
  await signOut(auth);
}
