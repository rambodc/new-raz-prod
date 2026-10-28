import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { CheckInError, MAX_IMAGE_BYTES, parseInput, performCheckIn, sniffImageType, validArtistId } from "./lib/checkin.js";

const BUCKET = "new-raz-prod.firebasestorage.app";
const options = { region: "us-central1", maxInstances: 10 };

initializeApp({ storageBucket: BUCKET });

/** Bump when the deployed functions change, so a deploy can be confirmed end to end. */
export const FUNCTIONS_VERSION = "2026.10.28-fan-counter";

function toHttpsError(error) {
  if (error instanceof CheckInError) {
    const code = error.reason === "bad-input" ? "invalid-argument" : error.reason === "no-show" ? "not-found" : "failed-precondition";
    return new HttpsError(code, error.message, { reason: error.reason });
  }
  return error;
}

/**
 * Confirms a fan is at a live show, then records the check-in and updates their numbers.
 * The fan's coordinates are used for the check and thrown away.
 */
export const checkIn = onCall(options, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  try {
    const input = parseInput(request.data);
    return await performCheckIn(getFirestore(), request.auth.uid, input, Date.now(), (ms) => Timestamp.fromMillis(ms));
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admins only. Saves the one image an artist has (a new upload replaces the old one). */
export const setArtistImage = onCall({ ...options, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore();
  const admin = await db.doc(`admins/${request.auth.uid}`).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Admins only.");

  const { artistId, imageBase64 } = request.data ?? {};
  if (!validArtistId(artistId) || typeof imageBase64 !== "string") throw new HttpsError("invalid-argument", "Missing artist or image.");
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new HttpsError("invalid-argument", "The image must be under 5 MB.");
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new HttpsError("invalid-argument", "Use a JPG, PNG or WebP image.");

  const artistRef = db.doc(`artists/${artistId}`);
  if (!(await artistRef.get()).exists) throw new HttpsError("not-found", "That artist was not found.");

  const path = `artists/${artistId}/image`;
  await getStorage().bucket().file(path).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "public,max-age=3600" } });
  const imageVersion = Date.now();
  // The bucket is publicly readable for artist images (see storage.rules), so no download token is needed.
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&v=${imageVersion}`;
  await artistRef.update({ imageUrl, imageVersion });
  return { imageUrl };
});
