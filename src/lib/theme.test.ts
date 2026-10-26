import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("defaults to dark", () => {
    expect(resolveTheme(null)).toBe("dark");
    expect(resolveTheme(undefined)).toBe("dark");
    expect(resolveTheme("garbage")).toBe("dark");
  });
  it("honours an explicit stored light choice", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});
