import { describe, expect, it } from "vitest";
import { ARTIST_FRAME, DESKTOP_FRAME, PHONE_FRAME, clampOffset, coverScale, cropFromView, guideBox } from "./crop";
import { splitByTime } from "./events";

describe("artist crop", () => {
  it("covers the frame and stays inside the photo", () => {
    const crop = cropFromView(3000, 4000, 180, 320, 1, -40, -80);
    expect(crop.width / crop.height).toBeCloseTo(180 / 320, 5);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(3000 + 0.01);
    expect(crop.y + crop.height).toBeLessThanOrEqual(4000 + 0.01);
    expect(coverScale(3000, 4000, 180, 320)).toBeCloseTo(320 / 4000, 5);
  });

  it("does not pan the photo off the frame", () => {
    const scale = coverScale(1000, 2000, 90, 160);
    expect(clampOffset(50, 1000, 90, scale)).toBe(0);
    expect(clampOffset(-9999, 1000, 90, scale)).toBeCloseTo(90 - 1000 * scale, 5);
  });

  it("draws the phone guide inside the width and the desktop guide inside the height", () => {
    const phone = guideBox(ARTIST_FRAME, PHONE_FRAME);
    const desktop = guideBox(ARTIST_FRAME, DESKTOP_FRAME);
    expect(phone.height).toBe("100%");
    expect(parseFloat(phone.width)).toBeLessThan(100);
    expect(desktop.width).toBe("100%");
    expect(parseFloat(desktop.height)).toBeLessThan(100);
  });
});

describe("event split", () => {
  it("keeps upcoming soonest-first and past newest-first", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    const items = [
      { id: "old", startsAt: new Date("2026-01-02T00:00:00Z") },
      { id: "older", startsAt: new Date("2026-01-01T00:00:00Z") },
      { id: "soon", startsAt: new Date("2026-07-01T00:00:00Z") },
      { id: "sooner", startsAt: new Date("2026-06-15T00:00:00Z") },
    ];
    const split = splitByTime(items, now);
    expect(split.upcoming.map((item) => item.id)).toEqual(["sooner", "soon"]);
    expect(split.past.map((item) => item.id)).toEqual(["old", "older"]);
  });
});
