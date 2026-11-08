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

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_NAME = "january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec";

function isoDate(year, month, date) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(date)) return "";
  return day(`${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`);
}

function upcomingDate(month, date, today) {
  const [year, todayMonth, todayDate] = today.split("-").map(Number);
  for (let add = 0; add < 8; add += 1) {
    const nextYear = year + add;
    const text = isoDate(nextYear, month, date);
    if (!text) continue;
    if (nextYear > year || month > todayMonth || (month === todayMonth && date >= todayDate)) return text;
  }
  return "";
}

function ianaZone(zone) {
  if (typeof zone !== "string") return "";
  const text = zone.trim();
  if (!text || text.length > 64 || /[^A-Za-z0-9_+\-/]/.test(text)) return "";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: text }).format(0);
    return text;
  } catch {
    return "";
  }
}

/** Event zone wins. Otherwise a zone named in the message. Otherwise UTC. */
export function zoneForEvent(eventZone, message) {
  const onEvent = ianaZone(eventZone);
  if (onEvent) return onEvent;
  const named = String(message || "").match(/\b([A-Za-z]{2,}(?:\/[A-Za-z_]{2,})+|UTC|GMT)\b/);
  if (named) return ianaZone(named[1] === "GMT" ? "UTC" : named[1]) || "UTC";
  return "UTC";
}

