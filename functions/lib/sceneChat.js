import { sanitizeCard, sanitizeDraft } from "./cards.js";
import { calendarToday, fieldsFromAsk, sanitizeEventPatch, zoneForEvent } from "./event.js";
import { DEFAULT_SCENE, mergeScene, sanitizeScene } from "./sceneSchema.js";
import { handleWebSearch, publicQuery, SEARCH_LIMITS } from "./webSearch.js";

/** Caps for one Cloud Function instance. A second instance has its own counters. */
export const LIMITS = {
  perIp: 1000,
  perIpWindowMs: 10 * 60 * 1000,
  global: 10_000,
  globalWindowMs: 60 * 60 * 1000,
  maxOutputTokens: 700,
  maxMessages: 16,
  maxMessageChars: 500,
  maxRawBytes: 24_000,
};
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
  "You help edit one Razzberry demo event page in the browser: title, description, date, time, time zone, venue, artist, and look.",
  "A sample guest list is counted in the browser. Use only the guest facts you are given. Never invent a guest, count, venue, time zone, phone number, or email.",
  "The photograph is never sent to you. Never ask for passwords, payment, or sign-in. Never say an invitation was sent, a booking exists, or anything was published.",
  "Respond with one JSON object: {\"reply\":\"plain text\",\"scene\":{},\"card\":null}.",
  "reply is one or two short sentences, no HTML and no CSS.",
  "Prefer a card. choice: {\"type\":\"choice\",\"id\":\"short-id\",\"prompt\":\"...\",\"options\":[{\"id\":\"a\",\"label\":\"...\"}]} with 2 to 5 options.",
  "form fields may only be artistName, eventTitle, description, date, time, timeZone, venue, vibe, details, guestName, guestGroup, guestStatus.",
  "approval: {\"type\":\"approval\",\"id\":\"short-id\",\"prompt\":\"...\",\"proposal\":{\"event\":{...},\"guests\":{\"add\":[],\"set\":[]},\"scene\":{},\"draft\":{...}}}.",
  "proposal.event may include title, description, date as YYYY-MM-DD, time as HH:MM, timeZone, venue, artistName, and style one of calm, editorial, soft.",
  "proposal.guests.add items are {name, group, status}. proposal.guests.set changes a name already on the list. status is invited, yes, no, or maybe.",
  "Put event, look, and guest changes in an approval. Leave scene empty when you send an approval.",
  "Never say a change was updated, applied, or saved. The person accepts the proposal before the page changes.",
  "For a month and day with no year, use the next date on or after the server's today. If the person writes a year, keep that year, including a past year.",
  "scene keys, only if there is no approval: colors.base, colors.glow, colors.deep as #rrggbb; light.warmth and light.intensity 0 to 1;",
  "shapes.count 3 to 7, shapes.softness and shapes.drift 0 to 1; name, line; portrait.x, portrait.y -1 to 1, portrait.scale 0.55 to 1.35.",
  "The person can answer a choice by tapping or by typing.",
].join(" ");

export const buckets = new Map();

export function allowOrigin(origin) {
  if (ORIGINS.has(origin)) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return origin;
  } catch {
    return null;
  }
  return null;
}

