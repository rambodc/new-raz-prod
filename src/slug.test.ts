import { describe, expect, it } from "vitest";
import { artistPath, eventPath, isSlug, slugCandidates, slugify, trackPath } from "./slug";

describe("slugs", () => {
  it("builds lowercase hyphenated slugs and skips reserved words", () => {
    expect(slugify("Ada Vale")).toBe("ada-vale");
    expect(slugify("Émile & The Room")).toBe("emile-and-the-room");
    expect(slugify("   ")).toBe("page");
    expect(isSlug("ada-vale")).toBe(true);
    expect(isSlug("Ada")).toBe(false);
    expect(isSlug("t")).toBe(true);
    const reserved = slugCandidates("Settings");
    expect(reserved[0]).toBe("settings-2");
    expect(reserved).not.toContain("settings");
    expect(slugCandidates("River Room", ["t", "edit"])[0]).toBe("river-room");
    expect(artistPath("ada-vale")).toBe("/ada-vale");
    expect(eventPath("ada-vale", "river-room")).toBe("/ada-vale/river-room");
    expect(trackPath("ada-vale", "midnight")).toBe("/ada-vale/t/midnight");
  });
});