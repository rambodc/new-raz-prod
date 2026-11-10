import { FirebaseError } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { AUDIO_LIMIT, audioKind } from "./audio";
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
  ticketUrl: string;
};

export type EventInput = {
  title: string;
  startsAt: Date;
  venue: string;
  city: string;
  description: string;
  imageURL: string;
  ticketUrl: string;
};

export type Track = {
  id: string;
  title: string;
  duration: number;
  order: number;
  audioURL: string;
  coverURL: string;
};

export type ArtistPageData = {
  artist: Artist | null;
  events: EventItem[];
  tracks: Track[];
};

const HERO = { maxEdge: 2000, maxBytes: 3_600_000, quality: 0.9 };

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
    ticketUrl: asString(data.ticketUrl).trim(),
  };
}

export function readTrack(id: string, data: Record<string, unknown>): Track | null {
  const title = asString(data.title).trim();
  const duration = typeof data.duration === "number" ? data.duration : Number.NaN;
  const order = typeof data.order === "number" ? data.order : Number.NaN;
  const audioURL = asString(data.audioURL);
  if (!title || !Number.isFinite(duration) || !Number.isFinite(order) || !audioURL) return null;
  return { id, title, duration, order, audioURL, coverURL: asString(data.coverURL) };
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

export async function listArtists(): Promise<Artist[]> {
  const { db } = await client();
  const snap = await getDocs(query(collection(db, "artists"), limit(80)));
  return snap.docs
    .flatMap((item) => {
      const artist = readArtist(item.id, item.data());
      return artist ? [artist] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function loadHome(uid: string, role: Role): Promise<{ artist: Artist | null; artists: Artist[] }> {
  const [artist, artists] = await Promise.all([role === "artist" ? getArtist(uid) : Promise.resolve(null), listArtists()]);
  return { artist, artists };
}

export async function listTracks(artistId: string): Promise<Track[]> {
  const { db } = await client();
  const snap = await getDocs(query(collection(db, "artists", artistId, "tracks"), orderBy("order", "asc"), limit(100)));
  return snap.docs
    .flatMap((item) => {
      const track = readTrack(item.id, item.data());
      return track ? [track] : [];
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export async function loadArtistPage(id: string, ensureEventId?: string): Promise<ArtistPageData> {
  const artist = await getArtist(id);
  if (!artist) return { artist: null, events: [], tracks: [] };
  const [events, tracks] = await Promise.all([listArtistEvents(id), listTracks(id)]);
  if (ensureEventId && !events.some((event) => event.id === ensureEventId)) {
    const extra = await getEvent(ensureEventId);
    if (extra && extra.artistId === id) {
      events.push(extra);
      events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    }
  }
  return { artist, events, tracks };
}

export async function loadLinkedArtist(eventId: string): Promise<ArtistPageData> {
  const event = await getEvent(eventId);
  if (!event) return { artist: null, events: [], tracks: [] };
  return loadArtistPage(event.artistId, eventId);
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
    ticketUrl: input.ticketUrl,
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
    ticketUrl: input.ticketUrl,
    updatedAt: serverTimestamp(),
  });
}

function isMissingObject(error: unknown): boolean {
  return error instanceof FirebaseError && error.code.includes("object-not-found");
}

async function removeFile(path: string): Promise<void> {
  const { storage } = await client();
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }
}

function audioPathFromUrl(url: string, artistId: string): string | null {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  const match = new RegExp(`artists/${artistId}/tracks/([^?#]+)`).exec(decoded);
  return match ? `artists/${artistId}/tracks/${match[1]}` : null;
}

export async function publishTrack(
  artistId: string,
  input: { title: string; duration: number; order: number },
  audio: File,
  cover: File | null,
): Promise<string> {
  const kind = audioKind(audio);
  if (!kind) throw new Error("Use an mp3, m4a, aac or wav file.");
  if (audio.size <= 0 || audio.size >= AUDIO_LIMIT) throw new Error("Keep the audio file under 30 MB.");
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 14400) throw new Error("Couldn't use the length of that file.");
  const { db, storage } = await client();
  const id = doc(collection(db, "artists", artistId, "tracks")).id;
  const audioPath = `artists/${artistId}/tracks/${id}.${kind.ext}`;
  const coverPath = `artists/${artistId}/cover-${id}.jpg`;
  const storedAudio = ref(storage, audioPath);
  await uploadBytes(storedAudio, audio, { contentType: kind.contentType, cacheControl: "public,max-age=3600" });
  try {
    const coverURL = cover ? await putImage(coverPath, cover) : "";
    const audioURL = await getDownloadURL(storedAudio);
    await setDoc(doc(db, "artists", artistId, "tracks", id), {
      title: input.title,
      duration: Math.round(input.duration * 1000) / 1000,
      order: Math.max(0, Math.round(input.order)),
      audioURL,
      coverURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    await removeFile(audioPath);
    if (cover) await removeFile(coverPath);
    throw error;
  }
}

export async function renameTrack(artistId: string, trackId: string, title: string): Promise<void> {
  const { db } = await client();
  await updateDoc(doc(db, "artists", artistId, "tracks", trackId), { title, updatedAt: serverTimestamp() });
}

export async function saveTrackOrder(artistId: string, ids: string[]): Promise<void> {
  const { db } = await client();
  const batch = writeBatch(db);
  ids.forEach((id, index) => {
    batch.update(doc(db, "artists", artistId, "tracks", id), { order: index, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function deleteTrack(artistId: string, track: Track): Promise<void> {
  const audioPath = audioPathFromUrl(track.audioURL, artistId);
  if (audioPath) await removeFile(audioPath);
  if (track.coverURL.includes(`cover-${track.id}`)) await removeFile(`artists/${artistId}/cover-${track.id}.jpg`);
  const { db } = await client();
  await deleteDoc(doc(db, "artists", artistId, "tracks", track.id));
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
