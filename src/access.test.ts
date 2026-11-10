import { describe, expect, it } from "vitest";
import { ownsArtist } from "./access";

describe("artist ownership", () => {
  const artist = { id: "nova", ownerUid: "nova" };

  it("lets the owning artist edit and hides controls from everyone else", () => {
    expect(ownsArtist("nova", "artist", artist)).toBe(true);
    expect(ownsArtist("nova", "fan", artist)).toBe(false);
    expect(ownsArtist("ada", "artist", artist)).toBe(false);
    expect(ownsArtist("ada", "fan", artist)).toBe(false);
    expect(ownsArtist("nova", "artist", { id: "nova", ownerUid: "ada" })).toBe(false);
    expect(ownsArtist("nova", "artist", null)).toBe(false);
  });
});
