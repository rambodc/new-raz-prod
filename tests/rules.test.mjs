import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { ref, getBytes, uploadBytes } from "firebase/storage";

const projectId = "razzberry-rules-test";
const EMAIL = "ada@example.com";
let testEnv;

const authed = (uid, email = EMAIL) => testEnv.authenticatedContext(uid, { email }).firestore();
const profile = (extra = {}) => ({ displayName: "Ada Lovelace", email: EMAIL, createdAt: serverTimestamp(), ...extra });

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => testEnv.clearFirestore());
after(async () => testEnv?.cleanup());

async function seed(uid = "ada", data = { displayName: "Ada Lovelace", email: EMAIL, createdAt: Timestamp.fromMillis(1_700_000_000_000) }) {
  await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), `users/${uid}`), data));
}

test("a signed-in user can create their own profile", async () => {
  await assertSucceeds(setDoc(doc(authed("ada"), "users/ada"), profile()));
});

test("a signed-in user can read and update their own profile, but not change createdAt", async () => {
  await seed();
  const db = authed("ada");
  await assertSucceeds(getDoc(doc(db, "users/ada")));
  await assertSucceeds(updateDoc(doc(db, "users/ada"), { displayName: "Ada King" }));
  await assertFails(updateDoc(doc(db, "users/ada"), { createdAt: Timestamp.fromMillis(1) }));
});

test("profiles reject unknown fields, wrong types, bad sizes and a spoofed email or timestamp", async () => {
  const db = authed("ada");
  await assertFails(setDoc(doc(db, "users/ada"), profile({ admin: true })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ displayName: 42 })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ displayName: "" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ displayName: "x".repeat(81) })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ email: "someone-else@example.com" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ createdAt: Timestamp.fromMillis(1_000) })));
  await assertFails(setDoc(doc(db, "users/ada"), { displayName: "Ada", email: EMAIL }));
});

test("a user cannot read, create, update or delete another user's profile", async () => {
  await seed("ada");
  const mallory = authed("mallory", "mallory@example.com");
  await assertFails(getDoc(doc(mallory, "users/ada")));
  await assertFails(setDoc(doc(mallory, "users/ada"), profile({ email: "mallory@example.com" })));
  await assertFails(updateDoc(doc(mallory, "users/ada"), { displayName: "Hacked" }));
  await assertFails(deleteDoc(doc(mallory, "users/ada")));
  await assertFails(setDoc(doc(authed("ada"), "users/mallory"), profile()));
});

test("nobody can delete their own profile or list the users collection", async () => {
  await seed();
  const db = authed("ada");
  await assertFails(deleteDoc(doc(db, "users/ada")));
  await assertFails(getDocs(collection(db, "users")));
});

test("unauthenticated clients are denied everywhere", async () => {
  await seed();
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "users/ada")));
  await assertFails(setDoc(doc(anon, "users/ada"), profile()));
  await assertFails(setDoc(doc(anon, "users/new"), profile()));
  await assertFails(getDocs(collection(anon, "users")));
});

test("unknown collections and nested paths are denied, even for signed-in users", async () => {
  const db = authed("ada");
  await assertFails(getDoc(doc(db, "profiles/ada")));
  await assertFails(setDoc(doc(db, "profiles/ada"), { name: "Ada" }));
  await assertFails(setDoc(doc(db, "users/ada/conversations/chat-1"), { title: "Nope" }));
  await assertFails(getDoc(doc(db, "chatRateLimits/abc")));
  await assertFails(setDoc(doc(db, "chatRateLimits/abc"), { count: 1 }));
});

test("Storage access is denied to anonymous and authenticated clients", async () => {
  const anonymousStorage = testEnv.unauthenticatedContext().storage();
  const signedInStorage = testEnv.authenticatedContext("ada").storage();
  await assertFails(getBytes(ref(anonymousStorage, "uploads/sample.txt")));
  await assertFails(uploadBytes(ref(signedInStorage, "uploads/sample.txt"), new Uint8Array([1])));
});
