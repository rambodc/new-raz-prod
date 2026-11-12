// Wall-clock times for shows are America/Edmonton (Calgary).
// Keep src/format.ts in step with eventEndsAt and the zone math.

export const SHOW_ZONE = "America/Edmonton";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function partsMap(date, timeZone) {
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
  const map = {};
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value;
  return map;
}

/** Milliseconds to add to a UTC timestamp to get the zone's wall clock, at that instant. */
function zoneOffsetMs(utcMs, timeZone) {
  const map = partsMap(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - utcMs;
}

export function zoneParts(date, timeZone = SHOW_ZONE) {
  const map = partsMap(date, timeZone);
  const hour = Number(map.hour) % 24;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    weekday: WEEKDAYS.indexOf(map.weekday),
  };
}

/** UTC instant for a wall-clock time in America/Edmonton. Null when the civil date is impossible. */
export function zonedInstant(year, month, day, hour, minute, timeZone = SHOW_ZONE) {
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

/**
 * An invite lasts through the night. It ends at 8:00 America/Edmonton
 * on the calendar day after the show starts.
 */
export function eventEndsAt(startsAt, timeZone = SHOW_ZONE) {
  const start = asDate(startsAt);
  if (!start) return null;
  const wall = zoneParts(start, timeZone);
  const noon = zonedInstant(wall.year, wall.month, wall.day, 12, 0, timeZone);
  if (!noon) return null;
  const next = zoneParts(new Date(noon.getTime() + 24 * 60 * 60 * 1000), timeZone);
  return zonedInstant(next.year, next.month, next.day, 8, 0, timeZone);
}

export function eventHasEnded(startsAt, now, timeZone = SHOW_ZONE) {
  const ends = eventEndsAt(startsAt, timeZone);
  if (!ends) return false;
  return now >= ends.getTime();
}

function clock(hour24, minute, minutes) {
  const suffix = hour24 >= 12 ? "PM" : "AM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  if (minutes === "always" || minute !== 0) return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  return `${hour} ${suffix}`;
}

/** "Sat, Nov 21 • 10 PM" or with minutes. Always America/Edmonton. */
export function formatWhen(date, kind, timeZone = SHOW_ZONE) {
  const wall = zoneParts(date, timeZone);
  const day = `${WEEKDAYS[wall.weekday]}, ${MONTHS[wall.month - 1]} ${wall.day}`;
  return `${day} • ${clock(wall.hour, wall.minute, kind === "detail" ? "always" : "if-needed")}`;
}

/** Date line for a public invite card. No venue. */
export function formatEventWhen(startsAt, timeZone = SHOW_ZONE) {
  const date = asDate(startsAt);
  if (!date) return "";
  return formatWhen(date, "detail", timeZone);
}
