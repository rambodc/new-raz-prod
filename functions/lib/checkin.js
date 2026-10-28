// The check-in rules, kept free of Firebase imports so they are easy to test.

export const MAX_DISTANCE_M = 150;
export const MAX_ACCURACY_M = 200;
/** A show counts as live from this long before it starts until this long after it ends. */
export const GRACE_MS = 15 * 60 * 1000;
/** A little of the phone's reported accuracy is forgiven, but never more than this. */
export const ACCURACY_FORGIVENESS_M = 50;

/** A failure the fan can understand. `reason` is a stable code the app turns into a plain sentence. */
export class CheckInError extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.reason = reason;
  }
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance in metres between two points on Earth (haversine). */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Checks what the app sent. Throws CheckInError("bad-input") if anything is off. */
export function parseInput(data) {
  const { showId, lat, lng, accuracy } = data ?? {};
  if (typeof showId !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(showId)) throw new CheckInError("bad-input", "Missing show.");
  if (!isNum(lat) || lat < -90 || lat > 90 || !isNum(lng) || lng < -180 || lng > 180) throw new CheckInError("bad-input", "Missing location.");
  if (!isNum(accuracy) || accuracy < 0) throw new CheckInError("bad-input", "Missing location accuracy.");
  return { showId, lat, lng, accuracy };
}

export function isLive(show, nowMs) {
  return nowMs >= show.startsAt.toMillis() - GRACE_MS && nowMs <= show.endsAt.toMillis() + GRACE_MS;
}

/** Applies the three rules in order: live, location good enough, close enough. Returns the distance in metres. */
export function checkRules(show, { lat, lng, accuracy }, nowMs) {
  if (!isLive(show, nowMs)) throw new CheckInError("not-live", "This show is not on right now.");
  if (accuracy > MAX_ACCURACY_M) throw new CheckInError("poor-accuracy", "Your location is not exact enough.");
  const distance = distanceMeters(lat, lng, show.lat, show.lng);
  if (distance - Math.min(accuracy, ACCURACY_FORGIVENESS_M) > MAX_DISTANCE_M) throw new CheckInError("too-far", "You are not at the show.");
  return distance;
}

/**
 * Records one check-in. Runs in a single transaction so a fan is never counted twice, even if they tap twice.
 * Stores only "this fan checked in at this show at this time". The fan's coordinates are never saved.
 */
export async function performCheckIn(db, uid, input, nowMs, timestampOf) {
  const showRef = db.doc(`shows/${input.showId}`);
  const checkinRef = db.doc(`checkins/${input.showId}_${uid}`);
  return db.runTransaction(async (tx) => {
    const [showSnap, checkinSnap] = await Promise.all([tx.get(showRef), tx.get(checkinRef)]);
    if (!showSnap.exists) throw new CheckInError("no-show", "That show was not found.");
    const show = showSnap.data();
    if (checkinSnap.exists) return { status: "already", artists: show.artistNames ?? [] };
    checkRules(show, input, nowMs);

    const ids = show.artistIds ?? [];
    const artistRefs = ids.map((id) => db.doc(`artists/${id}`));
    const countRefs = ids.map((id) => db.doc(`users/${uid}/artistCounts/${id}`));
    const fanRefs = ids.map((id) => db.doc(`artists/${id}/fans/${uid}`));
    const [artists, counts, fans] = await Promise.all([
      Promise.all(artistRefs.map((r) => tx.get(r))),
      Promise.all(countRefs.map((r) => tx.get(r))),
      Promise.all(fanRefs.map((r) => tx.get(r))),
    ]);

    const at = timestampOf(nowMs);
    tx.set(checkinRef, { showId: input.showId, uid, at });
    const result = [];
    ids.forEach((id, i) => {
      const name = artists[i].exists ? artists[i].data().name : (show.artistNames?.[i] ?? "");
      const count = (counts[i].exists ? counts[i].data().count : 0) + 1;
      tx.set(countRefs[i], { artistId: id, artistName: name, count });
      // A fan counts once per artist, however many of that artist's shows they attend.
      if (!fans[i].exists) {
        tx.set(fanRefs[i], { at });
        if (artists[i].exists) tx.update(artistRefs[i], { fanCount: (artists[i].data().fanCount ?? 0) + 1 });
      }
      result.push({ id, name, count });
    });
    return { status: "checked-in", artists: result };
  });
}

/* ----- Artist images ----- */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Works out the image type from the first bytes, so a renamed file cannot slip through. */
export function sniffImageType(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function validArtistId(id) {
  return typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id);
}
