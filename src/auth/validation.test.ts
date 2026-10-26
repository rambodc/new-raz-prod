import { describe, expect, it } from "vitest";
import { greetingName, hasErrors, normalizeEmail, validateConfirm, validateEmail, validateName, validateNewPassword, validateSignIn, validateSignUp } from "./validation";

describe("validation helpers", () => {
  it("validates emails and normalises case and whitespace", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(validateEmail("")).toBeDefined();
    expect(validateEmail("nope")).toBeDefined();
    expect(validateEmail("a@b")).toBeDefined();
    expect(validateEmail("ada@example.com")).toBeUndefined();
  });

  it("requires a name of a sensible length", () => {
    expect(validateName("   ")).toBeDefined();
    expect(validateName("x".repeat(81))).toBeDefined();
    expect(validateName("Ada Lovelace")).toBeUndefined();
  });

  it("requires passwords of at least 8 characters", () => {
    expect(validateNewPassword("")).toBeDefined();
    expect(validateNewPassword("short7!")).toMatch(/at least 8/);
    expect(validateNewPassword("long-enough")).toBeUndefined();
  });

  it("checks that the confirmation matches", () => {
    expect(validateConfirm("abcdefgh", "")).toBeDefined();
    expect(validateConfirm("abcdefgh", "abcdefgx")).toMatch(/don't match/);
    expect(validateConfirm("abcdefgh", "abcdefgh")).toBeUndefined();
  });

  it("aggregates sign-in and sign-up errors", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({ email: expect.any(String), password: expect.any(String) });
    expect(hasErrors(validateSignIn({ email: "a@b.co", password: "x" }))).toBe(false);
    const bad = validateSignUp({ name: "", email: "bad", password: "123", confirm: "1234" });
    expect(Object.keys(bad).sort()).toEqual(["email", "name", "password"]);
    expect(validateSignUp({ name: "Ada", email: "ada@example.com", password: "password1", confirm: "password2" })).toEqual({ confirm: "The passwords don't match." });
    expect(hasErrors(validateSignUp({ name: "Ada", email: "ada@example.com", password: "password1", confirm: "password1" }))).toBe(false);
  });

  it("builds a friendly greeting name", () => {
    expect(greetingName("Ada Lovelace", "x@y.z")).toBe("Ada");
    expect(greetingName("", "ada@example.com")).toBe("ada");
    expect(greetingName(null, null)).toBe("there");
  });
});
