import { describe, expect, it } from "vitest";
import { routeAccess } from "./access";

describe("route access", () => {
  it("requires sign-in before opening the dashboard", () => {
    expect(routeAccess("/dashboard", false)).toBe("signin");
  });

  it("allows an authenticated user into the dashboard", () => {
    expect(routeAccess("/dashboard", true)).toBe("allow");
  });

  it("keeps public pages public", () => {
    expect(routeAccess("/signup", false)).toBe("allow");
    expect(routeAccess("/signin", false)).toBe("allow");
    expect(routeAccess("/", false)).toBe("allow");
  });
});
