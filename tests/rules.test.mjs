import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { ref, getBytes, uploadBytes, deleteObject } from "firebase/storage";

const projectId = process.env.GCLOUD_PROJECT || "demo-razzberry-rules";
const EMAIL = "ada@example.com";
let testEnv;

const authed = (uid, email = EMAIL) => testEnv.authenticatedContext(uid, { email }).firestore();
const OWN_PHOTO = "https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/users%2Fada%2Favatar?alt=media&token=abc";
const profile = (extra = {}) => ({
  firstName: "Ada",
  lastName: "Lovelace",
  email: EMAIL,
  photoURL: "",
  role: "fan",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => testEnv.clearFirestore());
after(async () => testEnv?.cleanup());

async function seed(uid = "ada", data) {
  const docData = data ?? {
    firstName: "Ada",
    lastName: "Lovelace",
    email: EMAIL,
    photoURL: "",
    role: "fan",
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    updatedAt: Timestamp.fromMillis(1_700_000_000_000),
  };
  await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), `users/${uid}`), docData));
}

test("a signed-in user can create their own profile", async () => {
  await assertSucceeds(setDoc(doc(authed("ada"), "users/ada"), profile()));
});

test("a signed-in user can read and update their own name, but not role, email or createdAt", async () => {
  await seed();
  const db = authed("ada");
  await assertSucceeds(getDoc(doc(db, "users/ada")));
  await assertSucceeds(updateDoc(doc(db, "users/ada"), { firstName: "Augusta", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, "users/ada"), { photoURL: OWN_PHOTO, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/ada"), { createdAt: Timestamp.fromMillis(1), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/ada"), { role: "artist", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/ada"), { email: "someone-else@example.com", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/ada"), { firstName: "Ada" }));
});

test("profiles reject unknown fields, wrong types, bad sizes, a spoofed email, a bad photo and a self-assigned role", async () => {
  const db = authed("ada");
  await assertFails(setDoc(doc(db, "users/ada"), profile({ admin: true })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ firstName: 42 })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ firstName: "" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ firstName: "   " })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ lastName: "x".repeat(61) })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ email: "someone-else@example.com" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ role: "artist" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ photoURL: "javascript:alert(1)" })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ photoURL: OWN_PHOTO.replace("ada", "bob") })));
  await assertFails(setDoc(doc(db, "users/ada"), profile({ createdAt: Timestamp.fromMillis(1_000) })));
  await assertFails(setDoc(doc(db, "users/ada"), { firstName: "Ada", lastName: "Lovelace", email: EMAIL }));
});

