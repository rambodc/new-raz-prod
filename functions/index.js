import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { InviteError, createInvite as makeInvite, deactivateInvite as disableInvite, eventDesk as loadDesk, inviteCover as loadInviteCover, openInvite as readInvite, rsvpCancel as undoRsvp, rsvpGoing as goingRsvp } from "./lib/invites.js";
import { ensureOgImage, handleShareRequest } from "./lib/sharePage.js";
import { syncArtistRecord, syncEventRecord, syncTrackRecord } from "./lib/shares.js";
import { defineSecret } from "firebase-functions/params";
import { acceptLoginCode, emulatorSinkEnabled, issueLoginCode, LoginError, sendWithResend } from "./lib/loginCode.js";
import { confirmEmailChange as applyEmailChange, EmailChangeError, requestEmailChange as issueEmailChange } from "./lib/emailChange.js";
import { applyUserRole, RoleError } from "./lib/roles.js";
import { CheckInError, parseInput, performCheckIn } from "./lib/checkin.js";
import { imageBuckets, IMAGE_MODEL, IMAGE_ROUTE_BUDGET_SEC, handleImageRequest } from "./lib/images.js";
import { buckets, DEFAULT_MODEL, handleSceneChat } from "./lib/sceneChat.js";
import { CHAT_ROUTE_BUDGET_SEC, SEARCH_MODEL } from "./lib/webSearch.js";

const BUCKET = "new-raz-prod.firebasestorage.app";
const options = { region: "us-central1", maxInstances: 10 };

initializeApp({ storageBucket: BUCKET });

/** Bump when the deployed functions change, so a deploy can be confirmed end to end. */
export const FUNCTIONS_VERSION = "2026.11.12-invites";

const imageOptions = { region: "us-central1", memory: "1GiB", timeoutSeconds: 60, maxInstances: 5 };

function saveOg(spec) {
  return ensureOgImage({ ...spec, bucket: getStorage().bucket(), bucketName: BUCKET });
}

/**
 * Share URLs are rewritten here so crawlers receive index.html with Open Graph tags.
 * Browsers receive that same shell and boot the SPA. Static files never hit this function.
 */
export const sharePage = onRequest({ ...imageOptions, maxInstances: 10, cors: false, invoker: "public" }, async (req, res) => {
  try {
    const result = await handleShareRequest(req, { db: getFirestore(), bucket: getStorage().bucket(), bucketName: BUCKET });
    res.set("Cache-Control", result.cache);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(result.status).send(result.html);
  } catch (error) {
    console.error("sharePage failed", error?.message || error);
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send('<!doctype html><title>Razzberry</title><meta name="theme-color" content="#000000">');
  }
});

export const shareArtist = onDocumentWritten({ document: "artists/{artistId}", ...imageOptions }, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  await syncArtistRecord(getFirestore(), getStorage().bucket(), event.params.artistId, after, saveOg);
});

export const shareEvent = onDocumentWritten({ document: "events/{eventId}", ...imageOptions }, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  await syncEventRecord(getFirestore(), getStorage().bucket(), event.params.eventId, after, saveOg);
});

export const shareTrack = onDocumentWritten({ document: "artists/{artistId}/tracks/{trackId}", ...imageOptions }, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  await syncTrackRecord(getFirestore(), getStorage().bucket(), event.params.artistId, event.params.trackId, after, saveOg);
});

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

function clientIp(request) {
  const ip = request.rawRequest?.ip;
  return typeof ip === "string" && ip.length > 0 ? ip.slice(0, 64) : "unknown";
}

async function deliverEmail(payload) {
  if (emulatorSinkEnabled()) {
    const { appendFile, writeFile } = await import("node:fs/promises");
    await appendFile("/tmp/razzberry-emails.jsonl", `${JSON.stringify({ to: payload.to, kind: payload.kind || "login", code: payload.code || "" })}\n`);
    if (payload.code && (!payload.kind || payload.kind === "login")) {
      await writeFile("/tmp/razzberry-last-code.json", JSON.stringify({ to: payload.to, code: payload.code }));
    }
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
      sendEmail: deliverEmail,
    });
  } catch (error) {
    throw toLoginHttpsError(error);
  }
});

