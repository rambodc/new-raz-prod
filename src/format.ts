const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function cleanLine(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function cleanBlock(value: string): string {
  return value.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function validLine(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && /\S/.test(value);
}

export function validBlock(value: string, max: number, allowEmpty = false): boolean {
  if (allowEmpty && value.length === 0) return true;
  return value.length > 0 && value.length <= max && /\S/.test(value);
}

// Show times are America/Edmonton (Calgary). Keep functions/lib/when.js in step.
export const SHOW_ZONE = "America/Edmonton";

export type ZoneParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function partsMap(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value;
  return map;
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const map = partsMap(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - utcMs;
}

export function zoneParts(date: Date, timeZone = SHOW_ZONE): ZoneParts {
  const map = partsMap(date, timeZone);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday: WEEKDAYS.indexOf(map.weekday),
  };
}

/** UTC instant for a wall-clock time in America/Edmonton. */
export function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone = SHOW_ZONE): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  if (hour < 0 || minute < 0 || year < 2000 || year > 2100) return null;
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = zoneOffsetMs(guess, timeZone);
  let instant = guess - offset;
  const offset2 = zoneOffsetMs(instant, timeZone);
  if (offset2 !== offset) instant = guess - offset2;
  const check = zoneParts(new Date(instant), timeZone);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) return null;
  return new Date(instant);
}

export function formatDay(date: Date): string {
  const wall = zoneParts(date);
  return `${WEEKDAYS[wall.weekday]}, ${MONTHS[wall.month - 1]} ${wall.day}`;
}

export function formatClock(date: Date, minutes: "always" | "if-needed"): string {
  const wall = zoneParts(date);
  const suffix = wall.hour >= 12 ? "PM" : "AM";
  let hours = wall.hour % 12;
  if (hours === 0) hours = 12;
  const showMinutes = minutes === "always" || wall.minute !== 0;
  if (!showMinutes) return `${hours} ${suffix}`;
  return `${hours}:${String(wall.minute).padStart(2, "0")} ${suffix}`;
}

export function formatWhen(date: Date, kind: "card" | "detail"): string {
  return `${formatDay(date)} • ${formatClock(date, kind === "detail" ? "always" : "if-needed")}`;
}

export function dateInputValue(date: Date): string {
  const wall = zoneParts(date);
  return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
}

export function timeInputValue(date: Date): string {
  const wall = zoneParts(date);
  return `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;
}

export function cleanTicketUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.hostname.length === 0) return trimmed;
    return url.href;
  } catch {
    return trimmed;
  }
}

export function validTicketUrl(value: string): boolean {
  if (value.length === 0) return true;
  if (value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.min(Math.round(seconds), 14400);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const minuteText = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const secondText = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${minuteText}:${secondText}`;
  return `${minuteText}:${secondText}`;
}

/** Interprets the form's date and time as America/Edmonton, not the browser zone. */
export function combineLocal(date: string, time: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) return null;
  return zonedInstant(Number(match[1]), Number(match[2]), Number(match[3]), Number(clock[1]), Number(clock[2]));
}
