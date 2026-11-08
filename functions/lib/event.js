/** Browser-held demo event. Sample people are fictional labels, not contacts. */

export const STYLES = ["calm", "editorial", "soft"];
export const GUEST_STATUSES = ["invited", "yes", "no", "maybe"];

/**
 * @typedef {"calm" | "editorial" | "soft"} StylePreset
 * @typedef {"invited" | "yes" | "no" | "maybe"} GuestStatus
 * @typedef {{ id: string, name: string, group: string, status: GuestStatus }} GuestRecord
 * @typedef {{ title: string, description: string, date: string, time: string, timeZone: string, venue: string, artistName: string, style: StylePreset, guests: GuestRecord[] }} EventRecord
 * @typedef {{ title?: string, description?: string, date?: string, time?: string, timeZone?: string, venue?: string, artistName?: string, style?: StylePreset }} EventPatch
 */

export const SAMPLE_GUESTS = [
  { id: "sample-ada", name: "Sample Ada", group: "Friends", status: "yes" },
  { id: "sample-leo", name: "Sample Leo", group: "Friends", status: "maybe" },
  { id: "sample-mina", name: "Sample Mina", group: "Work", status: "invited" },
];

/** @type {EventRecord} */
export const EMPTY_EVENT = {
  title: "Friday night",
  description: "A demo night for trying this page. Not a real booking.",
  date: "",
  time: "",
  timeZone: "",
  venue: "",
  artistName: "",
  style: "calm",
  guests: SAMPLE_GUESTS.map((guest) => ({ ...guest })),
};

const LIMITS = { title: 80, description: 280, venue: 80, artistName: 40, timeZone: 40, name: 40, group: 24 };

function plain(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function clock(value) {
  const text = plain(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function day(value) {
  const text = plain(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, date] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) return "";
  return text;
}

export function validDate(value) {
  return day(value);
}

export function validTime(value) {
  return clock(value);
}

/** @param {unknown} input @returns {EventPatch} */
export function sanitizeEventPatch(input) {
  const patch = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return patch;
  for (const key of ["title", "description", "venue", "artistName", "timeZone"]) {
    if (input[key] === undefined) continue;
    const text = plain(input[key], LIMITS[key]);
    if (text) patch[key] = text;
  }
  if (input.date !== undefined) {
    const text = day(input.date);
    if (text) patch.date = text;
  }
  if (input.time !== undefined) {
    const text = clock(input.time);
    if (text) patch.time = text;
  }
  if (STYLES.includes(input.style)) patch.style = input.style;
  return patch;
}

export function sanitizeGuestOps(input) {
  const ops = { add: [], set: [] };
  if (!input || typeof input !== "object") return ops;
  const add = Array.isArray(input.add) ? input.add : [];
  for (const item of add) {
    if (!item || typeof item !== "object") continue;
    const name = plain(item.name, LIMITS.name);
    if (!name) continue;
    const group = plain(item.group, LIMITS.group) || "General";
    const status = GUEST_STATUSES.includes(item.status) ? item.status : "invited";
    ops.add.push({ name, group, status });
    if (ops.add.length === 8) break;
  }
  const set = Array.isArray(input.set) ? input.set : [];
  for (const item of set) {
    if (!item || typeof item !== "object") continue;
    const name = plain(item.name, LIMITS.name);
    if (!name) continue;
    const next = { name };
    if (item.group !== undefined) next.group = plain(item.group, LIMITS.group) || "General";
    if (GUEST_STATUSES.includes(item.status)) next.status = item.status;
    if (next.group || next.status) ops.set.push(next);
    if (ops.set.length === 8) break;
  }
  return ops;
}

/** @param {EventRecord} event @param {unknown} patch @returns {EventRecord} */
export function applyEventPatch(event, patch) {
  return { ...event, guests: event.guests.map((guest) => ({ ...guest })), ...sanitizeEventPatch(patch) };
}

/** @param {unknown} input @returns {EventRecord} */
export function restoreEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...EMPTY_EVENT, guests: EMPTY_EVENT.guests.map((guest) => ({ ...guest })) };
  }
  const patched = applyEventPatch({ ...EMPTY_EVENT, guests: [] }, input);
  const source = Array.isArray(input.guests) ? input.guests : EMPTY_EVENT.guests;
  return applyGuestOps(
    { ...patched, guests: [] },
    { add: source.map((guest) => ({ name: guest?.name, group: guest?.group, status: guest?.status })) },
  );
}

