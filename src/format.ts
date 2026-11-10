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

export function formatDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatClock(date: Date, minutes: "always" | "if-needed"): string {
  let hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const showMinutes = minutes === "always" || date.getMinutes() !== 0;
  if (!showMinutes) return `${hours} ${suffix}`;
  return `${hours}:${String(date.getMinutes()).padStart(2, "0")} ${suffix}`;
}

export function formatWhen(date: Date, kind: "card" | "detail"): string {
  return `${formatDay(date)} • ${formatClock(date, kind === "detail" ? "always" : "if-needed")}`;
}

export function dateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

export function combineLocal(date: string, time: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  return result;
}
