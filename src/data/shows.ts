import type { Show } from "./types";

/** Matches the server: a show is open for check-in from 15 minutes before it starts to 15 minutes after it ends. */
export const GRACE_MS = 15 * 60 * 1000;

export function isLiveNow(show: Pick<Show, "startsAt" | "endsAt">, now: Date): boolean {
  return now.getTime() >= show.startsAt.getTime() - GRACE_MS && now.getTime() <= show.endsAt.getTime() + GRACE_MS;
}

export function endOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Shows that are on now or start later today. */
export function isTonight(show: Pick<Show, "startsAt" | "endsAt">, now: Date): boolean {
  return show.endsAt.getTime() + GRACE_MS >= now.getTime() && (isLiveNow(show, now) || show.startsAt.getTime() <= endOfDay(now).getTime());
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

/** "Live now", or "8:00 pm" for a show that has not started. */
export function whenLabel(show: Pick<Show, "startsAt" | "endsAt">, now: Date): string {
  return now.getTime() >= show.startsAt.getTime() ? `Live · until ${formatTime(show.endsAt)}` : `Starts ${formatTime(show.startsAt)}`;
}

export function lineup(show: Pick<Show, "artistNames">): string {
  return show.artistNames.join(" · ");
}

/** A short, stable id for an artist name: "The Weeknd!" becomes "the-weeknd". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug) return slug;
  // Names with no letters or digits we can use (for example other alphabets) still get a stable id.
  let h = 5381;
  for (const ch of name.trim().toLowerCase()) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return `artist-${h.toString(36)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Turns a date and two times (all in the admin's own time zone) into start and end. An end before the start means after midnight. */
export function buildTimes(date: string, start: string, end: string): { startsAt: Date; endsAt: Date } | null {
  const s = new Date(`${date}T${start}`);
  let e = new Date(`${date}T${end}`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() <= s.getTime()) e = new Date(e.getTime() + 24 * 3600_000);
  return { startsAt: s, endsAt: e };
}

/** Cleans a typed lineup: trims, drops blanks and repeats (same name, any case). */
export function cleanLineup(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
