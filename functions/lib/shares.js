import { FieldValue } from "firebase-admin/firestore";
import { eventSubtitle, isPublicEvent, previewRevision } from "./og.js";
import { eventSharePath, isSlug, slugCandidates, trackSharePath } from "./slug.js";

const EVENT_BLOCK = ["t", "edit"];

function dataOf(snap) {
  return snap.exists ? snap.data() || {} : null;
}

async function readDoc(db, path) {
  const snap = await db.doc(path).get();
  return { snap, data: dataOf(snap) };
}

/**
 * Claim a global artist slug. Never overwrites a slug that already points at someone else.
 * Returns the slug that now belongs to this artist. Does not delete anything.
 */
export async function assignArtistSlug(db, artistId, name, current) {
  if (isSlug(current)) {
    const { data } = await readDoc(db, `slugs/${current}`);
    if (!data) {
      await db.doc(`slugs/${current}`).set({ artistId, kind: "artist" });
      return current;
    }
    if (data.artistId === artistId) return current;
  }
  const taken = new Set();
  const existing = await db.collection("slugs").get();
  for (const doc of existing.docs) {
    if (doc.get("artistId") !== artistId) taken.add(doc.id);
  }
  for (const slug of slugCandidates(name || "page", [...taken])) {
    const ref = db.doc(`slugs/${slug}`);
    const snap = await ref.get();
    if (snap.exists && snap.get("artistId") !== artistId) continue;
    await ref.set({ artistId, kind: "artist" });
    return slug;
  }
  return null;
}

async function lookupCollection(db, artistId, kind) {
  const name = kind === "event" ? "eventShares" : "trackShares";
  return db.collection(`artists/${artistId}/${name}`).get();
}

function shareRef(db, artistId, kind, slug) {
  return db.doc(kind === "event" ? eventSharePath(artistId, slug) : trackSharePath(artistId, slug));
}

function idField(kind) {
  return kind === "event" ? "eventId" : "trackId";
}

/**
 * Claim an event or track slug for one artist. The lookup doc is the uniqueness lock.
 * A slug already pointing at this same document is reused.
 */
export async function assignScopedSlug(db, artistId, kind, targetId, name, current) {
  const field = idField(kind);
  const blocked = kind === "event" ? EVENT_BLOCK : [];
  if (isSlug(current) && !blocked.includes(current)) {
    const ref = shareRef(db, artistId, kind, current);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ [field]: targetId });
      return current;
    }
    if (snap.get(field) === targetId) return current;
  }
  const taken = new Set();
  const existing = await lookupCollection(db, artistId, kind);
  for (const doc of existing.docs) {
    if (doc.get(field) !== targetId) taken.add(doc.id);
  }
  for (const slug of slugCandidates(name || kind, [...taken, ...blocked])) {
    const ref = shareRef(db, artistId, kind, slug);
    const snap = await ref.get();
    if (snap.exists && snap.get(field) !== targetId) continue;
    await ref.set({ [field]: targetId });
    return slug;
  }
  return null;
}

/**
 * Idempotent. Fills missing slugs, share lookups, and public visibility.
 * Does not delete user documents. A slug owned by someone else is left alone and a suffix is chosen.
 */
export async function backfillShares(db) {
  const stats = { artists: 0, events: 0, tracks: 0 };
  const artists = await db.collection("artists").get();
  for (const artist of artists.docs) {
    const data = artist.data() || {};
    const slug = await assignArtistSlug(db, artist.id, data.name || "Artist", data.slug || "");
    if (slug && data.slug !== slug) {
      await artist.ref.update({ slug });
      stats.artists += 1;
    }
    const tracks = await db.collection(`artists/${artist.id}/tracks`).get();
    for (const track of tracks.docs) {
      const trackData = track.data() || {};
      const trackSlug = await assignScopedSlug(db, artist.id, "track", track.id, trackData.title || "track", trackData.slug || "");
      if (trackSlug && trackData.slug !== trackSlug) {
        await track.ref.update({ slug: trackSlug });
        stats.tracks += 1;
      }
    }
  }
  const events = await db.collection("events").get();
  for (const event of events.docs) {
    const data = event.data() || {};
    const patch = {};
    if (data.visibility !== "public" && data.visibility !== "private") patch.visibility = "public";
    const artistId = data.artistId;
    if (typeof artistId === "string" && artistId) {
      const slug = await assignScopedSlug(db, artistId, "event", event.id, data.title || "event", data.slug || "");
      if (slug && data.slug !== slug) patch.slug = slug;
    }
    if (Object.keys(patch).length > 0) {
      await event.ref.update(patch);
      stats.events += 1;
    }
  }
  return stats;
}