test("a user cannot read, create, update or delete another user's profile", async () => {
  await seed("ada");
  const mallory = authed("mallory", "mallory@example.com");
  await assertFails(getDoc(doc(mallory, "users/ada")));
  await assertFails(setDoc(doc(mallory, "users/ada"), profile({ email: "mallory@example.com" })));
  await assertFails(updateDoc(doc(mallory, "users/ada"), { firstName: "Hacked", updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(mallory, "users/ada")));
  await assertFails(setDoc(doc(authed("ada"), "users/mallory"), profile()));
});

test("nobody can delete their own profile or list the users collection", async () => {
  await seed();
  const db = authed("ada");
  await assertFails(deleteDoc(doc(db, "users/ada")));
  await assertFails(getDocs(collection(db, "users")));
});

test("an artist can update their own name and still cannot change role", async () => {
  await seed("nova", {
    firstName: "Nova",
    lastName: "Vale",
    email: "nova@example.com",
    photoURL: "",
    role: "artist",
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    updatedAt: Timestamp.fromMillis(1_700_000_000_000),
  });
  const db = authed("nova", "nova@example.com");
  await assertSucceeds(updateDoc(doc(db, "users/nova"), { firstName: "Nia", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/nova"), { role: "fan", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "users/nova"), { role: "admin", updatedAt: serverTimestamp() }));
});

test("unauthenticated clients are denied everywhere", async () => {
  await seed();
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "users/ada")));
  await assertFails(setDoc(doc(anon, "users/ada"), profile()));
  await assertFails(setDoc(doc(anon, "users/new"), profile()));
  await assertFails(getDocs(collection(anon, "users")));
});

test("login codes, rate limits and other unknown paths are server-only", async () => {
  const db = authed("ada");
  await assertFails(getDoc(doc(db, "profiles/ada")));
  await assertFails(setDoc(doc(db, "profiles/ada"), { name: "Ada" }));
  await assertFails(setDoc(doc(db, "users/ada/conversations/chat-1"), { title: "Nope" }));
  await assertFails(getDoc(doc(db, "chatRateLimits/abc")));
  await assertFails(setDoc(doc(db, "chatRateLimits/abc"), { count: 1 }));
  await assertFails(getDoc(doc(db, "artists/a1/fans/ada")));
  await assertFails(getDoc(doc(db, "loginCodes/abc")));
  await assertFails(setDoc(doc(db, "loginCodes/abc"), { codeHash: "nope" }));
  await assertFails(getDoc(doc(db, "emailChanges/ada")));
  await assertFails(setDoc(doc(db, "emailChanges/ada"), { codeHash: "nope" }));
  await assertFails(getDoc(doc(db, "authRateLimits/email_abc")));
  await assertFails(setDoc(doc(db, "authRateLimits/email_abc"), { count: 1 }));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "loginCodes/abc")));
  await assertFails(getDoc(doc(anon, "emailChanges/ada")));
  await assertFails(getDoc(doc(anon, "authRateLimits/ip_abc")));
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

test("signed-in users can read shows, signed-out users cannot", async () => {
  await seedAdminAndData();
  await assertSucceeds(getDoc(doc(authed("ada"), "shows/s1")));
  await assertSucceeds(getDocs(collection(authed("ada"), "shows")));
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, "shows/s1")));
  await assertFails(getDocs(collection(anon, "shows")));
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

const artistImage = (id) => `https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/artists%2F${id}%2Fcover.jpg?alt=media`;
const eventImage = (id) => `https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/events%2F${id}%2Fcover.jpg?alt=media`;

function artistDoc(extra = {}) {
  return { name: "DJ Nova", bio: "", imageURL: "", ownerUid: "nova", createdAt: at(0), updatedAt: at(0), ...extra };
}

