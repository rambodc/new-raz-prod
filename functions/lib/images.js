/**
 * One explicit image generation or edit through xAI Imagine.
 * Generation starts with deferred: true and returns a request id. The browser polls
 * until the provider is done. Each website call stays under the 60s Hosting rewrite limit.
 * A finished image is downloaded only from an x.ai host, then returned as bytes.
 * Edits stay synchronous and do not set an aspect ratio unless the instruction asks.
 */

import { allowOrigin, corsHeaders, takeSlot } from "./sceneChat.js";
import { IMAGE_FILE_LIMITS, inspectImage } from "./imageFile.js";

export const IMAGE_MODEL = "grok-imagine-image-2.0";
export const IMAGE_LIMITS = {
  perIp: 8,
  perIpWindowMs: 10 * 60 * 1000,
  global: 40,
  globalWindowMs: 60 * 60 * 1000,
  pollPerIp: 120,
  pollGlobal: 800,
  maxInflight: 2,
  maxPrompt: 400,
  maxRawBytes: 7_000_000,
  maxOutputChars: 6_000_000,
  ...IMAGE_FILE_LIMITS,
};

/** Firebase Hosting rewrites die at 60s. Every /api/image call stays under that. */
export const IMAGE_ROUTE_BUDGET_SEC = 55;
export const EDIT_TIMEOUT_MS = 45_000;
export const START_TIMEOUT_MS = 20_000;
export const POLL_TIMEOUT_MS = 15_000;

const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;
const PROVIDER_HOST = /^(?:[a-z0-9-]+\.)*x\.ai$/i;
export const imageBuckets = new Map();
let inflight = 0;

