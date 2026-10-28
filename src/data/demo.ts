// Demo data for the admin "Add demo data" button: two real John Summit tour dates, and a fake TEST show near
// Rambod's office that is open for check-in from now until 11:59 pm Calgary time.
import type { NewShow } from "./types";

export const DEMO_TZ = "America/Edmonton";

export const DEMO_IMAGES: { artistId: string; url: string }[] = [
  { artistId: "john-summit", url: "/demo/john-summit.jpg" },
  { artistId: "test-dj-raz", url: "/demo/test-dj-raz.jpg" },
];

export const PHOTO_CREDIT = "Photo: Wynne Plaga, CC BY-SA 4.0, via Wikimedia Commons";

type FixedShow = Omit<NewShow, "startsAt" | "endsAt"> & { id: string; startsAt: string; endsAt: string };

/**
 * John Summit's CTRL ESCAPE Arena Tour (Ticketmaster, venue sites). Show start (7 pm) and doors (6 pm) are
 * published for both. The end time (11 pm) is an assumption.
 */
export const JOHN_SUMMIT_SHOWS: FixedShow[] = [
  { id: "demo-john-summit-boston", venue: "TD Garden, Boston", lat: 42.3662986, lng: -71.0621622, startsAt: "2026-10-29T18:00:00-04:00", endsAt: "2026-10-29T23:00:00-04:00", artistNames: ["John Summit"] },
  { id: "demo-john-summit-washington", venue: "Capital One Arena, Washington DC", lat: 38.8981883, lng: -77.0209378, startsAt: "2026-10-31T18:00:00-04:00", endsAt: "2026-10-31T23:00:00-04:00", artistNames: ["John Summit"] },
];

export const TEST_SHOW_ID = "demo-test-razzberry";

/** The clock time in a time zone, as numbers. */
function partsIn(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** 11:59 pm on the day it is now in the given time zone. */
export function endOfDayIn(tz: string, now: Date): Date {
  const t = partsIn(tz, now);
  const offset = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi, t.s) - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(t.y, t.m - 1, t.d, 23, 59, 0) - offset);
}

/** The fake show at #6, 7115 48 St SE, Calgary. It starts now and ends at 11:59 pm (at least two hours long). */
export function testShow(now: Date): NewShow {
  const twoHours = now.getTime() + 2 * 3600_000;
  return {
    venue: "TEST SHOW · Razzberry Test Venue (#6, 7115 48 St SE)",
    lat: 50.9916694,
    lng: -113.9651856,
    startsAt: now,
    endsAt: new Date(Math.max(endOfDayIn(DEMO_TZ, now).getTime(), twoHours)),
    artistNames: ["Test DJ Raz", "John Summit"],
  };
}