function eventDoc(id, extra = {}) {
  return {
    artistId: "nova",
    title: "Nova Live at Commonwealth",
    startsAt: at(3_600_000),
    venue: "Commonwealth Bar",
    city: "Calgary",
    description: "An intimate late-night set.",
    imageURL: eventImage(id),
    ticketUrl: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

async function seedArtist(uid = "nova", role = "artist") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${uid}`), {
      firstName: "Nova",
      lastName: "Vale",
      email: `${uid}@example.com`,
      photoURL: "",
      role,
      createdAt: at(0),
      updatedAt: at(0),
    });
    if (role === "artist") await setDoc(doc(db, `artists/${uid}`), artistDoc({ ownerUid: uid }));
  });
}

test("artist pages and events are public to read, and only the owning artist can write them", async () => {
  await seedArtist("nova");
  await seedArtist("ada", "fan");
  await seed();
  const nova = authed("nova", "nova@example.com");
  const ada = authed("ada");
  const anon = testEnv.unauthenticatedContext().firestore();

  await assertFails(setDoc(doc(nova, "artists/nova"), artistDoc()));
  await assertFails(setDoc(doc(ada, "artists/ada"), artistDoc({ ownerUid: "ada" })));
  await assertFails(deleteDoc(doc(nova, "artists/nova")));
  await assertSucceeds(getDoc(doc(anon, "artists/nova")));
  await assertSucceeds(getDocs(collection(anon, "artists")));
  await assertSucceeds(updateDoc(doc(nova, "artists/nova"), { name: "DJ Nova", bio: "Heavy bass.", imageURL: artistImage("nova"), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "artists/nova"), { ownerUid: "ada", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "artists/nova"), { name: "DJ Nova", bio: "x", imageURL: "javascript:alert(1)", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "artists/nova"), { name: "DJ Nova", bio: "x", imageURL: artistImage("ada"), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "artists/nova"), { name: "", bio: "", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "artists/nova"), { fanCount: 1, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ada, "artists/nova"), { name: "Hacked", updatedAt: serverTimestamp() }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "artists/ada"), artistDoc({ ownerUid: "ada" }));
  });
  await assertFails(updateDoc(doc(ada, "artists/ada"), { bio: "I am not an artist", updatedAt: serverTimestamp() }));

  await assertSucceeds(setDoc(doc(nova, "events/night1"), eventDoc("night1")));
  await assertSucceeds(getDoc(doc(anon, "events/night1")));
  await assertSucceeds(getDocs(query(collection(anon, "events"), where("startsAt", ">=", at(0)), orderBy("startsAt", "asc"))));
  await assertSucceeds(updateDoc(doc(nova, "events/night1"), { title: "Late Night Set", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "events/night1"), { artistId: "ada", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(nova, "events/night1"), { title: "Nope", imageURL: `https://firebasestorage.googleapis.com/v0/b/b/o/events%2Fother%2Fcover.jpg?x=events%2Fnight1%2F`, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(nova, "events/night2"), eventDoc("night2", { artistId: "ada" })));
  await assertFails(setDoc(doc(nova, "events/night2"), eventDoc("night2", { title: "" })));
  await assertFails(setDoc(doc(nova, "events/night2"), eventDoc("night2", { description: "x".repeat(2001) })));
  await assertFails(setDoc(doc(ada, "events/fan1"), eventDoc("fan1", { artistId: "ada" })));
  await assertFails(setDoc(doc(anon, "events/anon1"), eventDoc("anon1")));
  await assertFails(updateDoc(doc(ada, "events/night1"), { title: "Hacked", updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(ada, "events/night1")));
  await assertSucceeds(deleteDoc(doc(nova, "events/night1")));
});

test("ticket links are optional http(s) urls and only the owning artist can set one", async () => {
  await seedArtist("nova");
  await seedArtist("ada", "fan");
  const nova = authed("nova", "nova@example.com");
  const ada = authed("ada");
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(nova, "events/tix1"), eventDoc("tix1", { ticketUrl: "" })));
  await assertSucceeds(updateDoc(doc(nova, "events/tix1"), { ticketUrl: "https://tickets.example.com/nova", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(nova, "events/tix1"), { ticketUrl: "http://box.example.com/tix", updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(anon, "events/tix1")));
  const missing = eventDoc("tix2");
  delete missing.ticketUrl;
  await assertFails(setDoc(doc(nova, "events/tix2"), missing));
  await assertFails(setDoc(doc(nova, "events/tix2"), eventDoc("tix2", { ticketUrl: "javascript:alert(1)" })));
  await assertFails(setDoc(doc(nova, "events/tix2"), eventDoc("tix2", { ticketUrl: "ftp://files.example.com/a" })));
  await assertFails(setDoc(doc(nova, "events/tix2"), eventDoc("tix2", { ticketUrl: `https://${"a".repeat(2048)}` })));
  await assertFails(updateDoc(doc(ada, "events/tix1"), { ticketUrl: "https://evil.example/x", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(ada, "events/tix3"), eventDoc("tix3", { artistId: "ada", ticketUrl: "https://tickets.example.com/ada" })));
});

const trackAudio = (id, file = "t1.mp3") =>
  `https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/artists%2F${id}%2Ftracks%2F${file}?alt=media`;

function trackDoc(extra = {}) {
  return {
    title: "Midnight",
    duration: 182.4,
    order: 0,
    audioURL: trackAudio("nova"),
    coverURL: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  };
}

test("tracks are public to read and only the owning artist can write them", async () => {
  await seedArtist("nova");
  await seedArtist("ada", "fan");
  await seedArtist("bob");
  const nova = authed("nova", "nova@example.com");
  const ada = authed("ada");
  const bob = authed("bob", "bob@example.com");
  const anon = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(setDoc(doc(nova, "artists/nova/tracks/t1"), trackDoc()));
  await assertSucceeds(setDoc(doc(nova, "artists/nova/tracks/tInt"), trackDoc({ duration: 180, order: 1 })));
  await assertSucceeds(getDoc(doc(anon, "artists/nova/tracks/t1")));
  await assertSucceeds(getDocs(query(collection(anon, "artists/nova/tracks"), orderBy("order", "asc"))));
  await assertSucceeds(updateDoc(doc(nova, "artists/nova/tracks/t1"), { title: "Dawn", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(nova, "artists/nova/tracks/t1"), { order: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(nova, "artists/nova/tracks/t1"), { coverURL: artistImage("nova"), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(ada, "artists/nova/tracks/t2"), trackDoc()));
  await assertFails(setDoc(doc(ada, "artists/ada/tracks/t2"), trackDoc()));
  await assertFails(setDoc(doc(bob, "artists/nova/tracks/t2"), trackDoc()));
  await assertFails(updateDoc(doc(ada, "artists/nova/tracks/t1"), { title: "Hacked", updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(ada, "artists/nova/tracks/t1")));
  await assertFails(deleteDoc(doc(bob, "artists/nova/tracks/t1")));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ audioURL: "https://evil.example/a.mp3" })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ audioURL: artistImage("nova") })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ coverURL: artistImage("ada") })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ coverURL: "javascript:alert(1)" })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ title: "" })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ duration: -1 })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ duration: 20000 })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ order: 1.5 })));
  await assertFails(setDoc(doc(nova, "artists/nova/tracks/t2"), trackDoc({ order: -1 })));
  await assertFails(setDoc(doc(anon, "artists/nova/tracks/t2"), trackDoc()));
  await assertSucceeds(deleteDoc(doc(nova, "artists/nova/tracks/t1")));
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

