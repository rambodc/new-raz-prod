import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { acceptLoginCode, emulatorSinkEnabled, issueLoginCode, LoginError, sendWithResend } from "./lib/loginCode.js";
import { CheckInError, MAX_IMAGE_BYTES, parseInput, performCheckIn, sniffImageType, validArtistId } from "./lib/checkin.js";
import { imageBuckets, IMAGE_MODEL, IMAGE_ROUTE_BUDGET_SEC, handleImageRequest } from "./lib/images.js";
import { buckets, DEFAULT_MODEL, handleSceneChat } from "./lib/sceneChat.js";
import { CHAT_ROUTE_BUDGET_SEC, SEARCH_MODEL } from "./lib/webSearch.js";

const BUCKET = "new-raz-prod.firebasestorage.app";
const options = { region: "us-central1", maxInstances: 10 };

initializeApp({ storageBucket: BUCKET });

/** Bump when the deployed functions change, so a deploy can be confirmed end to end. */
export const FUNCTIONS_VERSION = "2026.11.09-login-code";

const xaiKey = defineSecret("XAI_API_KEY");
const resendKey = defineSecret("RESEND_API_KEY");

/**
 * Public text chat for the test homepage. The Grok key is a Cloud Secret, never a client value.
 * Creating the secret is required before this function can deploy.
 */
export const sceneChat = onRequest(
  { ...options, timeoutSeconds: CHAT_ROUTE_BUDGET_SEC, memory: "256MiB", maxInstances: 3, secrets: [xaiKey], cors: false, invoker: "public" },
  async (req, res) => {
    const result = await handleSceneChat({
      method: req.method,
      origin: req.get("origin") || "",
      ip: req.ip || req.get("x-forwarded-for") || "",
      body: req.body,
      rawLength: req.rawBody?.length ?? 0,
      now: Date.now(),
      store: buckets,
      apiKey: xaiKey.value(),
      model: process.env.XAI_MODEL || DEFAULT_MODEL,
      searchModel: process.env.XAI_SEARCH_MODEL || SEARCH_MODEL,
      fetchImpl: fetch,
    });
    writeResult(res, result);
  },
);

function writeResult(res, result) {
  res.set("Cache-Control", "no-store");
  if (result.allowOrigin) {
    res.set("Access-Control-Allow-Origin", result.allowOrigin);
    res.set("Vary", "Origin");
  }
  for (const [name, value] of Object.entries(result.extraHeaders)) res.set(name, value);
  if (result.status === 204) {
    res.status(204).send("");
    return;
  }
  res.status(result.status).json(result.body);
}

/**
 * One image generation or edit. Separate from chat so a photo cannot use the text allowance.
 * The same Cloud Secret is read here. The browser never receives it.
 */
export const sceneImage = onRequest(
  { region: "us-central1", timeoutSeconds: IMAGE_ROUTE_BUDGET_SEC, memory: "512MiB", maxInstances: 2, secrets: [xaiKey], cors: false, invoker: "public" },
  async (req, res) => {
    const result = await handleImageRequest({
      method: req.method,
      origin: req.get("origin") || "",
      ip: req.ip || req.get("x-forwarded-for") || "",
      body: req.body,
      rawLength: req.rawBody?.length ?? 0,
      now: Date.now(),
      store: imageBuckets,
      apiKey: xaiKey.value(),
      model: process.env.XAI_IMAGE_MODEL || IMAGE_MODEL,
      fetchImpl: fetch,
    });
    writeResult(res, result);
  },
);

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

function clientIp(request) {
  const ip = request.rawRequest?.ip;
  return typeof ip === "string" && ip.length > 0 ? ip.slice(0, 64) : "unknown";
}

async function deliverLoginEmail(payload) {
  if (emulatorSinkEnabled()) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile("/tmp/razzberry-last-code.json", JSON.stringify({ to: payload.to, code: payload.code }));
    return { error: null };
  }
  return sendWithResend(resendKey.value(), payload);
}

function toLoginHttpsError(error) {
  if (!(error instanceof LoginError)) {
    console.error("login function failed", error?.code || error?.name || "error");
    return new HttpsError("internal", "Something went wrong. Try again.");
  }
  const messages = {
    "bad-email": ["invalid-argument", "Enter a valid email address."],
    "bad-code": ["invalid-argument", "Enter the 6-digit code."],
    "too-soon": ["resource-exhausted", "Please wait a minute before requesting another code."],
    "rate-limited": ["resource-exhausted", "Too many codes were requested. Try again later."],
    "wrong-code": ["failed-precondition", "That code is incorrect."],
    expired: ["failed-precondition", "That code has expired. Send a new one."],
    "too-many-attempts": ["failed-precondition", "Too many tries. Send a new code."],
    "send-failed": ["internal", "Could not send the email. Try again."],
    "token-failed": ["internal", "Could not finish signing you in."],
  };
  const [code, message] = messages[error.reason] ?? ["internal", "Something went wrong. Try again."];
  return new HttpsError(code, message, { reason: error.reason });
}

/** Emails a 6-digit sign-in code. The Resend key is the secret RESEND_API_KEY and is never returned. */
export const sendLoginCode = onCall({ ...options, timeoutSeconds: 30, secrets: [resendKey], invoker: "public" }, async (request) => {
  try {
    return await issueLoginCode({
      db: getFirestore(),
      email: request.data?.email,
      ip: clientIp(request),
      now: Date.now(),
      sendEmail: deliverLoginEmail,
    });
  } catch (error) {
    throw toLoginHttpsError(error);
  }
});

/** Checks the code and returns a Firebase custom token. Old user documents are replaced, not kept. */
export const verifyLoginCode = onCall({ ...options, timeoutSeconds: 30, invoker: "public" }, async (request) => {
  try {
    return await acceptLoginCode({
      db: getFirestore(),
      auth: getAuth(),
      email: request.data?.email,
      code: request.data?.code,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
      projectId: process.env.GCLOUD_PROJECT || "new-raz-prod",
    });
  } catch (error) {
    throw toLoginHttpsError(error);
  }
});
