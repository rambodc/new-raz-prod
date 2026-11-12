import { describe, expect, it } from "vitest";
import { ARTIST_EVENT_PHOTO, fittedSize } from "./resizeImage";

describe("artist and event photos", () => {
  it("allows any size and caps the long edge at 1200", () => {
    expect(ARTIST_EVENT_PHOTO).toEqual({ maxEdge: 1200, maxBytes: 300_000, quality: 0.8 });
    expect(fittedSize(2400, 1800, ARTIST_EVENT_PHOTO.maxEdge)).toEqual({ width: 1200, height: 900 });
    expect(fittedSize(800, 2000, ARTIST_EVENT_PHOTO.maxEdge)).toEqual({ width: 480, height: 1200 });
    expect(fittedSize(200, 100, ARTIST_EVENT_PHOTO.maxEdge)).toEqual({ width: 200, height: 100 });
  });
});