function toRoleHttpsError(error) {
  if (!(error instanceof RoleError)) {
    console.error("setUserRole failed", error?.code || error?.name || "error");
    return new HttpsError("internal", "Could not update that role.");
  }
  const code = error.reason === "not-found" ? "not-found" : error.reason === "forbidden" || error.reason === "unauthenticated" ? "permission-denied" : "invalid-argument";
  return new HttpsError(code, error.message);
}

/** Admins only (custom claim admin: true). Sets users/{uid}.role and, for a new artist, creates artists/{uid}. */
export const setUserRole = onCall({ ...options, timeoutSeconds: 30, invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  try {
    return await applyUserRole({
      db: getFirestore(),
      auth: getAuth(),
      caller: request.auth,
      email: request.data?.email,
      role: request.data?.role,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
    });
  } catch (error) {
    throw toRoleHttpsError(error);
  }
});

function toEmailHttpsError(error) {
  if (!(error instanceof EmailChangeError)) {
    console.error("email change failed", error?.code || error?.name || "error");
    return new HttpsError("internal", "Something went wrong. Try again.");
  }
  const messages = {
    unauthenticated: ["unauthenticated", "Sign in first."],
    "bad-email": ["invalid-argument", "Enter a valid email address."],
    "bad-code": ["invalid-argument", "Enter the 6-digit code."],
    "same-email": ["failed-precondition", "That's already your email."],
    "email-taken": ["already-exists", "That email is already on another account."],
    "too-soon": ["resource-exhausted", "Please wait a minute before requesting another code."],
    "rate-limited": ["resource-exhausted", "Too many codes were requested. Try again later."],
    "wrong-code": ["failed-precondition", "That code is incorrect."],
    expired: ["failed-precondition", "That code has expired. Send a new one."],
    "too-many-attempts": ["failed-precondition", "Too many tries. Send a new code."],
    "send-failed": ["internal", "Could not send the email. Try again."],
  };
  const [code, message] = messages[error.reason] ?? ["internal", "Something went wrong. Try again."];
  return new HttpsError(code, message, { reason: error.reason });
}

/** Emails a 6-digit code to the new address. The signed-in user is unchanged until the code is confirmed. */
export const requestEmailChange = onCall({ ...options, timeoutSeconds: 30, secrets: [resendKey], invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  try {
    return await issueEmailChange({
      db: getFirestore(),
      auth: getAuth(),
      uid: request.auth.uid,
      email: request.data?.email,
      now: Date.now(),
      sendEmail: (payload) => deliverEmail({ ...payload, kind: payload.kind || "email-change" }),
    });
  } catch (error) {
    throw toEmailHttpsError(error);
  }
});

/** Checks the code, updates this Auth user and users/{uid}.email, then emails the previous address. */
export const confirmEmailChange = onCall({ ...options, timeoutSeconds: 30, secrets: [resendKey], invoker: "public" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  try {
    return await applyEmailChange({
      db: getFirestore(),
      auth: getAuth(),
      uid: request.auth.uid,
      code: request.data?.code,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
      sendEmail: (payload) => deliverEmail(payload),
    });
  } catch (error) {
    throw toEmailHttpsError(error);
  }
});

/** Checks the code and returns a Firebase custom token. A profile is created only when this person has none. */
export const verifyLoginCode = onCall({ ...options, timeoutSeconds: 30, invoker: "public" }, async (request) => {
  try {
    return await acceptLoginCode({
      db: getFirestore(),
      auth: getAuth(),
      email: request.data?.email,
      code: request.data?.code,
      inviteCode: request.data?.inviteCode,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
      projectId: process.env.GCLOUD_PROJECT || "new-raz-prod",
    });
  } catch (error) {
    throw toLoginHttpsError(error);
  }
});