export async function loadShareModel(db, parsed) {
  const slugSnap = await db.doc(`slugs/${parsed.artistSlug}`).get();
  if (!slugSnap.exists) return null;
  const artistId = slugSnap.get("artistId");
  if (typeof artistId !== "string" || !artistId) return null;
  const artistSnap = await db.doc(`artists/${artistId}`).get();
  if (!artistSnap.exists) return null;
  const artist = { id: artistId, ...artistSnap.data() };
  let event = null;
  let track = null;
  if (parsed.kind === "event" && parsed.eventSlug) {
    const link = await db.doc(eventSharePath(artistId, parsed.eventSlug)).get();
    if (link.exists && typeof link.get("eventId") === "string") {
      const eventSnap = await db.doc(`events/${link.get("eventId")}`).get();
      if (eventSnap.exists && eventSnap.get("artistId") === artistId) event = { id: eventSnap.id, ...eventSnap.data() };
    }
  }
  if (parsed.kind === "track" && parsed.trackSlug) {
    const link = await db.doc(trackSharePath(artistId, parsed.trackSlug)).get();
    if (link.exists && typeof link.get("trackId") === "string") {
      const trackSnap = await db.doc(`artists/${artistId}/tracks/${link.get("trackId")}`).get();
      if (trackSnap.exists) track = { id: trackSnap.id, ...trackSnap.data() };
    }
  }
  return { artist, event, track };
}

export async function removePrivateOg(bucket, eventId) {
  if (!bucket || !eventId) return;
  try {
    await bucket.file(`og/events/${eventId}.jpg`).delete({ ignoreNotFound: true });
  } catch (error) {
    if (error?.code !== 404) throw error;
  }
}

/**
 * Keep the slug, the lookup, and the preview image aligned with the document.
 * Private events drop their preview image. Nothing here deletes the event, artist, or track.
 */
export async function syncArtistRecord(db, bucket, artistId, after, ensureImage) {
  if (!after) return;
  const slug = await assignArtistSlug(db, artistId, after.name || "Artist", after.slug || "");
  if (!slug) return;
  const revision = previewRevision("artist", { ...after, slug });
  if (after.slug === slug && after.ogRevision === revision) return;
  await ensureImage({
    objectPath: `og/artists/${artistId}.jpg`,
    revision,
    photoUrl: after.imageURL || "",
    title: after.name || "Artist",
    subtitle: after.bio || "",
  });
  const patch = {};
  if (after.slug !== slug) patch.slug = slug;
  if (after.ogRevision !== revision) patch.ogRevision = revision;
  if (Object.keys(patch).length > 0) await db.doc(`artists/${artistId}`).update(patch);
}

export async function syncEventRecord(db, bucket, eventId, after, ensureImage) {
  if (!after) return;
  const patch = {};
  let visibility = after.visibility;
  if (visibility !== "public" && visibility !== "private") {
    visibility = "public";
    patch.visibility = "public";
  }
  let slug = after.slug || "";
  if (after.artistId) {
    const next = await assignScopedSlug(db, after.artistId, "event", eventId, after.title || "event", slug);
    if (next && next !== after.slug) {
      slug = next;
      patch.slug = next;
    } else if (next) slug = next;
  }
  if (!isPublicEvent({ visibility })) {
    await removePrivateOg(bucket, eventId);
    if (after.ogRevision) patch.ogRevision = FieldValue.delete();
    if (Object.keys(patch).length > 0) await db.doc(`events/${eventId}`).update(patch);
    return;
  }
  const revision = previewRevision("event", { ...after, slug, visibility });
  if (after.slug === slug && after.visibility === visibility && after.ogRevision === revision && Object.keys(patch).length === 0) return;
  await ensureImage({
    objectPath: `og/events/${eventId}.jpg`,
    revision,
    photoUrl: after.imageURL || "",
    title: after.title || "Event",
    subtitle: eventSubtitle({ ...after, slug, visibility }),
  });
  if (after.ogRevision !== revision) patch.ogRevision = revision;
  if (Object.keys(patch).length > 0) await db.doc(`events/${eventId}`).update(patch);
}

export async function syncTrackRecord(db, bucket, artistId, trackId, after, ensureImage) {
  if (!after) return;
  const slug = await assignScopedSlug(db, artistId, "track", trackId, after.title || "track", after.slug || "");
  if (!slug) return;
  let artistName = "";
  const artistSnap = await db.doc(`artists/${artistId}`).get();
  if (artistSnap.exists) artistName = artistSnap.get("name") || "";
  const revision = previewRevision("track", { ...after, slug }, artistName);
  if (after.slug === slug && after.ogRevision === revision) return;
  await ensureImage({
    objectPath: `og/tracks/${artistId}/${trackId}.jpg`,
    revision,
    photoUrl: after.coverURL || "",
    title: after.title || "Track",
    subtitle: artistName,
  });
  const patch = {};
  if (after.slug !== slug) patch.slug = slug;
  if (after.ogRevision !== revision) patch.ogRevision = revision;
  if (Object.keys(patch).length > 0) await db.doc(`artists/${artistId}/tracks/${trackId}`).update(patch);
}