function plain(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function minutes(seconds) {
  return Math.max(1, Math.ceil(seconds / 60));
}

function limited(slot, browser) {
  const wait = slot.retryAfterSec;
  const count = minutes(wait);
  return {
    status: 429,
    body: {
      error: "rate-limited",
      scope: browser ? "image" : "image-instance",
      retryAfterSec: wait,
      message: browser
        ? `This browser can make ${IMAGE_LIMITS.perIp} images every 10 minutes. Try again in about ${count} minute${count === 1 ? "" : "s"}.`
        : `This server copy allows ${IMAGE_LIMITS.global} images an hour. Try again in about ${count} minute${count === 1 ? "" : "s"}.`,
    },
  };
}

function decodeImage(data) {
  if (typeof data !== "string" || !data || data.length > IMAGE_LIMITS.maxOutputChars) return { error: "That photo is too large." };
  const compact = data.replace(/\s+/g, "");
  if (compact.startsWith("http://") || compact.startsWith("https://") || compact.startsWith("data:")) return { error: "Send the photo data, not a link." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return { error: "That photo could not be read." };
  const bytes = Buffer.from(compact, "base64");
  if (!bytes.length) return { error: "That photo could not be read." };
  const checked = inspectImage(bytes, IMAGE_LIMITS);
  if (checked.error) return checked;
  return { bytes, mime: checked.mime, data: bytes.toString("base64") };
}

function requestedAspect(prompt) {
  if (/\bsquare\b/i.test(prompt)) return "1:1";
  if (/\bportrait\b/i.test(prompt)) return "3:4";
  if (/\blandscape\b|\bwide\b/i.test(prompt)) return "3:2";
  return "";
}

function providerImageUrl(raw) {
  if (typeof raw !== "string" || raw.length > 500) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!PROVIDER_HOST.test(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function bytesFromProvider(item, fetchImpl) {
  if (item?.b64_json) return readOutput({ data: [item] });
  const target = providerImageUrl(item?.url);
  if (!target) return { error: "The image provider returned a link we won't download." };
  let response;
  try {
    response = await fetchImpl(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(POLL_TIMEOUT_MS) });
  } catch {
    return { error: "The image provider didn't return an image." };
  }
  if (response.status >= 300 && response.status < 400) return { error: "The image provider returned a link we won't download." };
  if (!response.ok) return { error: "The image provider didn't return an image." };
  const bytes = Buffer.from(await response.arrayBuffer());
  const checked = inspectImage(bytes, { ...IMAGE_LIMITS, maxEdge: 4096, maxBytes: 5_000_000 });
  if (checked.error) return { error: "The image provider didn't return a usable image." };
  return { data: bytes.toString("base64"), mime: checked.mime };
}

function readyBody(image, kind, model) {
  return { status: "ready", image: image.data, mime: image.mime, kind, model };
}

function readOutput(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const item = data[0];
  if (!item || typeof item.b64_json !== "string" || !item.b64_json) {
    if (item?.url) return { error: "The image provider returned a link instead of the image, so it was not downloaded." };
    return { error: "The image provider didn't return an image." };
  }
  if (item.b64_json.length > IMAGE_LIMITS.maxOutputChars) return { error: "The image was too large to keep." };
  let bytes;
  try {
    bytes = Buffer.from(item.b64_json, "base64");
  } catch {
    return { error: "The image provider didn't return an image." };
  }
  const checked = inspectImage(bytes, { ...IMAGE_LIMITS, maxEdge: 4096, maxBytes: 5_000_000 });
  if (checked.error) return { error: "The image provider didn't return a usable image." };
  return { data: item.b64_json, mime: checked.mime };
}

/**
 * @param {{ method: string, origin: string, ip: string, body: unknown, rawLength: number, now: number, store?: Map<string, number[]>, apiKey: string, model?: string, fetchImpl: typeof fetch }} input
 */
export async function handleImageRequest({ method, origin, ip, body, rawLength, now, store, apiKey, model, fetchImpl }) {
  const allowed = allowOrigin(origin || "");
  const extraHeaders = corsHeaders();
  const fail = (status, error, message) => ({ status, body: { error, message }, allowOrigin: allowed, extraHeaders });
  if (method === "OPTIONS") {
    if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use images." }, allowOrigin: null, extraHeaders };
    return { status: 204, body: null, allowOrigin: allowed, extraHeaders };
  }
  if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use images." }, allowOrigin: null, extraHeaders };
  if (method !== "POST") return fail(405, "method", "Send an image request.");
  if (rawLength > IMAGE_LIMITS.maxRawBytes) return fail(413, "too-large", "That photo is too large.");
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "bad-input", "That image request could not be read.");

  if (body.action === "poll") {
    return pollGeneration({ body, ip, now, store, apiKey, model, fetchImpl, fail, allowed, extraHeaders });
  }

  const allowedKeys = new Set(["action", "prompt", "aspect", "image"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return fail(400, "bad-input", "An image request only accepts the photo and the instruction.");
  const action = body.action === "edit" ? "edit" : body.action === "generate" ? "generate" : "";
  if (!action) return fail(400, "bad-input", "Choose a new image or an edit.");
  const prompt = plain(body.prompt, IMAGE_LIMITS.maxPrompt + 20);
  if (!prompt) return fail(400, "bad-input", "Describe the image first.");
  if (prompt.length > IMAGE_LIMITS.maxPrompt) return fail(400, "bad-input", "Keep the image instruction under 400 characters.");
  if (/\b(password|api[_ -]?key|secret)\b/i.test(prompt)) return fail(400, "bad-input", "Don't put secrets in an image instruction.");

  let encoded = null;
  if (action === "generate" && body.image) return fail(400, "bad-input", "A new image doesn't take a photo. Choose Edit to change one.");
  if (action === "edit") {
    if (!body.image || typeof body.image !== "object" || body.image.url || body.url) return fail(400, "bad-input", "Send the photo data, not a link.");
    encoded = decodeImage(body.image.data);
    if (encoded.error) return fail(400, "bad-input", encoded.error);
  }

  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) return fail(503, "not-configured", "Image generation isn't configured on the server yet.");

  const memory = store ?? imageBuckets;
  const caller = String(ip || "unknown").slice(0, 64);
  const ipSlot = takeSlot(memory, `image:${caller}`, now, IMAGE_LIMITS.perIpWindowMs, IMAGE_LIMITS.perIp);
  if (!ipSlot.ok) return { ...limited(ipSlot, true), allowOrigin: allowed, extraHeaders };
  const globalSlot = takeSlot(memory, "image-global", now, IMAGE_LIMITS.globalWindowMs, IMAGE_LIMITS.global);
  if (!globalSlot.ok) return { ...limited(globalSlot, false), allowOrigin: allowed, extraHeaders };
  if (inflight >= IMAGE_LIMITS.maxInflight) return fail(429, "busy", "This server copy is already making images. Try again in a moment.");

  const shape = requestedAspect(prompt) || (action === "generate" ? "3:2" : "");
  const instruction = action === "edit"
    ? `Edit the attached photo. Keep the same person recognizable unless the instruction says otherwise. ${prompt}`
    : `Create one new image with no text overlay unless the instruction asks for text. ${prompt}`;
  const request = {
    model: model || IMAGE_MODEL,
    prompt: instruction,
    n: 1,
    resolution: "1k",
    quality: "medium",
  };
  if (shape) request.aspect_ratio = shape;
  if (action === "edit" && encoded) {
    request.response_format = "b64_json";
    request.image = { type: "image_url", url: `data:${encoded.mime};base64,${encoded.data}` };
  } else {
    request.deferred = true;
  }

  const kind = action === "edit" ? "ai-edited" : "ai-generated";
  inflight += 1;
  let response;
  try {
    response = await fetchImpl(action === "edit" ? "https://api.x.ai/v1/images/edits" : "https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(action === "edit" ? EDIT_TIMEOUT_MS : START_TIMEOUT_MS),
    });
  } catch {
    return fail(502, "image-failed", "The image provider didn't answer in time. Try again.");
  } finally {
    inflight = Math.max(0, inflight - 1);
  }
  if (response.status === 401 || response.status === 403) return fail(502, "image-auth", "The image provider rejected the server credential.");
  if (!response.ok && response.status !== 202) return fail(502, "image-failed", "The image provider didn't answer. Try again.");
  let payload;
  try {
    payload = await response.json();
  } catch {
    return fail(502, "image-failed", "The image provider didn't answer. Try again.");
  }
  if (action === "generate") {
    const requestId = payload?.request_id || payload?.requestId || "";
    if (typeof requestId === "string" && REQUEST_ID.test(requestId) && !payload?.data?.[0]?.b64_json) {
      return { status: 202, body: { status: "pending", requestId, kind, model: model || IMAGE_MODEL }, allowOrigin: allowed, extraHeaders };
    }
  }
  const image = await bytesFromProvider(payload?.data?.[0], fetchImpl);
  if (image.error) return fail(502, "image-failed", image.error);
  return { status: 200, body: readyBody(image, kind, model || IMAGE_MODEL), allowOrigin: allowed, extraHeaders };
}

async function pollGeneration({ body, ip, now, store, apiKey, model, fetchImpl, fail, allowed, extraHeaders }) {
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "action" && key !== "requestId")) return fail(400, "bad-input", "A status check only accepts the image id.");
  if (body.image || body.url || body.prompt) return fail(400, "bad-input", "A status check only accepts the image id.");
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!REQUEST_ID.test(requestId)) return fail(400, "bad-input", "That image id is not valid.");
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) return fail(503, "not-configured", "Image generation isn't configured on the server yet.");

  const memory = store ?? imageBuckets;
  const caller = String(ip || "unknown").slice(0, 64);
  const ipSlot = takeSlot(memory, `image-poll:${caller}`, now, IMAGE_LIMITS.perIpWindowMs, IMAGE_LIMITS.pollPerIp);
  if (!ipSlot.ok) return fail(429, "rate-limited", "Too many image checks from this browser. Wait a minute and try again.");
  const globalSlot = takeSlot(memory, "image-poll-global", now, IMAGE_LIMITS.globalWindowMs, IMAGE_LIMITS.pollGlobal);
  if (!globalSlot.ok) return fail(429, "rate-limited", "This server copy is checking too many images. Try again in a minute.");

  let response;
  try {
    response = await fetchImpl(`https://api.x.ai/v1/images/${requestId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
  } catch {
    return fail(502, "image-failed", "The image provider didn't answer in time. Try again.");
  }
  if (response.status === 401 || response.status === 403) return fail(502, "image-auth", "The image provider rejected the server credential.");
  if (response.status !== 200 && response.status !== 202) return fail(502, "image-failed", "The image provider didn't answer. Try again.");
  let payload;
  try {
    payload = await response.json();
  } catch {
    return fail(502, "image-failed", "The image provider didn't answer. Try again.");
  }
  if (response.status === 202 || payload?.status === "pending") {
    return { status: 202, body: { status: "pending", requestId, kind: "ai-generated", model: model || IMAGE_MODEL }, allowOrigin: allowed, extraHeaders };
  }
  if (payload?.status === "failed") {
    const message = plain(payload?.error?.message, 180) || "The image provider didn't return an image.";
    return fail(502, "image-failed", message);
  }
  const image = await bytesFromProvider(payload?.data?.[0], fetchImpl);
  if (image.error) return fail(502, "image-failed", image.error);
  return { status: 200, body: readyBody(image, "ai-generated", model || IMAGE_MODEL), allowOrigin: allowed, extraHeaders };
}
