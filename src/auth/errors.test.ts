import { describe, expect, it } from "vitest";
import { GENERIC_AUTH_ERROR, authErrorCode, authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("maps wrong-credential codes to one non-revealing message", () => {
    const expected = "That email and password don't match. Please try again.";
    for (const code of ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"]) {
      expect(authErrorMessage({ code })).toBe(expected);
    }
  });

  it("maps common sign-up and network problems", () => {
    expect(authErrorMessage({ code: "auth/email-already-in-use" })).toMatch(/already exists/);
    expect(authErrorMessage({ code: "auth/weak-password" })).toMatch(/8 characters/);
    expect(authErrorMessage({ code: "auth/invalid-email" })).toMatch(/doesn't look right/);
    expect(authErrorMessage({ code: "auth/too-many-requests" })).toMatch(/Too many attempts/);
    expect(authErrorMessage({ code: "auth/network-request-failed" })).toMatch(/connection/);
  });

  it("falls back to a generic message and never leaks raw codes", () => {
    expect(authErrorMessage({ code: "auth/something-new" })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(new Error("boom"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage({ code: "auth/something-new" })).not.toMatch(/auth\//);
  });

  it("extracts string codes only", () => {
    expect(authErrorCode({ code: "auth/x" })).toBe("auth/x");
    expect(authErrorCode({ code: 5 })).toBeUndefined();
    expect(authErrorCode("nope")).toBeUndefined();
  });
});