export function takeSlot(store, key, now, windowMs, max) {
  const recent = (store.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    store.set(key, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  store.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}

function plainReply(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function readMessages(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return { error: "Send a short message." };
  const messages = [];
  for (const item of body.messages.slice(-LIMITS.maxMessages)) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") {
      return { error: "That message could not be read." };
    }
    const content = item.content.replace(/[\u0000-\u0008]/g, "").trim();
    if (!content || content.length > LIMITS.maxMessageChars) return { error: "Keep the message under 500 characters." };
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
export function corsHeaders() {
  return {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function handleSceneChat({ method, origin, ip, body, rawLength, now, store, apiKey, model, searchModel, fetchImpl }) {
  const allowed = allowOrigin(origin || "");
  const extraHeaders = corsHeaders();
  if (method === "OPTIONS") {
    if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use chat." }, allowOrigin: null, extraHeaders };
    return { status: 204, body: null, allowOrigin: allowed, extraHeaders };
  }
  if (!allowed) return { status: 403, body: { error: "origin", message: "This origin can't use chat." }, allowOrigin: null, extraHeaders };
  if (method !== "POST") return { status: 405, body: { error: "method", message: "Send a message." }, allowOrigin: allowed, extraHeaders };
  if (body && typeof body === "object" && body.mode === "search") {
    if (rawLength > LIMITS.maxRawBytes) return { status: 413, body: { error: "too-large", message: "That request is too large." }, allowOrigin: allowed, extraHeaders };
    return answerSearch({ origin: allowed, ip, body, now, store, apiKey, searchModel, fetchImpl, extraHeaders });
  }
  if (rawLength > LIMITS.maxRawBytes) return { status: 413, body: { error: "too-large", message: "That request is too large." }, allowOrigin: allowed, extraHeaders };

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
  const ipSlot = takeSlot(memory, `ip:${caller}`, now, LIMITS.perIpWindowMs, LIMITS.perIp);
  const globalSlot = ipSlot.ok ? takeSlot(memory, "global", now, LIMITS.globalWindowMs, LIMITS.global) : { ok: true, retryAfterSec: 0 };
  if (!ipSlot.ok || !globalSlot.ok) {
    const browserLimited = !ipSlot.ok;
    const wait = browserLimited ? ipSlot.retryAfterSec : globalSlot.retryAfterSec;
    const minutes = Math.max(1, Math.ceil(wait / 60));
    return {
      status: 429,
      body: {
        error: "rate-limited",
        scope: browserLimited ? "browser" : "instance",
        retryAfterSec: wait,
        message: browserLimited
          ? `This browser can send ${LIMITS.perIp} messages every 10 minutes. The oldest one drops off after that, so try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
          : `This server copy allows ${LIMITS.global} messages an hour for everyone using it. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      allowOrigin: allowed,
      extraHeaders,
    };
  }

  const scene = mergeScene(DEFAULT_SCENE, sanitizeScene(body.scene));
  const draft = sanitizeDraft(body.draft);
  const event = sanitizeEventPatch(body.event);
  const guestFacts = plainReply(body.guestFacts) || "No guest facts were provided.";
  const asked = [...parsed.messages].reverse().find((item) => item.role === "user")?.content || "";
  const zone = zoneForEvent(event.timeZone, asked);
  const today = calendarToday(now, zone);
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
        max_completion_tokens: LIMITS.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: `Today is ${today} in ${zone}, from the server clock. Current scene: ${JSON.stringify(scene)} Current event page, this browser only: ${JSON.stringify(event)} Guest facts counted in the browser: ${guestFacts} Session draft, not saved: ${JSON.stringify(draft)}` },
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
  let card = null;
  try {
    const parsedJson = JSON.parse(text);
    reply = plainReply(parsedJson?.reply) || plainReply(text);
    patch = sanitizeScene(parsedJson?.scene);
    card = sanitizeCard(parsedJson?.card);
  } catch {
    reply = plainReply(text);
  }
  if (!reply && !Object.keys(patch).length && !card) {
    return { status: 502, body: { error: "grok-failed", message: "Grok didn't answer. Try again." }, allowOrigin: allowed, extraHeaders };
  }
  ({ reply, card } = settleReply({ reply, card, patch, asked, today }));
  return { status: 200, body: { reply, scene: patch, card }, allowOrigin: allowed, extraHeaders };
}

function proposalHasWork(card) {
  const proposal = card?.proposal;
  if (!proposal) return false;
  const guests = proposal.guests || { add: [], set: [] };
  return Object.keys(proposal.event || {}).length > 0
    || Object.keys(proposal.scene || {}).length > 0
    || Object.keys(proposal.draft || {}).length > 0
    || guests.add.length + guests.set.length > 0;
}

function claimsDone(reply) {
  const text = reply.toLowerCase();
  if (/\b(haven't|have not|hasn't|has not|didn't|did not|can't|cannot|won't|will not|not updated|not applied)\b/.test(text)) return false;
  return /\b(updated|applied|saved)\b/.test(text) || /\bi(?:'ve| have) (?:set|changed)\b/.test(text);
}

function proposalId(seed) {
  let hash = 0;
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `e${hash.toString(36)}`.slice(0, 40);
}

function acceptLine(event) {
  const bits = [event?.title, event?.venue, event?.date, event?.time].filter(Boolean);
  return bits.length
    ? `Accept to put ${bits.join(", ")} on this page. Nothing changes until you do.`
    : "Accept the proposal to change this page. Nothing changes until you do.";
}

function settleReply({ reply, card, patch, asked, today }) {
  const askedFields = fieldsFromAsk(asked, today);
  const mentioned = askedFields.mentioned;
  if (mentioned.invalid && (card?.type === "choice" || card?.type === "form")) card = null;
  if (card?.type === "approval") {
    const event = { ...card.proposal.event, ...askedFields.patch };
    if (mentioned.invalid || mentioned.ambiguous) delete event.date;
    else if (mentioned.date) event.date = mentioned.date;
    card.proposal.event = event;
    if (mentioned.date) card.prompt = card.prompt.replace(/\d{4}-\d{2}-\d{2}/g, mentioned.date);
    if (!proposalHasWork(card)) card = null;
  } else if (Object.keys(askedFields.patch).length) {
    card = sanitizeCard({
      type: "approval",
      id: proposalId(`${asked}|${JSON.stringify(askedFields.patch)}`),
      prompt: "Apply this to the event page?",
      proposal: { event: askedFields.patch },
    });
  }
  if (mentioned.invalid) {
    reply = Object.keys(askedFields.patch).length
      ? "That date isn't a real calendar day, so it was left off. Accept to apply the other details. Nothing changes until you do."
      : "That isn't a real calendar day. Say the month and day again, and include the year if it is in the past.";
  } else if (mentioned.ambiguous) reply = "Which date do you mean? Use a month name, and include the year if it is in the past.";
  else if (claimsDone(reply) && !(card == null && Object.keys(patch).length > 0)) {
    reply = card?.type === "approval" ? acceptLine(card.proposal.event) : "Nothing was changed. Tell me what to edit and I'll ask you to accept it.";
  }
  return { reply, card };
}

function limited(slot, browser) {
  const wait = slot.retryAfterSec;
  const minutes = Math.max(1, Math.ceil(wait / 60));
  return {
    status: 429,
    body: {
      error: "rate-limited",
      scope: browser ? "browser" : "instance",
      retryAfterSec: wait,
      message: browser
        ? `This browser can send ${LIMITS.perIp} messages every 10 minutes. The oldest one drops off after that, so try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
        : `This server copy allows ${LIMITS.global} messages an hour for everyone using it. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    },
  };
}

async function answerSearch({ origin, ip, body, now, store, apiKey, searchModel, fetchImpl, extraHeaders }) {
  const keys = body && typeof body === "object" ? Object.keys(body) : [];
  if (keys.some((key) => key !== "mode" && key !== "query")) {
    return { status: 400, body: { error: "bad-input", message: "Search only accepts a public query." }, allowOrigin: origin, extraHeaders };
  }
  const prepared = publicQuery(body.query);
  if (prepared.error) return { status: 400, body: { error: "bad-input", message: prepared.error }, allowOrigin: origin, extraHeaders };
  const memory = store ?? buckets;
  const caller = String(ip || "unknown").slice(0, 64);
  const ipSlot = takeSlot(memory, `ip:${caller}`, now, LIMITS.perIpWindowMs, LIMITS.perIp);
  if (!ipSlot.ok) return { ...limited(ipSlot, true), allowOrigin: origin, extraHeaders };
  const globalSlot = takeSlot(memory, "global", now, LIMITS.globalWindowMs, LIMITS.global);
  if (!globalSlot.ok) return { ...limited(globalSlot, false), allowOrigin: origin, extraHeaders };
  const searchIp = takeSlot(memory, `search:${caller}`, now, SEARCH_LIMITS.perIpWindowMs, SEARCH_LIMITS.perIp);
  if (!searchIp.ok) {
    const minutes = Math.max(1, Math.ceil(searchIp.retryAfterSec / 60));
    return {
      status: 429,
      body: {
        error: "rate-limited",
        scope: "search",
        retryAfterSec: searchIp.retryAfterSec,
        message: `This browser can search ${SEARCH_LIMITS.perIp} times every 10 minutes. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      allowOrigin: origin,
      extraHeaders,
    };
  }
  const searchAll = takeSlot(memory, "search-global", now, SEARCH_LIMITS.globalWindowMs, SEARCH_LIMITS.global);
  if (!searchAll.ok) {
    const minutes = Math.max(1, Math.ceil(searchAll.retryAfterSec / 60));
    return {
      status: 429,
      body: {
        error: "rate-limited",
        scope: "search",
        retryAfterSec: searchAll.retryAfterSec,
        message: `This server copy allows ${SEARCH_LIMITS.global} web searches an hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      allowOrigin: origin,
      extraHeaders,
    };
  }
  const result = await handleWebSearch({ query: prepared.query, apiKey, model: searchModel, fetchImpl });
  return { ...result, allowOrigin: origin, extraHeaders };
}
