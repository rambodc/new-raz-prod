import { DEFAULT_SCENE, mergeScene, sanitizeScene } from "./sceneSchema.js";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const MAX_GLOBAL = 80;
const MAX_RAW_BYTES = 12_000;
const MAX_MESSAGES = 8;
const MAX_MESSAGE = 500;
const MAX_OUTPUT_TOKENS = 400;
export const DEFAULT_MODEL = "grok-4.20-0309-non-reasoning";

const ORIGINS = new Set([
  "https://new-raz-prod.web.app",
  "https://new-raz-prod.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const SYSTEM = [
  "You adjust one full-screen portrait scene. The person's photograph is never sent to you and you cannot replace their face.",
  "Respond with one JSON object only: {\"reply\":\"plain text\",\"scene\":{...}}.",
  "reply is one or two short sentences, plain text, no HTML.",
  "scene may include colors.base, colors.glow, colors.deep as #rrggbb;",
  "light.warmth and light.intensity from 0 to 1;",
  "shapes.count from 3 to 7, shapes.softness and shapes.drift from 0 to 1;",
  "name up to 32 characters, line up to 90 characters;",
  "portrait.x and portrait.y from -1 to 1, portrait.scale from 0.55 to 1.35.",
  "Omit any scene field you are not changing. Do not include any other keys.",
].join(" ");

export const buckets = new Map();

function allowOrigin(origin) {
  if (ORIGINS.has(origin)) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return origin;
  } catch {
    return null;
  }
  return null;
}

function takeSlot(store, key, now, windowMs, max) {
  const recent = (store.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

function plainReply(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function readMessages(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return { error: "Send a short message." };
  const messages = [];
  for (const item of body.messages.slice(-MAX_MESSAGES)) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") {
      return { error: "That message could not be read." };
    }
    const content = item.content.replace(/[\u0000-\u0008]/g, "").trim();
    if (!content || content.length > MAX_MESSAGE) return { error: "Keep the message under 500 characters." };
    messages.push({ role: item.role, content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return { error: "Send a short message." };
  return { messages };
}

function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  }
  return "";
}

/**
 * Public chat endpoint. The provider key stays in this process.
 * Limits are per server instance, so they reduce abuse without a shared database.
 */
export async function handleSceneChat({ method, origin, ip, body, rawLength, now, store, apiKey, model, fetchImpl }) {
  const allowed = allowOrigin(origin || "");
  const extraHeaders = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (method === "OPTIONS") {
    if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use chat." }, allowOrigin: null, extraHeaders };
    return { status: 204, body: null, allowOrigin: allowed, extraHeaders };
  }
  if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use chat." }, allowOrigin: null, extraHeaders };
  if (method !== "POST") return { status: 405, body: { error: "method", message: "Send a message." }, allowOrigin: allowed, extraHeaders };
  if (rawLength > MAX_RAW_BYTES) return { status: 413, body: { error: "too-large", message: "That request is too large." }, allowOrigin: allowed, extraHeaders };

  const parsed = readMessages(body);
  if (parsed.error) return { status: 400, body: { error: "bad-input", message: parsed.error }, allowOrigin: allowed, extraHeaders };

  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    return {
      status: 503,
      body: { error: "not-configured", message: "Grok isn't configured on the server yet." },
      allowOrigin: allowed,
      extraHeaders,
    };
  }

  const memory = store ?? buckets;
  const caller = String(ip || "unknown").slice(0, 64);
  if (!takeSlot(memory, `ip:${caller}`, now, WINDOW_MS, MAX_PER_WINDOW) || !takeSlot(memory, "global", now, GLOBAL_WINDOW_MS, MAX_GLOBAL)) {
    return {
      status: 429,
      body: { error: "rate-limited", message: "Too many messages. Try again in a little while." },
      allowOrigin: allowed,
      extraHeaders,
    };
  }

  const scene = mergeScene(DEFAULT_SCENE, sanitizeScene(body.scene));
  let response;
  try {
    response = await fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0.6,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: `Current scene: ${JSON.stringify(scene)}` },
          ...parsed.messages,
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { status: 502, body: { error: "grok-failed", message: "Grok didn't answer. Try again." }, allowOrigin: allowed, extraHeaders };
  }

  if (response.status === 401 || response.status === 403) {
    return { status: 502, body: { error: "grok-auth", message: "Grok rejected the server credential." }, allowOrigin: allowed, extraHeaders };
  }
  if (!response.ok) {
    return { status: 502, body: { error: "grok-failed", message: "Grok didn't answer. Try again." }, allowOrigin: allowed, extraHeaders };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 502, body: { error: "grok-failed", message: "Grok didn't answer. Try again." }, allowOrigin: allowed, extraHeaders };
  }
  const text = messageText(payload?.choices?.[0]?.message);
  let reply = "";
  let patch = {};
  try {
    const parsedJson = JSON.parse(text);
    reply = plainReply(parsedJson?.reply) || plainReply(text);
    patch = sanitizeScene(parsedJson?.scene);
  } catch {
    reply = plainReply(text);
  }
  if (!reply && !Object.keys(patch).length) {
    return { status: 502, body: { error: "grok-failed", message: "Grok didn't answer. Try again." }, allowOrigin: allowed, extraHeaders };
  }
  return { status: 200, body: { reply, scene: patch }, allowOrigin: allowed, extraHeaders };
}
