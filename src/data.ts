import { FirebaseError } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { AUDIO_LIMIT, audioKind } from "./audio";
import { client, storageObjectUrl } from "./firebase";
import type { Role } from "./profile";
import type { Route } from "./routes";
import { resizeImage, type ImageCrop } from "./resizeImage";
import { artistPath, eventPath, slugCandidates } from "./slug";

export type Visibility = "public" | "private";

export type Artist = {
  id: string;
  name: string;
  bio: string;
  imageURL: string;
  ownerUid: string;
  slug: string;
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
  visibility: Visibility;
  slug: string;
};

export type EventInput = {
  title: string;
  startsAt: Date;
  venue: string;
  city: string;
  description: string;
  imageURL: string;
  ticketUrl: string;
  visibility: Visibility;
};

export type Track = {
  id: string;
  title: string;
  duration: number;
  order: number;
  audioURL: string;
  coverURL: string;
  slug: string;
};

export type ArtistPageData = {
  artist: Artist | null;
  events: EventItem[];
  tracks: Track[];
};

export const ARTIST_EVENT_LIMIT = 80;

export type PageFocus = {
  sameArtist: boolean;
  openEventId: string | null;
  highlightTrackId: string | null;
  pendingEvent: boolean;
  pendingTrack: boolean;
};

const noFocus: PageFocus = { sameArtist: false, openEventId: null, highlightTrackId: null, pendingEvent: false, pendingTrack: false };

/** Which event and track this route points at, using only the page already in memory. */
export function focusFromPage(route: Route, page: ArtistPageData): PageFocus {
  const artist = page.artist;
  if (!artist) return noFocus;
  if (route.name === "share") {
    if (artist.slug !== route.artistSlug) return noFocus;
    const event = route.eventSlug ? (page.events.find((item) => item.slug === route.eventSlug) ?? null) : null;
    const track = route.trackSlug ? (page.tracks.find((item) => item.slug === route.trackSlug) ?? null) : null;
    return {
      sameArtist: true,
      openEventId: event?.id ?? null,
      highlightTrackId: track?.id ?? null,
      pendingEvent: Boolean(route.eventSlug) && event == null,
      pendingTrack: Boolean(route.trackSlug) && track == null,
    };
  }
  if (route.name === "artist" || route.name === "artist-edit") {
    if (artist.id !== route.id) return noFocus;
    return { sameArtist: true, openEventId: null, highlightTrackId: null, pendingEvent: false, pendingTrack: false };
  }
  if ((route.name === "event" || route.name === "event-edit") && route.id) {
    const event = page.events.find((item) => item.id === route.id) ?? null;
    if (!event) return { ...noFocus, pendingEvent: true };
    return { sameArtist: true, openEventId: event.id, highlightTrackId: null, pendingEvent: false, pendingTrack: false };
  }
  return noFocus;
}

export function focusReady(focus: PageFocus): boolean {
  return focus.sameArtist && !focus.pendingEvent && !focus.pendingTrack;
}

export function canonicalFor(route: Route, page: ArtistPageData): string | null {
  const artist = page.artist;
  if (!artist?.slug) return null;
  if (route.name === "artist") return artistPath(artist.slug);
  if (route.name === "event" && route.id) {
    const event = page.events.find((item) => item.id === route.id);
    if (event?.visibility === "public" && event.slug) return eventPath(artist.slug, event.slug);
  }
  return null;
}

const HERO = { maxEdge: 2000, maxBytes: 3_600_000, quality: 0.9 };
const ARTIST_PHOTO = { maxEdge: 2400, maxBytes: 3_600_000, quality: 0.92 };

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
    slug: asString(data.slug),
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
    visibility: data.visibility === "private" ? "private" : "public",
    slug: asString(data.slug),
  };
}

export function readTrack(id: string, data: Record<string, unknown>): Track | null {
  const title = asString(data.title).trim();
  const duration = typeof data.duration === "number" ? data.duration : Number.NaN;
  const order = typeof data.order === "number" ? data.order : Number.NaN;
  const audioURL = asString(data.audioURL);
  if (!title || !Number.isFinite(duration) || !Number.isFinite(order) || !audioURL) return null;
  return { id, title, duration, order, audioURL, coverURL: asString(data.coverURL), slug: asString(data.slug) };
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
  try {
    const snap = await getDoc(doc(db, "events", id));
    if (!snap.exists()) return null;
    return readEvent(snap.id, snap.data());
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") return null;
    throw error;
  }
}