/** @param {unknown} raw @returns {{ event?: EventPatch, guests?: { add: { name: string, group: string, status: GuestStatus }[], set: { name: string, group?: string, status?: GuestStatus }[] } } | null} */
export function proposalFromText(raw) {
  const text = plain(String(raw ?? ""), 240);
  const rules = [
    [/^(?:set|change|update) the title to (.+)$/i, "title"],
    [/^(?:set|change|update) the description to (.+)$/i, "description"],
    [/^(?:set|change|update) the venue to (.+)$/i, "venue"],
    [/^(?:set|change|update) the artist to (.+)$/i, "artistName"],
    [/^(?:set|change|update) the time zone to (.+)$/i, "timeZone"],
    [/^(?:set|change|update) the date to (\d{4}-\d{2}-\d{2})$/i, "date"],
    [/^(?:set|change|update) the time to (\d{2}:\d{2})$/i, "time"],
  ];
  for (const [pattern, key] of rules) {
    const match = text.match(pattern);
    if (!match) continue;
    const event = sanitizeEventPatch({ [key]: match[1] });
    return event[key] ? { event } : null;
  }
  const style = text.match(/^(?:use|set) the (calm|editorial|soft) look$/i);
  if (style) return { event: { style: style[1].toLowerCase() } };
  const addition = text.match(/^add sample guest (.+?) to ([A-Za-z][A-Za-z ]{0,22}) as (invited|yes|no|maybe)$/i);
  if (addition) return { guests: { add: [{ name: addition[1], group: addition[2].trim(), status: addition[3].toLowerCase() }] } };
  const change = text.match(/^set (.+?) to (invited|yes|no|maybe)$/i);
  if (change) return { guests: { set: [{ name: change[1], status: change[2].toLowerCase() }] } };
  return null;
}

/** @param {EventRecord} event @param {unknown} ops @returns {EventRecord} */
export function applyGuestOps(event, ops) {
  const clean = sanitizeGuestOps(ops);
  const guests = event.guests.map((guest) => ({ ...guest }));
  for (const change of clean.set) {
    const found = guests.find((guest) => guest.name.toLowerCase() === change.name.toLowerCase());
    if (!found) continue;
    if (change.group) found.group = change.group;
    if (change.status) found.status = change.status;
  }
  let serial = guests.length + 1;
  for (const addition of clean.add) {
    if (guests.some((guest) => guest.name.toLowerCase() === addition.name.toLowerCase())) continue;
    guests.push({ id: `guest-${serial}`, name: addition.name, group: addition.group, status: addition.status });
    serial += 1;
  }
  return { ...event, guests };
}

export function matchingGuests(event, { status, group } = {}) {
  return event.guests.filter((guest) => {
    if (status && guest.status !== status) return false;
    if (group && guest.group.toLowerCase() !== group.toLowerCase()) return false;
    return true;
  });
}

export function whenLine(event) {
  const bits = [event.date, event.time, event.timeZone].filter(Boolean);
  return bits.length ? bits.join(" · ") : "";
}

export function invitationPreview(event) {
  const when = whenLine(event);
  const lines = [
    event.title || "Untitled demo event",
    event.artistName ? `With ${event.artistName}` : "",
    when,
    event.venue ? event.venue : "Venue not set",
    event.description || "",
    "NOT SENT. This is only a preview in this browser.",
  ].filter(Boolean);
  return lines.join("\n");
}

const STATUS_WORDS = [
  ["yes", "yes"],
  ["coming", "yes"],
  ["no", "no"],
  ["declined", "no"],
  ["maybe", "maybe"],
  ["invited", "invited"],
];

function word(text, value) {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function wantsGuests(text) {
  return /guest|rsvp|coming|invited|invite|group|\bwho\b|how many|\bcount\b|\bnumber\b/.test(text);
}

export function answerGuestQuestion(event, raw) {
  const text = raw.toLowerCase();
  if (/\b(phone|email|e-mail|address|password)\b/.test(text)) {
    return "I don't have phone numbers, email, or other private contact details. This list is sample names only.";
  }
  if (/invitation|invite preview/.test(text)) {
    return `Invitation preview, not sent:\n${invitationPreview(event)}`;
  }
  if (!wantsGuests(text)) return null;
  const status = STATUS_WORDS.find(([value]) => word(text, value))?.[1];
  const group = [...new Set(event.guests.map((guest) => guest.group))].find((name) => word(text, name));
  const matched = matchingGuests(event, { status, group });
  const names = matched.map((guest) => guest.name);
  if (/how many|count|number/.test(text)) {
    const scope = [status, group].filter(Boolean).join(" in ") || "on the list";
    const who = names.length ? `${names.join(", ")}.` : "No matching sample guests.";
    return `${matched.length} ${scope}. ${who} These are sample names in this browser, not real people.`;
  }
  if (/^who|who is|who said|who's/.test(text) || text.includes("who ")) {
    return names.length ? `${names.join(", ")}. Sample guests only.` : "No sample guests match that. I didn't add anyone.";
  }
  const lines = GUEST_STATUSES.map((key) => `${key}: ${matchingGuests(event, { status: key }).length}`);
  const named = event.guests.map((guest) => `${guest.name} (${guest.group}, ${guest.status})`).join("; ");
  return `Sample guest list in this browser. ${lines.join(", ")}. ${named}. I only count people on this list.`;
}