test("artist and event images are public to read, and only the owning artist can write an image under 5 MB", async () => {
  await seedArtist("nova");
  await seedArtist("bob");
  await seed();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "events/e1"), { artistId: "nova" });
    await setDoc(doc(db, "events/e2"), { artistId: "bob" });
  });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const nova = testEnv.authenticatedContext("nova", { email: "nova@example.com" }).storage();
  const bob = testEnv.authenticatedContext("bob", { email: "bob@example.com" }).storage();
  const ada = testEnv.authenticatedContext("ada", { email: EMAIL }).storage();
  const anon = testEnv.unauthenticatedContext().storage();

  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/cover.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" }));
  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/cover.webp"), new Uint8Array([0x52, 0x49, 0x46, 0x46]), { contentType: "image/webp" }));
  await assertSucceeds(getBytes(ref(anon, "artists/nova/cover.jpg")));
  await assertFails(uploadBytes(ref(nova, "artists/bob/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "artists/ada/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(anon, "artists/nova/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/cover.gif"), jpeg, { contentType: "image/gif" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/cover.jpg"), jpeg, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/big.jpg"), new Uint8Array(5 * 1024 * 1024), { contentType: "image/jpeg" }));
  await assertFails(deleteObject(ref(bob, "artists/nova/cover.jpg")));
  await assertSucceeds(deleteObject(ref(nova, "artists/nova/cover.jpg")));

  await assertFails(uploadBytes(ref(nova, "events/missing1/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertSucceeds(uploadBytes(ref(nova, "events/e1/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertSucceeds(getBytes(ref(anon, "events/e1/cover.jpg")));
  await assertFails(uploadBytes(ref(nova, "events/e2/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "events/e1/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(anon, "events/e1/cover.jpg"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(deleteObject(ref(bob, "events/e1/cover.jpg")));
  await assertSucceeds(deleteObject(ref(nova, "events/e1/cover.jpg")));
});

test("track audio is public to read, audio only, under 30 MB, and only the owning artist can write it", async () => {
  await seedArtist("nova");
  await seedArtist("bob");
  await seed();
  const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
  const nova = testEnv.authenticatedContext("nova", { email: "nova@example.com" }).storage();
  const bob = testEnv.authenticatedContext("bob", { email: "bob@example.com" }).storage();
  const ada = testEnv.authenticatedContext("ada", { email: EMAIL }).storage();
  const anon = testEnv.unauthenticatedContext().storage();

  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/tracks/t1.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/tracks/a.m4a"), mp3, { contentType: "audio/mp4" }));
  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/tracks/a.aac"), mp3, { contentType: "audio/aac" }));
  await assertSucceeds(uploadBytes(ref(nova, "artists/nova/tracks/a.wav"), mp3, { contentType: "audio/wav" }));
  await assertSucceeds(getBytes(ref(anon, "artists/nova/tracks/t1.mp3")));
  await assertFails(uploadBytes(ref(ada, "artists/nova/tracks/nope.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertFails(uploadBytes(ref(ada, "artists/ada/tracks/nope.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertFails(uploadBytes(ref(nova, "artists/bob/tracks/nope.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertFails(uploadBytes(ref(anon, "artists/nova/tracks/nope.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/tracks/t1.mp3"), mp3, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/tracks/t1.jpg"), mp3, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/song.mp3"), mp3, { contentType: "audio/mpeg" }));
  await assertFails(uploadBytes(ref(nova, "artists/nova/tracks/big.mp3"), new Uint8Array(30 * 1024 * 1024), { contentType: "audio/mpeg" }));
  await assertFails(deleteObject(ref(bob, "artists/nova/tracks/t1.mp3")));
  await assertFails(deleteObject(ref(ada, "artists/nova/tracks/t1.mp3")));
  await assertSucceeds(deleteObject(ref(nova, "artists/nova/tracks/t1.mp3")));
});

test("everything else in Storage stays closed", async () => {
  const anon = testEnv.unauthenticatedContext().storage();
  const signedIn = testEnv.authenticatedContext("ada").storage();
  await assertFails(getBytes(ref(anon, "uploads/sample.txt")));
  await assertFails(uploadBytes(ref(signedIn, "uploads/sample.txt"), new Uint8Array([1])));
});

test("a user can read and replace only their own avatar, as a small jpeg png or webp", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const ada = testEnv.authenticatedContext("ada", { email: EMAIL }).storage();
  const mallory = testEnv.authenticatedContext("mallory", { email: "mallory@example.com" }).storage();
  const anon = testEnv.unauthenticatedContext().storage();
  await assertSucceeds(uploadBytes(ref(ada, "users/ada/avatar"), jpeg, { contentType: "image/jpeg" }));
  await assertSucceeds(getBytes(ref(ada, "users/ada/avatar")));
  await assertSucceeds(uploadBytes(ref(ada, "users/ada/avatar"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" }));
  await assertSucceeds(uploadBytes(ref(ada, "users/ada/avatar"), new Uint8Array([0x52, 0x49, 0x46, 0x46]), { contentType: "image/webp" }));
  await assertFails(getBytes(ref(mallory, "users/ada/avatar")));
  await assertFails(getBytes(ref(anon, "users/ada/avatar")));
  await assertFails(uploadBytes(ref(mallory, "users/ada/avatar"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "users/mallory/avatar"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(anon, "users/ada/avatar"), jpeg, { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "users/ada/avatar"), jpeg, { contentType: "image/gif" }));
  await assertFails(uploadBytes(ref(ada, "users/ada/avatar"), jpeg, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(ada, "users/ada/avatar"), new Uint8Array(0), { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "users/ada/avatar"), new Uint8Array(2 * 1024 * 1024), { contentType: "image/jpeg" }));
  await assertFails(uploadBytes(ref(ada, "users/ada/other"), jpeg, { contentType: "image/jpeg" }));
  await assertSucceeds(deleteObject(ref(ada, "users/ada/avatar")));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), "users/ada/avatar"), jpeg, { contentType: "image/jpeg" });
  });
  await assertFails(deleteObject(ref(mallory, "users/ada/avatar")));
});
