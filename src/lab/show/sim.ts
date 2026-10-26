/**
 * The simulated night behind the venue screen and the rep phone. Everything is a pure function of time or
 * of a couple of numbers, so it is easy to test. All people, handles and numbers are made up.
 */

export type SceneId = "brush" | "skyline" | "wall" | "closing";

export const SCENES: { id: SceneId; name: string; short: string }[] = [
  { id: "brush", name: "Room as brush", short: "Brush" },
  { id: "skyline", name: "Skyline", short: "Skyline" },
  { id: "wall", name: "Founding fans", short: "Fan wall" },
  { id: "closing", name: "Closing", short: "Closing" },
];

export const SCENE_IDS: SceneId[] = SCENES.map((s) => s.id);

/** A fake room that holds 600 people. */
export const CAPACITY = 600;
/** One whole simulated night takes this many real seconds at 1x. */
export const NIGHT_SECONDS = 150;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How full the room is (0 to 1) at point p of the night (0 to 1). Check-ins only go up. */
export function crowdAt(p: number): number {
  return clamp01(0.82 * smooth(0, 0.4, p) + 0.18 * smooth(0.35, 0.72, p));
}

/** How heavy the room feels (0 light, 1 heavy) at point p of the night. */
export function moodAt(p: number): number {
  return clamp01(0.22 + 0.5 * smooth(0.12, 0.55, p) + 0.2 * smooth(0.5, 0.7, p) - 0.55 * smooth(0.82, 1, p) + 0.04 * Math.sin(p * 38));
}

/** Which scene the auto-play night shows at point p. */
export function sceneAt(p: number): SceneId {
  if (p < 0.28) return "brush";
  if (p < 0.55) return "skyline";
  if (p < 0.8) return "wall";
  return "closing";
}

export type Levels = { crowd: number; mood: number; count: number };

/** The numbers the screen actually uses: the simulated night, unless a slider has taken over. */
export function levels(p: number, crowdOverride: number | null, moodOverride: number | null): Levels {
  const crowd = clamp01(crowdOverride ?? crowdAt(p));
  const mood = clamp01(moodOverride ?? moodAt(p));
  return { crowd, mood, count: Math.round(crowd * CAPACITY) };
}

/* ----- Skyline areas ----- */

export const ZONES = [
  { id: "nw", name: "NW suburbs", share: 0.07, delay: 0.18 },
  { id: "kensington", name: "Kensington", share: 0.13, delay: 0.08 },
  { id: "marda", name: "Marda Loop", share: 0.09, delay: 0.14 },
  { id: "mission", name: "Mission", share: 0.06, delay: 0.2 },
  { id: "beltline", name: "Beltline", share: 0.24, delay: 0 },
  { id: "village", name: "East Village", share: 0.08, delay: 0.06 },
  { id: "bridgeland", name: "Bridgeland", share: 0.11, delay: 0.1 },
  { id: "inglewood", name: "Inglewood", share: 0.17, delay: 0.02 },
  { id: "airdrie", name: "Airdrie", share: 0.05, delay: 0.28 },
] as const;

/** How lit an area is (0 to 1) for a given crowd size. Bigger areas light first and brightest. */
export function zoneLevel(zone: { share: number; delay: number }, crowd: number): number {
  return clamp01((crowd - zone.delay) / 0.75) * (0.5 + (0.5 * zone.share) / 0.24);
}

/* ----- Founding fans (all invented handles) ----- */

const ADJ = ["neon", "soft", "slow", "bright", "night", "velvet", "quiet", "amber", "lunar", "cedar", "static", "paper"];
const NOUN = ["fern", "echo", "comet", "moth", "harbour", "ember", "drift", "petal", "signal", "otter", "pine", "lark"];

export const FOUNDING_TOTAL = 48;

export function handle(i: number): string {
  return `@${ADJ[i % ADJ.length]}.${NOUN[(Math.floor(i / ADJ.length) + i) % NOUN.length]}`;
}

/** How many founding fans are on the wall for a given check-in count. */
export function foundingCount(count: number): number {
  return Math.min(FOUNDING_TOTAL, Math.floor(count / 10));
}

/* ----- Ask the room ----- */

export type Question = { id: string; text: string; a: string; b: string };

export const QUESTIONS: Question[] = [
  { id: "q1", text: "Heavier or smoother?", a: "Heavier", b: "Smoother" },
  { id: "q2", text: "Brighter or darker?", a: "Brighter", b: "Darker" },
  { id: "q3", text: "Faster or slower?", a: "Faster", b: "Slower" },
];

export function questionById(id: string | null | undefined): Question | null {
  return QUESTIONS.find((q) => q.id === id) ?? null;
}

function shareA(id: string, mood: number): number {
  if (id === "q2") return clamp01(0.72 - 0.45 * mood);
  if (id === "q3") return clamp01(0.3 + 0.4 * mood);
  return clamp01(0.3 + 0.45 * mood);
}

/** Made-up answers that trickle in after a question is asked. Returns [first option, second option]. */
export function questionResults(id: string, count: number, mood: number, elapsedMs: number): [number, number] {
  const answered = Math.round(count * 0.7 * (1 - Math.exp(-Math.max(0, elapsedMs) / 6000)));
  const a = Math.round(answered * shareA(id, mood));
  return [a, answered - a];
}

/* ----- Rep suggestions (hard-coded demo text, no model) ----- */

export type Suggestion = { id: string; text: string; scene?: SceneId; question?: string };

export const SUGGESTIONS: Suggestion[] = [
  { id: "g1", text: "Show the skyline", scene: "skyline" },
  { id: "g2", text: "Ask: brighter or darker?", question: "q2" },
  { id: "g3", text: "Show the fan wall", scene: "wall" },
];
