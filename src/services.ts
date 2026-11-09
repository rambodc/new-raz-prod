import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable, FunctionsError } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { client } from "./firebase";
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
};

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
      void getDoc(doc(db, "users", user.uid))
        .then((snap) => {
          onChange({
            status: "signed-in",
            uid: user.uid,
            email: user.email ?? "",
            profile: snap.exists() ? readProfile(snap.data()) : null,
          });
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

export async function requestCode(email: string): Promise<void> {
  const { functions } = await client();
  const send = httpsCallable(functions, "sendLoginCode");
  await send({ email });
}

export async function verifyCode(email: string, code: string): Promise<{ needsProfile: boolean }> {
  const { auth, functions } = await client();
  const verify = httpsCallable<{ email: string; code: string }, { token: string; needsProfile: boolean }>(functions, "verifyLoginCode");
  const result = await verify({ email, code });
  const token = result.data?.token;
  if (typeof token !== "string" || token.length === 0) throw new Error("Could not finish signing you in.");
  await signInWithCustomToken(auth, token);
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

export async function signOutUser(): Promise<void> {
  const { auth } = await client();
  await signOut(auth);
}
