// Everything the app says to Firebase lives here. Firebase is loaded on demand, and the screens never import it.
import { auth, getDb, getFns } from "../auth/firebaseClient";
import { cleanLineup, isTonight, slugify } from "./shows";
import type { Artist, CheckInResult, FanNumber, NewShow, Position, Show } from "./types";

type Doc = { id: string; data: () => Record<string, unknown> };

const toDate = (v: unknown): Date => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate: () => Date }).toDate() : new Date(0));

function toShow(d: Doc): Show {
  const x = d.data();
  return {
    id: d.id,
    venue: String(x.venue ?? ""),
    lat: Number(x.lat),
    lng: Number(x.lng),
    startsAt: toDate(x.startsAt),
    endsAt: toDate(x.endsAt),
    artistIds: (x.artistIds as string[]) ?? [],
    artistNames: (x.artistNames as string[]) ?? [],
  };
}

function toArtist(d: Doc): Artist {
  const x = d.data();
  return { id: d.id, name: String(x.name ?? ""), imageUrl: typeof x.imageUrl === "string" ? x.imageUrl : null, fanCount: Number(x.fanCount ?? 0) };
}

async function fs() {
  const [db, m] = await Promise.all([getDb(), import("firebase/firestore")]);
  return { db, ...m };
}

/* ----- Fans ----- */

/** Shows that are on now or start later today. */
export async function listTonight(now: Date): Promise<Show[]> {
  const { db, collection, query, where, orderBy, limit, getDocs, Timestamp } = await fs();
  const from = Timestamp.fromMillis(now.getTime() - 20 * 60 * 1000);
  const snap = await getDocs(query(collection(db, "shows"), where("endsAt", ">=", from), orderBy("endsAt"), limit(50)));
  return snap.docs.map(toShow).filter((s) => isTonight(s, now)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function listMyCheckIns(uid: string): Promise<Set<string>> {
  const { db, collection, query, where, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, "checkins"), where("uid", "==", uid)));
  return new Set(snap.docs.map((d) => String(d.data().showId)));
}

export async function listMyNumbers(uid: string): Promise<FanNumber[]> {
  const { db, collection, getDocs } = await fs();
  const snap = await getDocs(collection(db, "users", uid, "artistCounts"));
  return snap.docs
    .map((d) => ({ artistId: String(d.data().artistId ?? d.id), artistName: String(d.data().artistName ?? ""), count: Number(d.data().count ?? 0) }))
    .sort((a, b) => b.count - a.count || a.artistName.localeCompare(b.artistName));
}

export async function getArtist(id: string): Promise<Artist | null> {
  const { db, doc, getDoc } = await fs();
  const snap = await getDoc(doc(db, "artists", id));
  return snap.exists() ? toArtist(snap) : null;
}

/** Images for the small avatars on the home screen. Missing artists are simply left out. */
export async function getArtists(ids: string[]): Promise<Map<string, Artist>> {
  const found = await Promise.all(ids.map((id) => getArtist(id).catch(() => null)));
  return new Map(found.filter((a): a is Artist => a !== null).map((a) => [a.id, a]));
}

export async function listPastShows(artistId: string, now: Date): Promise<Show[]> {
  const { db, collection, query, where, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, "shows"), where("artistIds", "array-contains", artistId)));
  return snap.docs.map(toShow).filter((s) => s.endsAt.getTime() < now.getTime()).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

export async function checkIn(showId: string, pos: Position): Promise<CheckInResult> {
  const [fns, { httpsCallable }] = await Promise.all([getFns(), import("firebase/functions")]);
  const res = await httpsCallable<{ showId: string } & Position, CheckInResult>(fns, "checkIn")({ showId, ...pos });
  return res.data;
}

/* ----- Admins ----- */

export async function isAdmin(uid: string): Promise<boolean> {
  const { db, doc, getDoc } = await fs();
  return (await getDoc(doc(db, "admins", uid))).exists();
}

export async function listAllShows(): Promise<Show[]> {
  const { db, collection, query, orderBy, limit, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, "shows"), orderBy("startsAt", "desc"), limit(100)));
  return snap.docs.map(toShow);
}

export async function listArtists(): Promise<Artist[]> {
  const { db, collection, query, orderBy, limit, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, "artists"), orderBy("nameLower"), limit(200)));
  return snap.docs.map(toArtist);
}

/**
 * Adds a show. Artists who are not in the database yet are created first.
 * With `fixedId` the show gets that id: if it already exists it is left alone (or, with `replace`, deleted and added again).
 */
export async function createShow(input: NewShow, fixedId?: { id: string; replace: boolean }): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const { db, doc, collection, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp, Timestamp } = await fs();
  const names = cleanLineup(input.artistNames);
  if (names.length === 0) throw new Error("Add at least one artist.");
  const ids: string[] = [];
  for (const name of names) {
    const id = slugify(name);
    ids.push(id);
    const ref = doc(db, "artists", id);
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, { name, nameLower: name.toLowerCase(), fanCount: 0, createdAt: serverTimestamp() });
    }
  }
  const data = {
    venue: input.venue.trim(),
    lat: input.lat,
    lng: input.lng,
    startsAt: Timestamp.fromDate(input.startsAt),
    endsAt: Timestamp.fromDate(input.endsAt),
    artistIds: ids,
    artistNames: names,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };
  if (!fixedId) return (await addDoc(collection(db, "shows"), data)).id;
  const ref = doc(db, "shows", fixedId.id);
  if ((await getDoc(ref)).exists()) {
    if (!fixedId.replace) return fixedId.id;
    await deleteDoc(ref);
  }
  await setDoc(ref, data);
  return fixedId.id;
}

export async function updateShowEnd(showId: string, endsAt: Date): Promise<void> {
  const { db, doc, updateDoc, Timestamp } = await fs();
  await updateDoc(doc(db, "shows", showId), { endsAt: Timestamp.fromDate(endsAt) });
}

export async function deleteShow(showId: string): Promise<void> {
  const { db, doc, deleteDoc } = await fs();
  await deleteDoc(doc(db, "shows", showId));
}

/** Sends one picture for an artist (a new one replaces the old). The server checks the type and size. */
export async function uploadArtistImage(artistId: string, imageBase64: string): Promise<string> {
  const [fns, { httpsCallable }] = await Promise.all([getFns(), import("firebase/functions")]);
  const res = await httpsCallable<{ artistId: string; imageBase64: string }, { imageUrl: string }>(fns, "setArtistImage")({ artistId, imageBase64 });
  return res.data.imageUrl;
}
