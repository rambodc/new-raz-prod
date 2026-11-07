export type ThemeId = "raspberry" | "violet" | "aurora";

export type WorldTheme = {
  id: ThemeId;
  name: string;
  /** Deep base of the sculpture. */
  a: string;
  /** Mid silk colour. */
  b: string;
  /** Highlight toward the tips. */
  c: string;
  portal: string;
  fog: string;
  aurora: string;
};

export const THEMES: Record<ThemeId, WorldTheme> = {
  raspberry: {
    id: "raspberry",
    name: "Raspberry",
    a: "#8e1848",
    b: "#e11d63",
    c: "#7c3aed",
    portal: "#ff2f86",
    fog: "#07060c",
    aurora: "#143833",
  },
  violet: {
    id: "violet",
    name: "Violet",
    a: "#3b0764",
    b: "#7c3aed",
    c: "#e879f9",
    portal: "#c084fc",
    fog: "#07060f",
    aurora: "#2a1848",
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    a: "#134e4a",
    b: "#14b8a6",
    c: "#a855f7",
    portal: "#2dd4bf",
    fog: "#05080c",
    aurora: "#14532d",
  },
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type EventCopy = { title: string; when: string };

/** Deterministic theme for a typed line. Same words always stage the same palette. */
export function themeForLine(line: string): WorldTheme {
  const text = line.toLowerCase();
  if (text.includes("violet") || text.includes("purple")) return THEMES.violet;
  if (text.includes("aurora") || text.includes("teal") || text.includes("green")) return THEMES.aurora;
  if (!text.trim() || text.includes("friday") || text.includes("nova") || text.includes("raspberry")) return THEMES.raspberry;
  let hash = 5381;
  for (const ch of text) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return [THEMES.raspberry, THEMES.violet, THEMES.aurora][hash % 3]!;
}

function titleCase(word: string): string {
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}

/** Pulls a weekday and a clock time out of a line. Anything missing stays as the fallback. */
export function eventCopyFromLine(line: string, fallback: EventCopy): EventCopy {
  const lower = line.toLowerCase();
  const day = DAYS.find((name) => lower.includes(name));
  const time = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  let when = fallback.when;
  if (time) {
    const hour = String(Number(time[1]));
    const minutes = time[2];
    const suffix = time[3]!.toUpperCase();
    when = minutes && minutes !== "00" ? `${hour}:${minutes} ${suffix}` : `${hour} ${suffix}`;
  }
  return { title: day ? titleCase(day) : fallback.title, when };
}

export function weekdayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

/** Truthful fan annotation. Unknown numbers are omitted rather than invented. */
export function fanNote(showsWithYou: number | null, fans: number | null): string | null {
  const parts: string[] = [];
  if (showsWithYou !== null) parts.push(showsWithYou === 1 ? "You've been to 1 show" : `You've been to ${showsWithYou} shows`);
  if (fans !== null) parts.push(fans === 1 ? "1 fan" : `${fans} fans`);
  return parts.length ? parts.join(" · ") : null;
}
