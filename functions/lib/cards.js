import { sanitizeScene } from "./sceneSchema.js";

/** Non-secret session fields. Passwords and account data are not accepted. */
export const DRAFT_FIELDS = {
  artistName: { label: "Artist name", max: 40 },
  eventTitle: { label: "Event title", max: 80 },
  vibe: { label: "Vibe", max: 48 },
  details: { label: "Details", max: 200 },
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
      if (typeof key !== "string" || !Object.hasOwn(DRAFT_FIELDS, key) || fields.includes(key)) continue;
      fields.push(key);
    }
    if (!fields.length) return null;
    return { type, id, prompt, fields };
  }

  const proposal = source.proposal && typeof source.proposal === "object" ? /** @type {Record<string, unknown>} */ (source.proposal) : {};
  const scene = sanitizeScene(proposal.scene);
  const draft = sanitizeDraft(proposal.draft);
  if (!Object.keys(scene).length && !Object.keys(draft).length) return null;
  return { type, id, prompt, proposal: { scene, draft } };
}

export function validateDraftInput(fields, values) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, string>} */
  const clean = {};
  for (const key of fields) {
    if (!Object.hasOwn(DRAFT_FIELDS, key)) continue;
    const text = plain(values?.[key], DRAFT_FIELDS[key].max);
    const required = key !== "details";
    if (!text && required) errors[key] = "Add this before continuing.";
    else if (text) clean[key] = text;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}
