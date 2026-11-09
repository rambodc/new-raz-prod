import { describe, expect, it } from "vitest";
import { combineLocal, formatClock, formatDay, formatWhen, validBlock, validLine } from "./format";

describe("event dates", () => {
  const night = new Date(2026, 10, 21, 22, 0, 0, 0);
  const half = new Date(2026, 11, 13, 22, 30, 0, 0);

  it("matches the card and the event page", () => {
    expect(formatDay(night)).toBe("Sat, Nov 21");
    expect(formatClock(night, "if-needed")).toBe("10 PM");
    expect(formatWhen(night, "card")).toBe("Sat, Nov 21 • 10 PM");
    expect(formatWhen(night, "detail")).toBe("Sat, Nov 21 • 10:00 PM");
    expect(formatWhen(half, "card")).toBe("Sun, Dec 13 • 10:30 PM");
  });

  it("combines a local date and time and rejects an impossible day", () => {
    const combined = combineLocal("2026-11-21", "22:00");
    expect(combined?.getFullYear()).toBe(2026);
    expect(combined?.getMonth()).toBe(10);
    expect(combined?.getDate()).toBe(21);
    expect(combined?.getHours()).toBe(22);
    expect(combineLocal("2026-02-31", "10:00")).toBeNull();
    expect(combineLocal("friday", "10:00")).toBeNull();
  });

  it("limits names and allows an empty bio", () => {
    expect(validLine("DJ Nova", 80)).toBe(true);
    expect(validLine("   ", 80)).toBe(false);
    expect(validLine("x".repeat(81), 80)).toBe(false);
    expect(validBlock("", 600, true)).toBe(true);
    expect(validBlock("", 2000, false)).toBe(false);
  });
});
