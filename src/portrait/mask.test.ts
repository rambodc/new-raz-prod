import { describe, expect, it } from "vitest";
import { applyAlpha, categoryMaskToAlpha, foregroundRatio } from "./mask";

describe("person matte", () => {
  it("keeps the person and clears the background", () => {
    const categories = new Uint8Array([0, 1, 0, 3]);
    const alpha = categoryMaskToAlpha(categories, 2, 2, 0);
    expect(Array.from(alpha)).toEqual([0, 255, 0, 255]);
    expect(foregroundRatio(alpha)).toBe(0.5);
    const cutout = applyAlpha(new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 1, 2, 3, 255, 4, 5, 6, 255]), alpha);
    expect(cutout[3]).toBe(0);
    expect(cutout[7]).toBe(255);
    expect(cutout[4]).toBe(40);
  });
});
