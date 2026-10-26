import { describe, expect, it } from "vitest";
import { routeAccess } from "./access";

describe("route access", () => {
  it("requires sign-in before opening the welcome page", () => {
    expect(routeAccess("/welcome", false)).toBe("signin");
    expect(routeAccess("/welcome", true)).toBe("allow");
  });
  it("keeps signed-in users out of the auth pages", () => {
    for (const p of ["/signin", "/signup", "/forgot-password"]) {
      expect(routeAccess(p, true)).toBe("welcome");
      expect(routeAccess(p, false)).toBe("allow");
    }
  });
  it("keeps the home page public", () => {
    expect(routeAccess("/", false)).toBe("allow");
    expect(routeAccess("/", true)).toBe("allow");
  });
});
