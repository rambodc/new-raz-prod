import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { ref, getBytes, uploadBytes, deleteObject } from "firebase/storage";

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
  await assertFails(getDoc(doc(db, "artists/a1/fans/ada")));
});


/* ---------- The fan counter ---------- */

const NOW = Date.now();
const at = (offsetMs) => Timestamp.fromMillis(NOW + offsetMs);
const asAdmin = () => authed("boss", "boss@example.com");

async function seedAdminAndData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "admins/boss"), { email: "boss@example.com" });
    await setDoc(doc(db, "artists/a1"), { name: "Alpha", nameLower: "alpha", fanCount: 3, createdAt: at(0) });
    await setDoc(doc(db, "shows/s1"), showData({ createdBy: "boss", createdAt: at(0) }));
    await setDoc(doc(db, "users/ada/artistCounts/a1"), { artistId: "a1", artistName: "Alpha", count: 2 });
    await setDoc(doc(db, "users/bob/artistCounts/a1"), { artistId: "a1", artistName: "Alpha", count: 5 });
    await setDoc(doc(db, "checkins/s1_ada"), { showId: "s1", uid: "ada", at: at(0) });
    await setDoc(doc(db, "checkins/s1_bob"), { showId: "s1", uid: "bob", at: at(0) });
  });
}

function showData(extra = {}) {
  return { venue: "Foundry 47", lat: 51.04, lng: -114.07, startsAt: at(0), endsAt: at(3 * 3600_000), artistIds: ["a1"], artistNames: ["Alpha"], createdAt: serverTimestamp(), createdBy: "boss", ...extra };
}

test("admins are recorded in admins/{uid}: you can read your own entry and nothing else, and nobody can write it", async () => {
  await seedAdminAndData();
  await assertSucceeds(getDoc(doc(asAdmin(), "admins/boss")));
  await assertSucceeds(getDoc(doc(authed("ada"), "admins/ada"))); // not an admin: the document simply does not exist
  await assertFails(getDoc(doc(authed("ada"), "admins/boss")));
  await assertFails(getDocs(collection(asAdmin(), "admins")));
  await assertFails(setDoc(doc(authed("ada"), "admins/ada"), { email: EMAIL }));
  await assertFails(setDoc(doc(asAdmin(), "admins/boss"), { email: "x@example.com" }));
  await assertFails(deleteDoc(doc(asAdmin(), "admins/boss")));
});

test("signed-in users can read shows and artists, signed-out users cannot", async () => {
  await seedAdminAndData();
  await assertSucceeds(getDoc(doc(authed("ada"), "shows/s1")));
  await assertSucceeds(getDocs(collection(authed("ada"), "shows")));
  await assertSucceeds(getDoc(doc(authed("ada"), "artists/a1")));
  await assertSucceeds(getDocs(collection(authed("ada"), "artists")));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "shows/s1")));
  await assertFails(getDoc(doc(anon, "artists/a1")));
});

test("only admins can add, change or delete shows, and a show must be well formed", async () => {
  await seedAdminAndData();
  const ada = authed("ada");
  await assertFails(setDoc(doc(ada, "shows/new"), showData({ createdBy: "ada" })));
  await assertFails(updateDoc(doc(ada, "shows/s1"), { endsAt: at(4 * 3600_000) }));
  await assertFails(deleteDoc(doc(ada, "shows/s1")));

  const boss = asAdmin();
  await assertSucceeds(setDoc(doc(boss, "shows/new"), showData()));
  await assertFails(setDoc(doc(boss, "shows/bad1"), showData({ lat: 120 })));
  await assertFails(setDoc(doc(boss, "shows/bad2"), showData({ endsAt: at(-1000) })));
  await assertFails(setDoc(doc(boss, "shows/bad3"), showData({ artistIds: [], artistNames: [] })));
  await assertFails(setDoc(doc(boss, "shows/bad4"), showData({ artistNames: ["a", "b"] })));
  await assertFails(setDoc(doc(boss, "shows/bad5"), showData({ venue: "" })));
  await assertFails(setDoc(doc(boss, "shows/bad6"), showData({ extra: 1 })));
  await assertFails(setDoc(doc(boss, "shows/bad7"), showData({ createdBy: "someone-else" })));

  await assertSucceeds(updateDoc(doc(boss, "shows/s1"), { endsAt: at(5 * 3600_000) }));
  await assertFails(updateDoc(doc(boss, "shows/s1"), { endsAt: at(-3600_000) }));
  await assertFails(updateDoc(doc(boss, "shows/s1"), { venue: "Elsewhere" }));
  await assertFails(updateDoc(doc(boss, "shows/s1"), { lat: 10 }));
  await assertSucceeds(deleteDoc(doc(boss, "shows/s1")));
});