/** Calendar day for a server timestamp in an IANA zone. */
export function calendarToday(nowMs, timeZone) {
  const when = new Date(nowMs);
  if (Number.isNaN(when.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneForEvent(timeZone, ""),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(when);
  const read = (type) => parts.find((part) => part.type === type)?.value || "";
  return day(`${read("year")}-${read("month")}-${read("day")}`);
}

/**
 * A date the person actually named.
 * A written year is kept, including a past year. A month and day with no year becomes the next day on or after today.
 * @returns {{ mentioned: boolean, date: string, invalid: boolean, ambiguous: boolean }}
 */
export function resolveMentionedDate(raw, today) {
  const text = plain(String(raw ?? ""), 500).toLowerCase();
  const none = { mentioned: false, date: "", invalid: false, ambiguous: false };
  if (!day(today)) return none;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { mentioned: true, date, invalid: false, ambiguous: false } : { mentioned: true, date: "", invalid: true, ambiguous: false };
  }
  const monthFirst = text.match(new RegExp(`(?:^|[^a-z])(${MONTH_NAME})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?(?!\\d)`, "i"));
  const dayFirst = text.match(new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAME})(?:\\s*,?\\s*(\\d{4}))?(?!\\d)`, "i"));
  const named = monthFirst || dayFirst;
  if (named) {
    const month = MONTHS[monthFirst ? named[1] : named[2]];
    const dateNumber = Number(monthFirst ? named[2] : named[1]);
    const year = named[3] ? Number(named[3]) : 0;
    if (!month) return none;
    if (year) {
      const date = isoDate(year, month, dateNumber);
      return date ? { mentioned: true, date, invalid: false, ambiguous: false } : { mentioned: true, date: "", invalid: true, ambiguous: false };
    }
    const date = upcomingDate(month, dateNumber, today);
    return date ? { mentioned: true, date, invalid: false, ambiguous: false } : { mentioned: true, date: "", invalid: true, ambiguous: false };
  }
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (first <= 12 && second <= 12) return { mentioned: true, date: "", invalid: false, ambiguous: true };
    const month = first > 12 ? second : first;
    const dateNumber = first > 12 ? first : second;
    if (month > 12 || dateNumber > 31) return { mentioned: true, date: "", invalid: true, ambiguous: false };
    const date = isoDate(year, month, dateNumber);
    return date ? { mentioned: true, date, invalid: false, ambiguous: false } : { mentioned: true, date: "", invalid: true, ambiguous: false };
  }
  return none;
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

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "jr", "sr", "mt", "ft"]);

/** Keep a quoted value whole. Otherwise drop a trailing approval instruction, not a comma inside a real name. */
export function cleanCommandValue(raw) {
  const text = plain(String(raw ?? ""), 240);
  const quoted = text.match(/^["“]([\s\S]+)["”]\s*[.!?]?$/);
  if (quoted) return quoted[1].trim();
  if (/\s+or\s+/i.test(text) || text.includes("?")) return "";
  let value = text
    .replace(/,\s*(?:but\b|and then\b|and let\b|and please\b|please\b|let me\b|so (?:i|you|that)\b)[\s\S]*$/i, "")
    .replace(/\s+but\s+let\s+me\b[\s\S]*$/i, "")
    .trim();
  const ending = value.match(/^(.*\S)([.!?])$/);
  if (ending) {
    const word = ending[1].match(/([A-Za-z]+)$/);
    if (!word || !ABBREVIATIONS.has(word[1].toLowerCase())) value = ending[1];
  }
  return value.trim();
}

const FIELD_LABEL = String.raw`(?:please\s+)?(?:set\s+|change\s+|update\s+)?(?:the\s+)?(title|venue|description|artist(?:\s+name)?)(?:\s+(?:to|as|is)\s+|\s*:\s*|\s+)`;
const FIELD_START = new RegExp(String.raw`(?:^|[,;]\s*|\band\s+)${FIELD_LABEL}`, "gi");

function withoutWhen(value) {
  return value
    .replace(/,\s*(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\d*.*$/i, "")
    .replace(/\s+\bon\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d).*$/i, "")
    .replace(/,?\s+\bat\s+\d{1,2}:\d{2}.*$/i, "")
    .replace(/[,;\s]+(?:and)?\s*$/i, "")
    .trim();
}

/** Title, venue, description, or artist written as labels in one sentence. */
export function labeledEventFields(raw) {
  const text = plain(String(raw ?? ""), 500);
  const marks = [];
  for (const match of text.matchAll(FIELD_START)) {
    const word = match[1].toLowerCase().startsWith("artist") ? "artistName" : match[1].toLowerCase();
    marks.push({ key: word, at: match.index, from: match.index + match[0].length });
  }
  /** @type {Record<string, string>} */
  const fields = {};
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].at : text.length;
    const chunk = text.slice(mark.from, end).replace(/[,;\s]+(?:and)?\s*$/i, "");
    const value = cleanCommandValue(mark.key === "description" ? chunk : withoutWhen(chunk));
    if (value && !fields[mark.key]) fields[mark.key] = value;
  });
  return fields;
}

/**
 * Fields a person actually named in one sentence, for merging onto a proposal.
 * A date-only sentence does not invent a title or venue.
 * @returns {{ patch: EventPatch, mentioned: { mentioned: boolean, date: string, invalid: boolean, ambiguous: boolean } }}
 */
export function fieldsFromAsk(raw, today) {
  const text = plain(String(raw ?? ""), 500);
  const mentioned = resolveMentionedDate(text, today);
  /** @type {EventPatch} */
  const patch = { ...labeledEventFields(text) };
  if (mentioned.date) patch.date = mentioned.date;
  const time = text.match(/(?<!\d-)(?:\bat\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (time) patch.time = `${time[1].padStart(2, "0")}:${time[2]}`;
  if (!patch.title && !patch.venue) {
    const body = text.replace(/^(?:please\s+)?(?:(?:can|could|would)\s+(?:we|you)\s+)?(?:do|make|set(?:\s+up)?|put|plan)\s+/i, "");
    const compound = body.match(/^(.+?)\s+at\s+(.+?)\s+on\s+\S/i);
    if (compound) {
      const title = plain(compound[1], 80);
      const venue = plain(compound[2], 80);
      const clockOnly = /^\d{1,2}:\d{2}$/;
      const aside = /\b(?:but|please|let me)\b/i;
      if (title && !clockOnly.test(title) && !aside.test(title)) patch.title = title;
      if (venue && !clockOnly.test(venue) && !aside.test(venue)) patch.venue = venue;
    }
  }
  return { patch: sanitizeEventPatch(patch), mentioned };
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
    const value = key === "date" || key === "time" ? match[1] : cleanCommandValue(match[1]);
    if (!value) return null;
    if (key !== "description" && /\b(?:title|venue|description|artist)\b/i.test(value)) continue;
    const event = sanitizeEventPatch({ [key]: value });
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