function toInviteHttpsError(error) {
  if (!(error instanceof InviteError)) {
    console.error("invite function failed", error?.code || error?.name || "error");
    return new HttpsError("internal", "Something went wrong. Try again.");
  }
  const messages = {
    "bad-input": ["invalid-argument", error.message],
    forbidden: ["permission-denied", error.message],
    "not-found": ["not-found", error.message],
    unauthenticated: ["unauthenticated", "Sign in first."],
    "rate-limited": ["resource-exhausted", "Too many requests. Try again later."],
    ended: ["failed-precondition", "This event has ended."],
    unavailable: ["unavailable", "Could not create an invite. Try again."],
  };
  const [code, message] = messages[error.reason] ?? ["internal", "Something went wrong. Try again."];
  return new HttpsError(code, message, { reason: error.reason });
}

const inviteOptions = { ...options, timeoutSeconds: 30, invoker: "public" };
const publicOrigin = process.env.PUBLIC_ORIGIN || "https://new-raz-prod.web.app";

/** Creates or reuses the caller's invite link. Signed-out visitors can share a public event. */
export const createInvite = onCall(inviteOptions, async (request) => {
  try {
    return await makeInvite({
      db: getFirestore(),
      uid: request.auth?.uid || "",
      eventId: request.data?.eventId,
      guestKey: request.data?.guestKey,
      regenerate: request.data?.regenerate === true,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
    });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** Host only. Turns an invite off and drops access that never became an RSVP. */
export const deactivateInvite = onCall(inviteOptions, async (request) => {
  try {
    return await disableInvite({
      db: getFirestore(),
      uid: request.auth?.uid || "",
      code: request.data?.code,
      now: Date.now(),
    });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** Validates /i/{code}. Private event fields are returned only for an active, unexpired invite. */
export const openInvite = onCall(inviteOptions, async (request) => {
  try {
    return await readInvite({
      db: getFirestore(),
      uid: request.auth?.uid || "",
      code: request.data?.code,
      deviceKey: request.data?.deviceKey,
      ip: clientIp(request),
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
    });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** What this person is allowed to see: a count, the guest list, or the host desk. */
export const eventDesk = onCall(inviteOptions, async (request) => {
  try {
    return await loadDesk({ db: getFirestore(), uid: request.auth?.uid || "", eventId: request.data?.eventId });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** Records Going, attributes the invite, and emails the host. The Resend key is RESEND_API_KEY. */
export const rsvpGoing = onCall({ ...inviteOptions, secrets: [resendKey] }, async (request) => {
  try {
    return await goingRsvp({
      db: getFirestore(),
      auth: getAuth(),
      uid: request.auth?.uid || "",
      eventId: request.data?.eventId,
      inviteCode: request.data?.inviteCode,
      now: Date.now(),
      timestampOf: (ms) => Timestamp.fromMillis(ms),
      sendEmail: (payload) => deliverEmail({ ...payload, kind: "rsvp" }),
      origin: publicOrigin,
    });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** Removes this person's Going RSVP. Signup counts stay, since the account was already created. */
export const rsvpCancel = onCall(inviteOptions, async (request) => {
  try {
    return await undoRsvp({ db: getFirestore(), uid: request.auth?.uid || "", eventId: request.data?.eventId });
  } catch (error) {
    throw toInviteHttpsError(error);
  }
});

/** Streams a private event photo after the invite code checks out. No code, no bytes. */
export const inviteCover = onRequest({ ...options, timeoutSeconds: 30, memory: "256MiB", cors: false, invoker: "public" }, async (req, res) => {
  try {
    const code = typeof req.query?.code === "string" ? req.query.code : "";
    const result = await loadInviteCover({
      db: getFirestore(),
      bucket: getStorage().bucket(),
      code,
      now: Date.now(),
      ip: req.ip || req.get("x-forwarded-for") || "",
    });
    if (!result) {
      res.set("Cache-Control", "private, no-store");
      res.status(404).send("");
      return;
    }
    res.set("Cache-Control", "private, max-age=300");
    res.set("Content-Type", result.contentType);
    res.status(200).send(result.buffer);
  } catch (error) {
    console.error("invite cover failed", error?.name || "error");
    res.set("Cache-Control", "private, no-store");
    res.status(404).send("");
  }
});
