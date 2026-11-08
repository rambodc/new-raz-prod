import { describe, expect, it } from "vitest";
import { chatLayer, keyboardOpen, shellFrame, stickToLatest } from "./keyboard";

describe("visual viewport shell", () => {
  it("fills the screen when the keyboard is closed", () => {
    const frame = shellFrame({ innerHeight: 844, viewportHeight: 844, offsetTop: 0 });
    expect(frame).toEqual({ top: 0, height: 844, keyboard: 0 });
    expect(keyboardOpen(frame.keyboard)).toBe(false);
  });

  it("uses only the visible viewport when the keyboard overlays it", () => {
    const frame = shellFrame({ innerHeight: 844, viewportHeight: 430, offsetTop: 0 });
    expect(frame).toEqual({ top: 0, height: 430, keyboard: 414 });
    expect(keyboardOpen(frame.keyboard)).toBe(true);
  });

  it("follows a shifted visual viewport without adding a second inset", () => {
    const frame = shellFrame({ innerHeight: 844, viewportHeight: 430, offsetTop: 120 });
    expect(frame.top).toBe(120);
    expect(frame.height).toBe(430);
    expect(frame.keyboard).toBe(294);
  });

  it("does not add inset when the browser already resized the layout", () => {
    const frame = shellFrame({ innerHeight: 430, viewportHeight: 430, offsetTop: 0 });
    expect(frame.keyboard).toBe(0);
    expect(frame.height).toBe(430);
  });

  it("ignores a bad viewport instead of shifting the page", () => {
    const frame = shellFrame({ innerHeight: 800, viewportHeight: Number.NaN, offsetTop: Number.NaN });
    expect(frame.top).toBe(0);
    expect(frame.height).toBe(800);
    expect(frame.keyboard).toBe(0);
  });
});

describe("chat layer", () => {
  it("stays on the room until the field is in use", () => {
    expect(chatLayer(false, false, 390)).toBe(false);
  });

  it("opens the chat layer for a phone keyboard and a narrow focused field", () => {
    expect(chatLayer(true, true, 1280)).toBe(true);
    expect(chatLayer(true, false, 390)).toBe(true);
    expect(chatLayer(true, false, 1200)).toBe(false);
  });
});

describe("message scroll", () => {
  it("sticks to the newest line only when the reader is already there", () => {
    expect(stickToLatest(0, 400, 400)).toBe(true);
    expect(stickToLatest(360, 800, 400)).toBe(true);
    expect(stickToLatest(100, 800, 400)).toBe(false);
  });
});
