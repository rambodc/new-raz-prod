import { describe, expect, it } from "vitest";
import { buildTimes, cleanLineup, endOfDay, GRACE_MS, isLiveNow, isTonight, slugify, toDateInput, toTimeInput, whenLabel } from "./shows";

const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);
const show = (s: Date, e: Date) => ({ startsAt: s, endsAt: e });

describe("live and tonight", () => {
  it("opens 15 minutes before the start and closes 15 minutes after the end, like the server", () => {
    expect(GRACE_MS).toBe(15 * 60_000);
    const s = show(at(20), at(23));
    expect(isLiveNow(s, at(19, 44))).toBe(false);
    expect(isLiveNow(s, at(19, 46))).toBe(true);
    expect(isLiveNow(s, at(23, 14))).toBe(true);
    expect(isLiveNow(s, at(23, 16))).toBe(false);
  });

  it("counts shows that are on now or start later today, but not tomorrow's or yesterday's", () => {
    const now = at(18);
    expect(isTonight(show(at(20), at(23)), now)).toBe(true);
    expect(isTonight(show(at(17), at(19)), now)).toBe(true);
    expect(isTonight(show(at(12), at(14)), now)).toBe(false);
    expect(isTonight(show(new Date(2026, 9, 29, 19), new Date(2026, 9, 29, 22)), now)).toBe(false);
    expect(endOfDay(now).getDate()).toBe(28);
  });

  it("says when a show starts or until when it runs", () => {
    expect(whenLabel(show(at(20), at(23)), at(18))).toMatch(/^Starts 8:00 pm$/);
    expect(whenLabel(show(at(20), at(23)), at(21))).toMatch(/^Live · until 11:00 pm$/);
  });
});

describe("admin form helpers", () => {
  it("makes stable artist ids", () => {
    expect(slugify("The Weeknd!")).toBe("the-weeknd");
    expect(slugify("  Sigur Rós ")).toBe("sigur-ros");
    expect(slugify("Simon & Garfunkel")).toBe("simon-and-garfunkel");
    expect(slugify("東京事変")).toMatch(/^artist-[a-z0-9]+$/);
    expect(slugify("東京事変")).toBe(slugify("東京事変"));
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
    expect(slugify("AC/DC")).toMatch(/^[a-z0-9-]+$/);
  });

  it("cleans the lineup: trims, drops blanks, and drops repeats in any case", () => {
    expect(cleanLineup(["  Alpha ", "", "alpha", "Beta   Band", "   "])).toEqual(["Alpha", "Beta Band"]);
  });

  it("builds start and end from a date and two times, rolling past midnight", () => {
    const t = buildTimes("2026-10-28", "20:00", "23:30")!;
    expect(t.endsAt.getTime() - t.startsAt.getTime()).toBe(3.5 * 3600_000);
    const late = buildTimes("2026-10-28", "22:00", "01:00")!;
    expect(late.endsAt.getTime() - late.startsAt.getTime()).toBe(3 * 3600_000);
    expect(buildTimes("", "20:00", "23:00")).toBeNull();
    expect(toDateInput(at(9, 5))).toBe("2026-10-28");
    expect(toTimeInput(at(9, 5))).toBe("09:05");
  });
});
