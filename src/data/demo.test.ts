import { describe, expect, it } from "vitest";
import { DEMO_TZ, JOHN_SUMMIT_SHOWS, endOfDayIn, testShow } from "./demo";
import { slugify } from "./shows";

describe("demo data", () => {
  it("finds 11:59 pm Calgary time, also when UTC is already the next day", () => {
    expect(endOfDayIn(DEMO_TZ, new Date("2026-10-28T20:00:00Z")).toISOString()).toBe("2026-10-29T05:59:00.000Z"); // 2 pm MDT, UTC-6
    expect(endOfDayIn(DEMO_TZ, new Date("2026-10-29T05:00:00Z")).toISOString()).toBe("2026-10-29T05:59:00.000Z"); // 11 pm the same Calgary day
    expect(endOfDayIn(DEMO_TZ, new Date("2026-10-29T06:30:00Z")).toISOString()).toBe("2026-10-30T05:59:00.000Z"); // 12:30 am, a new day
    expect(endOfDayIn(DEMO_TZ, new Date("2026-07-01T03:00:00Z")).toISOString()).toBe("2026-07-01T05:59:00.000Z"); // summer, 9 pm on June 30
  });

  it("makes a test show that starts now and ends at 11:59 pm, at least two hours later", () => {
    const now = new Date("2026-10-28T20:00:00Z"); // 2 pm in Calgary
    const s = testShow(now);
    expect(s.startsAt).toEqual(now);
    expect(s.endsAt.toISOString()).toBe("2026-10-29T05:59:00.000Z");
    expect(s.artistNames).toEqual(["Test DJ Raz", "John Summit"]);
    expect(s.venue).toContain("TEST");
    const late = testShow(new Date("2026-10-29T05:30:00Z")); // 11:30 pm in Calgary
    expect(late.endsAt.getTime() - late.startsAt.getTime()).toBe(2 * 3600_000);
  });

  it("only lists John Summit shows that are valid", () => {
    const ids = new Set<string>();
    for (const s of JOHN_SUMMIT_SHOWS) {
      expect(new Date(s.endsAt).getTime()).toBeGreaterThan(new Date(s.startsAt).getTime());
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(s.venue.length).toBeLessThanOrEqual(120);
      expect(s.artistNames.map(slugify)).toEqual(["john-summit"]);
      ids.add(s.id);
    }
    expect(ids.size).toBe(JOHN_SUMMIT_SHOWS.length);
  });
});
