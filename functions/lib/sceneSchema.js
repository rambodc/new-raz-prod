/** Allowlisted scene changes. Unknown fields are dropped. Keep the homepage copy of these limits in sync. */

export const DEFAULT_SCENE = {
  colors: { base: "#c4496a", glow: "#ff8b62", deep: "#2a0c2e" },
  light: { warmth: 0.72, intensity: 0.82 },
  shapes: { count: 5, softness: 0.72, drift: 0.4 },
  name: "",
  line: "",
  portrait: { x: 0, y: 0, scale: 1 },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function clamp(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function plain(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

/** @param {unknown} input */
export function sanitizeScene(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = /** @type {Record<string, unknown>} */ (input);
  /** @type {Record<string, unknown>} */
  const scene = {};

  if (source.colors && typeof source.colors === "object" && !Array.isArray(source.colors)) {
    const colors = /** @type {Record<string, unknown>} */ (source.colors);
    /** @type {Record<string, string>} */
    const next = {};
    for (const key of ["base", "glow", "deep"]) {
      const value = colors[key];
      if (typeof value === "string" && HEX.test(value)) next[key] = value.toLowerCase();
    }
    if (Object.keys(next).length) scene.colors = next;
  }

  if (source.light && typeof source.light === "object" && !Array.isArray(source.light)) {
    const light = /** @type {Record<string, unknown>} */ (source.light);
    /** @type {Record<string, number>} */
    const next = {};
    const warmth = clamp(/** @type {number} */ (light.warmth), 0, 1);
    const intensity = clamp(/** @type {number} */ (light.intensity), 0, 1);
    if (warmth !== null) next.warmth = round(warmth);
    if (intensity !== null) next.intensity = round(intensity);
    if (Object.keys(next).length) scene.light = next;
  }

  if (source.shapes && typeof source.shapes === "object" && !Array.isArray(source.shapes)) {
    const shapes = /** @type {Record<string, unknown>} */ (source.shapes);
    /** @type {Record<string, number>} */
    const next = {};
    const count = clamp(/** @type {number} */ (shapes.count), 3, 7);
    const softness = clamp(/** @type {number} */ (shapes.softness), 0, 1);
    const drift = clamp(/** @type {number} */ (shapes.drift), 0, 1);
    if (count !== null) next.count = Math.round(count);
    if (softness !== null) next.softness = round(softness);
    if (drift !== null) next.drift = round(drift);
    if (Object.keys(next).length) scene.shapes = next;
  }

  const name = plain(source.name, 32);
  const line = plain(source.line, 90);
  if (name) scene.name = name;
  if (line) scene.line = line;

  if (source.portrait && typeof source.portrait === "object" && !Array.isArray(source.portrait)) {
    const portrait = /** @type {Record<string, unknown>} */ (source.portrait);
    /** @type {Record<string, number>} */
    const next = {};
    const x = clamp(/** @type {number} */ (portrait.x), -1, 1);
    const y = clamp(/** @type {number} */ (portrait.y), -1, 1);
    const scale = clamp(/** @type {number} */ (portrait.scale), 0.55, 1.35);
    if (x !== null) next.x = round(x);
    if (y !== null) next.y = round(y);
    if (scale !== null) next.scale = round(scale);
    if (Object.keys(next).length) scene.portrait = next;
  }

  return scene;
}

/** @param {typeof DEFAULT_SCENE} current @param {Record<string, unknown>} patch */
export function mergeScene(current, patch) {
  return {
    ...current,
    ...patch,
    colors: { ...current.colors, ...(patch.colors ?? {}) },
    light: { ...current.light, ...(patch.light ?? {}) },
    shapes: { ...current.shapes, ...(patch.shapes ?? {}) },
    portrait: { ...current.portrait, ...(patch.portrait ?? {}) },
  };
}
