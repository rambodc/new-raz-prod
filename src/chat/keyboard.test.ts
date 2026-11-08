import { describe, expect, it } from "vitest";
import { keyboardInset, keyboardOpen } from "./keyboard";

describe("keyboard inset", () => {
  it("measures the covered strip and ignores a tiny change", () => {
    expect(keyboardInset(844, 430, 0)).toBe(414);
    expect(keyboardOpen(414)).toBe(true);
    expect(keyboardOpen(keyboardInset(844, 820, 0))).toBe(false);
  });
});