test("only admins can add or rename artists, and nobody can set the fan total or image from a client", async () => {
  await seedAdminAndData();
  const newArtist = (extra = {}) => ({ name: "Beta", nameLower: "beta", fanCount: 0, createdAt: serverTimestamp(), ...extra });
  await assertFails(setDoc(doc(authed("ada"), "artists/beta"), newArtist()));
  const boss = asAdmin();
  await assertSucceeds(setDoc(doc(boss, "artists/beta"), newArtist()));
  await assertFails(setDoc(doc(boss, "artists/gamma"), newArtist({ fanCount: 50 })));
  await assertFails(setDoc(doc(boss, "artists/gamma"), newArtist({ imageUrl: "https://example.com/x.jpg" })));
  await assertFails(setDoc(doc(boss, "artists/gamma"), newArtist({ name: "" })));
  await assertSucceeds(updateDoc(doc(boss, "artists/a1"), { name: "Alpha Prime", nameLower: "alpha prime" }));
  await assertFails(updateDoc(doc(boss, "artists/a1"), { fanCount: 999 }));
  await assertFails(updateDoc(doc(boss, "artists/a1"), { imageUrl: "https://example.com/x.jpg" }));
  await assertFails(updateDoc(doc(authed("ada"), "artists/a1"), { name: "Hacked", nameLower: "hacked" }));
  await assertFails(deleteDoc(doc(boss, "artists/a1")));
});

test("a fan can read only their own numbers and check-ins, and cannot write them", async () => {
  await seedAdminAndData();
  const ada = authed("ada");
  await assertSucceeds(getDoc(doc(ada, "users/ada/artistCounts/a1")));
  await assertSucceeds(getDocs(collection(ada, "users/ada/artistCounts")));
  await assertFails(getDoc(doc(ada, "users/bob/artistCounts/a1")));
  await assertFails(getDocs(collection(ada, "users/bob/artistCounts")));
  await assertFails(setDoc(doc(ada, "users/ada/artistCounts/a1"), { artistId: "a1", artistName: "Alpha", count: 99 }));
  await assertFails(setDoc(doc(asAdmin(), "users/ada/artistCounts/a1"), { artistId: "a1", artistName: "Alpha", count: 99 }));

  await assertSucceeds(getDoc(doc(ada, "checkins/s1_ada")));
  await assertSucceeds(getDoc(doc(ada, "checkins/s2_ada"))); // not there yet: reading your own id is still allowed
  await assertSucceeds(getDocs(query(collection(ada, "checkins"), where("uid", "==", "ada"))));
  await assertFails(getDoc(doc(ada, "checkins/s1_bob")));
  await assertFails(getDocs(query(collection(ada, "checkins"), where("uid", "==", "bob"))));
  await assertFails(getDocs(collection(ada, "checkins")));
  await assertFails(setDoc(doc(ada, "checkins/s2_ada"), { showId: "s2", uid: "ada", at: serverTimestamp() }));
  await assertFails(setDoc(doc(asAdmin(), "checkins/s2_boss"), { showId: "s2", uid: "boss", at: serverTimestamp() }));
  await assertFails(deleteDoc(doc(ada, "checkins/s1_ada")));
});

test("artist image files are public to read and can never be written from a client", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "artists/a1/image"), new Uint8Array([0xff, 0xd8, 0xff]), { contentType: "image/jpeg" });
  });
  const anon = testEnv.unauthenticatedContext().storage();
  const signedIn = testEnv.authenticatedContext("ada").storage();
  const boss = testEnv.authenticatedContext("boss").storage();
  await assertSucceeds(getBytes(ref(anon, "artists/a1/image")));
  await assertSucceeds(getBytes(ref(signedIn, "artists/a1/image")));
  for (const storage of [anon, signedIn, boss]) {
    await assertFails(uploadBytes(ref(storage, "artists/a1/image"), new Uint8Array([1]), { contentType: "image/jpeg" }));
    await assertFails(deleteObject(ref(storage, "artists/a1/image")));
  }
});

test("everything else in Storage stays closed", async () => {
  const anon = testEnv.unauthenticatedContext().storage();
  const signedIn = testEnv.authenticatedContext("ada").storage();
  await assertFails(getBytes(ref(anon, "uploads/sample.txt")));
  await assertFails(uploadBytes(ref(signedIn, "uploads/sample.txt"), new Uint8Array([1])));
});
