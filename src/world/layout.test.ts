import { describe, expect, it } from "vitest";
import { journeyShot, layoutFor, stepTowards } from "./layout";

describe("framing", () => {
  const phone = layoutFor(390, 844);
  const narrow = layoutFor(360, 740);
  const tablet = layoutFor(768, 1024);
  const desktop = layoutFor(1440, 900);

  it("reframes a phone instead of cropping the desktop camera", () => {
    expect(phone.band).toBe("phone");
    expect(desktop.band).toBe("desktop");
    expect(phone.portal.position[0]).toBeLessThan(desktop.portal.position[0] - 0.8);
    expect(Math.abs(phone.sculpture.position[0])).toBeLessThan(Math.abs(desktop.sculpture.position[0]));
    expect(phone.artist.fov).toBeGreaterThan(desktop.artist.fov);
    expect(phone.artist.position[2]).not.toBe(desktop.artist.position[2]);
  });

  it("keeps a 360px portrait in the phone composition and a tablet between the two", () => {
    expect(narrow.band).toBe("phone");
    expect(narrow.portal.position[0]).toBeLessThan(tablet.portal.position[0]);
    expect(tablet.portal.position[0]).toBeLessThan(desktop.portal.position[0]);
  });

  it("uses a different still frame for sign-in, the artist room, and the event", () => {
    expect(phone.auth.target[1]).not.toBe(phone.artist.target[1]);
    expect(phone.auth.position[2]).not.toBe(phone.artist.position[2]);
    expect(phone.event.position[2]).toBeLessThan(phone.artist.position[2]);
    expect(desktop.event.position).not.toEqual(desktop.artist.position);
  });

  it("pulls the camera back on a short landscape screen", () => {
    const wideShort = layoutFor(800, 400);
    const wideTall = layoutFor(800, 900);
    expect(wideShort.artist.position[2]).toBeGreaterThan(wideTall.artist.position[2]);
  });

  it("starts and ends the portal journey on the still frames", () => {
    const start = journeyShot(desktop, 0);
    const end = journeyShot(desktop, 1);
    expect(start.position[2]).toBeCloseTo(desktop.artist.position[2]);
    expect(end.position[0]).toBeCloseTo(desktop.event.position[0]);
    expect(end.position[1]).toBeCloseTo(desktop.event.position[1]);
    expect(end.position[2]).toBeCloseTo(desktop.event.position[2]);
    const mid = journeyShot(desktop, 0.5);
    expect(mid.position[0]).not.toBe(start.position[0]);
  });
});

describe("stepTowards", () => {
  it("snaps when motion is reduced and eases otherwise", () => {
    expect(stepTowards(0, 1, 0.016, true)).toBe(1);
    const next = stepTowards(0, 1, 0.016, false);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });
});
