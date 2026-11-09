import { FirebaseError } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { client, storageObjectUrl } from "./firebase";
import type { Role } from "./profile";
import { resizeImage } from "./resizeImage";

export type Artist = {
  id: string;
  name: string;
  bio: string;
  imageURL: string;
  ownerUid: string;
};

export type EventItem = {
  id: string;
  artistId: string;
  title: string;
  startsAt: Date;
  venue: string;
  city: string;
  description: string;
  imageURL: string;
};

export type EventInput = {
  title: string;
  startsAt: Date;
  venue: string;
  city: string;
  description: string;
  imageURL: string;
};

const HERO = { maxEdge: 1600, maxBytes: 4_200_000 };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

export function readArtist(id: string, data: Record<string, unknown>): Artist | null {
  const name = asString(data.name).trim();
  if (!name) return null;
  return {
    id,
    name,
    bio: asString(data.bio),
    imageURL: asString(data.imageURL),
    ownerUid: asString(data.ownerUid),
  };
}

export function readEvent(id: string, data: Record<string, unknown>): EventItem | null {
  const starts = data.startsAt;
  const startsAt = starts instanceof Timestamp ? starts.toDate() : null;
  const title = asString(data.title).trim();
  if (!startsAt || !title) return null;
  return {
    id,
    artistId: asString(data.artistId),
    title,
    startsAt,
    venue: asString(data.venue),
    city: asString(data.city),
    description: asString(data.description),
    imageURL: asString(data.imageURL),
  };
}

function eventsFrom(docs: Array<{ id: string; data: () => Record<string, unknown> }>): EventItem[] {
  return docs.flatMap((item) => {
    const event = readEvent(item.id, item.data());
    return event ? [event] : [];
  });
}

export async function getArtist(id: string): Promise<Artist | null> {
  const { db } = await client();
  const snap = await getDoc(doc(db, "artists", id));
  if (!snap.exists()) return null;
  return readArtist(snap.id, snap.data());
}

export async function getEvent(id: string): Promise<EventItem | null> {
  const { db } = await client();
  const snap = await getDoc(doc(db, "events", id));
  if (!snap.exists()) return null;
  return readEvent(snap.id, snap.data());
}

export async function listUpcomingEvents(): Promise<EventItem[]> {
  const { db } = await client();
  const snap = await getDocs(query(collection(db, "events"), where("startsAt", ">=", Timestamp.fromDate(new Date())), orderBy("startsAt", "asc"), limit(40)));
  return eventsFrom(snap.docs);
}

export async function listArtistEvents(artistId: string): Promise<EventItem[]> {
  const { db } = await client();
  const snap = await getDocs(
    query(collection(db, "events"), where("artistId", "==", artistId), where("startsAt", ">=", Timestamp.fromDate(new Date())), orderBy("startsAt", "asc"), limit(40)),
  );
  return eventsFrom(snap.docs);
}

export async function loadHome(uid: string, role: Role): Promise<{ artist: Artist | null; events: EventItem[] }> {
  const [artist, events] = await Promise.all([role === "artist" ? getArtist(uid) : Promise.resolve(null), listUpcomingEvents()]);
  return { artist, events };
}

export async function loadArtistPage(id: string): Promise<{ artist: Artist | null; events: EventItem[] }> {
  const artist = await getArtist(id);
  if (!artist) return { artist: null, events: [] };
  return { artist, events: await listArtistEvents(id) };
}

export async function loadEventPage(id: string): Promise<{ event: EventItem | null; artist: Artist | null }> {
  const event = await getEvent(id);
  if (!event) return { event: null, artist: null };
  return { event, artist: await getArtist(event.artistId) };
}

async function putImage(path: string, file: File): Promise<string> {
  const blob = await resizeImage(file, HERO);
  const { storage } = await client();
  const stored = ref(storage, path);
  await uploadBytes(stored, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=3600" });
  return cacheBust(await getDownloadURL(stored));
}

export async function saveArtist(uid: string, input: { name: string; bio: string; imageURL: string }, file: File | null): Promise<void> {
  const imageURL = file ? await putImage(`artists/${uid}/cover.jpg`, file) : input.imageURL;
  const { db } = await client();
  await updateDoc(doc(db, "artists", uid), {
    name: input.name,
    bio: input.bio,
    imageURL,
    updatedAt: serverTimestamp(),
  });
}

export async function publishEvent(uid: string, input: EventInput, file: File): Promise<string> {
  const blob = await resizeImage(file, HERO);
  const { db, storage } = await client();
  const id = doc(collection(db, "events")).id;
  const path = `events/${id}/cover.jpg`;
  const refDoc = doc(db, "events", id);
  await setDoc(refDoc, {
    artistId: uid,
    title: input.title,
    startsAt: Timestamp.fromDate(input.startsAt),
    venue: input.venue,
    city: input.city,
    description: input.description,
    imageURL: storageObjectUrl(path),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    const stored = ref(storage, path);
    await uploadBytes(stored, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=3600" });
    await updateDoc(refDoc, { imageURL: cacheBust(await getDownloadURL(stored)), updatedAt: serverTimestamp() });
  } catch (error) {
    await deleteDoc(refDoc).catch(() => undefined);
    throw error;
  }
  return id;
}

export async function saveEvent(id: string, input: EventInput, file: File | null): Promise<void> {
  let imageURL = input.imageURL;
  if (file) imageURL = await putImage(`events/${id}/cover.jpg`, file);
  const { db } = await client();
  await updateDoc(doc(db, "events", id), {
    title: input.title,
    startsAt: Timestamp.fromDate(input.startsAt),
    venue: input.venue,
    city: input.city,
    description: input.description,
    imageURL,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const { db, storage } = await client();
  try {
    await deleteObject(ref(storage, `events/${id}/cover.jpg`));
  } catch (error) {
    const missing = error instanceof FirebaseError && error.code.includes("object-not-found");
    if (!missing) throw error;
  }
  await deleteDoc(doc(db, "events", id));
}
