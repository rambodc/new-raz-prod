import { sanitizeEventPatch, sanitizeGuestOps, STYLES, validDate, validTime } from "./event.js";
import { sanitizeScene } from "./sceneSchema.js";

/** Non-secret session fields. Passwords and account data are not accepted. */
export const DRAFT_FIELDS = {
  artistName: { label: "Artist name", max: 40 },
  eventTitle: { label: "Event title", max: 80 },
  description: { label: "Description", max: 280 },
  date: { label: "Date", max: 10 },
  time: { label: "Time", max: 5 },
  timeZone: { label: "Time zone", max: 40 },
  venue: { label: "Venue", max: 80 },
  vibe: { label: "Vibe", max: 48 },
  details: { label: "Details", max: 200 },
};

export const GUEST_FIELDS = {
  guestName: { label: "Guest name", max: 40 },
  guestGroup: { label: "Group", max: 24 },
  guestStatus: { label: "Status", max: 8 },
};

const ID = /^[a-zA-Z0-9_-]{1,40}$/;

function plain(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeDraft(input) {
  const draft = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return draft;
  for (const key of Object.keys(DRAFT_FIELDS)) {
    const text = plain(input[key], DRAFT_FIELDS[key].max);
    if (text) draft[key] = text;
  }
  return draft;
}

/** @param {unknown} input */
export function sanitizeCard(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = /** @type {Record<string, unknown>} */ (input);
  const type = source.type;
  if (type !== "choice" && type !== "form" && type !== "approval") return null;
  const id = plain(String(source.id ?? ""), 40);
  if (!ID.test(id)) return null;
  const prompt = plain(source.prompt, 180);
  if (!prompt) return null;

  if (type === "choice") {
    const options = [];
    const list = Array.isArray(source.options) ? source.options : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const option = /** @type {Record<string, unknown>} */ (item);
      const optionId = plain(String(option.id ?? ""), 40);
      const label = plain(option.label, 48);
      if (!ID.test(optionId) || !label) continue;
      if (options.some((existing) => existing.id === optionId)) continue;
      options.push({ id: optionId, label });
      if (options.length === 5) break;
    }
    if (options.length < 2) return null;
    return { type, id, prompt, options };
  }

  if (type === "form") {
    const fields = [];
    const list = Array.isArray(source.fields) ? source.fields : [];
    for (const key of list) {
      if (typeof key !== "string" || fields.includes(key)) continue;
      if (!Object.hasOwn(DRAFT_FIELDS, key) && !Object.hasOwn(GUEST_FIELDS, key)) continue;
      fields.push(key);
    }
    if (!fields.length) return null;
    return { type, id, prompt, fields };
  }

  const proposal = source.proposal && typeof source.proposal === "object" ? /** @type {Record<string, unknown>} */ (source.proposal) : {};
  const scene = sanitizeScene(proposal.scene);
  const draft = sanitizeDraft(proposal.draft);
  const event = sanitizeEventPatch(proposal.event);
  if (STYLES.includes(proposal.style)) event.style = proposal.style;
  const guests = sanitizeGuestOps(proposal.guests);
  const hasGuests = guests.add.length + guests.set.length > 0;
  if (!Object.keys(scene).length && !Object.keys(draft).length && !Object.keys(event).length && !hasGuests) return null;
  return { type, id, prompt, proposal: { scene, draft, event, guests } };
}

export function validateDraftInput(fields, values) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, string>} */
  const clean = {};
  for (const key of fields) {
    const spec = DRAFT_FIELDS[key] || GUEST_FIELDS[key];
    if (!spec) continue;
    const text = plain(values?.[key], spec.max);
    const required = key === "artistName" || key === "guestName";
    if (!text && required) errors[key] = "Add this before continuing.";
    else if (key === "guestStatus" && text && !["invited", "yes", "no", "maybe"].includes(text.toLowerCase())) errors[key] = "Use invited, yes, no, or maybe.";
    else if (key === "date" && text && !validDate(text)) errors[key] = "Use a real date as YYYY-MM-DD.";
    else if (key === "time" && text && !validTime(text)) errors[key] = "Use 24-hour time as HH:MM.";
    else if (text) clean[key] = key === "guestStatus" ? text.toLowerCase() : text;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}