export async function listUpcomingEvents(): Promise<EventItem[]> {
  const { db } = await client();
  const snap = await getDocs(query(collection(db, "events"), where("visibility", "==", "public"), where("startsAt", ">=", Timestamp.fromDate(new Date())), orderBy("startsAt", "asc"), limit(40)));
  return eventsFrom(snap.docs);
}

export async function listArtistEvents(artistId: string, publicOnly: boolean): Promise<EventItem[]> {
  const { db } = await client();
  const snap = await getDocs(
    publicOnly
      ? query(collection(db, "events"), where("artistId", "==", artistId), where("visibility", "==", "public"), orderBy("startsAt", "asc"), limit(ARTIST_EVENT_LIMIT))
      : query(collection(db, "events"), where("artistId", "==", artistId), orderBy("startsAt", "asc"), limit(ARTIST_EVENT_LIMIT)),
  );
  return eventsFrom(snap.docs).filter((event) => (publicOnly ? event.visibility === "public" : true));
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

export async function loadArtistPage(id: string, options?: { ensureEventId?: string; publicOnly?: boolean }): Promise<ArtistPageData> {
  const artist = await getArtist(id);
  if (!artist) return { artist: null, events: [], tracks: [] };
  const publicOnly = options?.publicOnly ?? false;
  const [events, tracks] = await Promise.all([listArtistEvents(id, publicOnly), listTracks(id)]);
  const ensureEventId = options?.ensureEventId;
  if (ensureEventId && !events.some((event) => event.id === ensureEventId)) {
    const extra = await getEvent(ensureEventId);
    if (extra && extra.artistId === id && (!publicOnly || extra.visibility === "public")) {
      events.push(extra);
      events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    }
  }
  return { artist, events, tracks };
}

export type ResolvedPage = {
  page: ArtistPageData;
  openEventId: string | null;
  highlightTrackId: string | null;
  canonicalPath: string | null;
};

const emptyResolved: ResolvedPage = { page: { artist: null, events: [], tracks: [] }, openEventId: null, highlightTrackId: null, canonicalPath: null };

async function shareTarget(path: string, field: "eventId" | "trackId"): Promise<string | null> {
  const { db } = await client();
  try {
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) return null;
    const value = snap.data()[field];
    return typeof value === "string" && value ? value : null;
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") return null;
    throw error;
  }
}

export async function resolveRoutePage(route: Route, uid: string): Promise<ResolvedPage> {
  if (route.name === "share") {
    const { db } = await client();
    const slugSnap = await getDoc(doc(db, "slugs", route.artistSlug));
    if (!slugSnap.exists()) return emptyResolved;
    const artistId = asString(slugSnap.data().artistId);
    if (!artistId) return emptyResolved;
    const publicOnly = uid !== artistId;
    const page = await loadArtistPage(artistId, { publicOnly });
    const focus = focusFromPage(route, page);
    let openEventId = focus.openEventId;
    let highlightTrackId = focus.highlightTrackId;
    // Opening uses the events already loaded with the artist. The share lookup is only
    // for a public event that fell off a full page. A short list means the slug is not public,
    // so we do not read eventShares (a private lookup is denied and would log in the console).
    if (focus.pendingEvent && route.eventSlug && page.events.length >= ARTIST_EVENT_LIMIT) {
      const looked = await shareTarget(`artists/${artistId}/eventShares/${route.eventSlug}`, "eventId");
      const extra = looked ? (page.events.find((item) => item.id === looked) ?? (await getEvent(looked))) : null;
      if (extra && extra.artistId === artistId && (!publicOnly || extra.visibility === "public")) {
        if (!page.events.some((item) => item.id === extra.id)) {
          page.events.push(extra);
          page.events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        }
        openEventId = extra.id;
      }
    }
    if (focus.pendingTrack && route.trackSlug) {
      const looked = await shareTarget(`artists/${artistId}/trackShares/${route.trackSlug}`, "trackId");
      if (looked && page.tracks.some((track) => track.id === looked)) highlightTrackId = looked;
    }
    return { page, openEventId, highlightTrackId, canonicalPath: null };
  }
  if (route.name === "artist" || route.name === "artist-edit") {
    const page = await loadArtistPage(route.id, { publicOnly: uid !== route.id });
    return { page, openEventId: null, highlightTrackId: null, canonicalPath: canonicalFor(route, page) };
  }
  if (route.name === "event" || (route.name === "event-edit" && route.id)) {
    const eventId = route.id;
    if (!eventId) return emptyResolved;
    const event = await getEvent(eventId);
    if (!event) return emptyResolved;
    const page = await loadArtistPage(event.artistId, { ensureEventId: eventId, publicOnly: uid !== event.artistId });
    const visible = page.events.some((item) => item.id === eventId) ? eventId : null;
    return { page, openEventId: visible, highlightTrackId: null, canonicalPath: canonicalFor(route, page) };
  }
  if (route.name === "event-edit" && route.id === null && uid) {
    const page = await loadArtistPage(uid, { publicOnly: false });
    return { page, openEventId: null, highlightTrackId: null, canonicalPath: null };
  }
  return emptyResolved;
}

