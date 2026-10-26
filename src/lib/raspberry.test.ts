import { describe, expect, it } from "vitest";
import { CROWN, DRUPELETS, insetPolygon } from "./raspberry";

describe("raspberry geometry", () => {
  it("lays out 28 drupelets in rows of 6/7/6/5/4", () => {
    expect(DRUPELETS).toHaveLength(28);
    const counts = [0, 1, 2, 3, 4].map((row) => DRUPELETS.filter((d) => d.row === row).length);
    expect(counts).toEqual([6, 7, 6, 5, 4]);
  });

  it("is mirror-symmetric around the centre line", () => {
    for (const d of DRUPELETS) {
      const mirror = DRUPELETS.find((o) => o.row === d.row && Math.abs(o.x - (504 - d.x)) < 1e-6 && o.y === d.y);
      expect(mirror).toBeDefined();
    }
  });

  it("has a three-leaf crown of rhombi and insets without changing vertex count", () => {
    expect(CROWN).toHaveLength(3);
    for (const leaf of CROWN) {
      expect(leaf).toHaveLength(4);
      expect(insetPolygon(leaf, 3)).toHaveLength(4);
    }
  });
});