export async function loadLinkedArtist(eventId: string): Promise<ArtistPageData> {
  const event = await getEvent(eventId);
  if (!event) return { artist: null, events: [], tracks: [] };
  return loadArtistPage(event.artistId, { ensureEventId: eventId, publicOnly: false });
}

async function pickSlug(artistId: string, kind: "event" | "track", name: string): Promise<string> {
  const { db } = await client();
  const collectionName = kind === "event" ? "eventShares" : "trackShares";
  const blocked = kind === "event" ? ["t", "edit"] : [];
  for (const slug of slugCandidates(name, blocked)) {
    const snap = await getDoc(doc(db, "artists", artistId, collectionName, slug));
    if (!snap.exists()) return slug;
  }
  throw new Error("Could not create a link for that name.");
}

export async function loadEventPage(id: string): Promise<{ event: EventItem | null; artist: Artist | null }> {
  const event = await getEvent(id);
  if (!event) return { event: null, artist: null };
  return { event, artist: await getArtist(event.artistId) };
}

async function putImage(path: string, file: File, options: { maxEdge: number; maxBytes: number; quality: number; crop?: ImageCrop } = HERO): Promise<string> {
  const blob = await resizeImage(file, options);
  const { storage } = await client();
  const stored = ref(storage, path);
  await uploadBytes(stored, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=3600" });
  return cacheBust(await getDownloadURL(stored));
}

export async function saveArtist(uid: string, input: { name: string; bio: string; imageURL: string }, file: File | null, crop?: ImageCrop | null): Promise<void> {
  const imageURL = file ? await putImage(`artists/${uid}/cover.jpg`, file, crop ? { ...ARTIST_PHOTO, crop } : HERO) : input.imageURL;
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
  const slug = await pickSlug(uid, "event", input.title);
  const path = `events/${id}/cover.jpg`;
  const refDoc = doc(db, "events", id);
  const share = doc(db, "artists", uid, "eventShares", slug);
  const batch = writeBatch(db);
  batch.set(refDoc, {
    artistId: uid,
    title: input.title,
    startsAt: Timestamp.fromDate(input.startsAt),
    venue: input.venue,
    city: input.city,
    description: input.description,
    imageURL: storageObjectUrl(path),
    ticketUrl: input.ticketUrl,
    visibility: input.visibility,
    slug,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(share, { eventId: id });
  await batch.commit();
  try {
    const stored = ref(storage, path);
    await uploadBytes(stored, blob, { contentType: "image/jpeg", cacheControl: "public,max-age=3600" });
    await updateDoc(refDoc, { imageURL: cacheBust(await getDownloadURL(stored)), updatedAt: serverTimestamp() });
  } catch (error) {
    await deleteDoc(share).catch(() => undefined);
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
    visibility: input.visibility,
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
    const slug = await pickSlug(artistId, "track", input.title);
    const batch = writeBatch(db);
    batch.set(doc(db, "artists", artistId, "tracks", id), {
      title: input.title,
      duration: Math.round(input.duration * 1000) / 1000,
      order: Math.max(0, Math.round(input.order)),
      audioURL,
      coverURL,
      slug,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "artists", artistId, "trackShares", slug), { trackId: id });
    await batch.commit();
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
  if (track.slug) await deleteDoc(doc(db, "artists", artistId, "trackShares", track.slug)).catch(() => undefined);
  await deleteDoc(doc(db, "artists", artistId, "tracks", track.id));
}

export async function deleteEvent(event: { id: string; artistId: string; slug: string }): Promise<void> {
  const { db, storage } = await client();
  try {
    await deleteObject(ref(storage, `events/${event.id}/cover.jpg`));
  } catch (error) {
    const missing = error instanceof FirebaseError && error.code.includes("object-not-found");
    if (!missing) throw error;
  }
  if (event.slug) await deleteDoc(doc(db, "artists", event.artistId, "eventShares", event.slug)).catch(() => undefined);
  await deleteDoc(doc(db, "events", event.id));
}
