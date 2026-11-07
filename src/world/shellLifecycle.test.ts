import { describe, expect, it } from "vitest";
import { frameLoop, initialShell, reduceShell } from "./shellLifecycle";

describe("shell lifecycle", () => {
  it("stops rendering in the background and starts again when visible", () => {
    const hidden = reduceShell(initialShell, { type: "visibility", hidden: true });
    expect(frameLoop(hidden, false)).toBe("never");
    const shown = reduceShell(hidden, { type: "visibility", hidden: false });
    expect(frameLoop(shown, false)).toBe("always");
    expect(frameLoop(shown, true)).toBe("demand");
  });

  it("treats a native suspend like the page being hidden", () => {
    const suspended = reduceShell(initialShell, { type: "native", active: false });
    expect(suspended.background).toBe(true);
    expect(frameLoop(suspended, false)).toBe("never");
    const resumed = reduceShell(suspended, { type: "native", active: true });
    expect(resumed.background).toBe(false);
    expect(resumed.generation).toBe(0);
  });

  it("keeps a lost context mounted so it can be restored", () => {
    const lost = reduceShell(initialShell, { type: "context-lost" });
    expect(lost.contextLost).toBe(true);
    expect(lost.generation).toBe(0);
    expect(frameLoop(lost, false)).toBe("never");
    const restored = reduceShell(lost, { type: "context-restored" });
    expect(restored.contextLost).toBe(false);
    expect(frameLoop(restored, false)).toBe("always");
  });

  it("rebuilds the canvas only when a resume still has a dead context", () => {
    const lost = reduceShell(initialShell, { type: "context-lost" });
    const stillDead = reduceShell(lost, { type: "resume-check", contextLost: true });
    expect(stillDead.generation).toBe(1);
    expect(stillDead.contextLost).toBe(false);
    const healthy = reduceShell(lost, { type: "resume-check", contextLost: false });
    expect(healthy.generation).toBe(0);
    expect(healthy.contextLost).toBe(false);
  });

  it("does not rebuild while the app is still suspended", () => {
    const suspended = reduceShell(reduceShell(initialShell, { type: "context-lost" }), { type: "native", active: false });
    const check = reduceShell(suspended, { type: "resume-check", contextLost: true });
    expect(check.generation).toBe(0);
    expect(check.background).toBe(true);
  });

  it("retry builds a fresh canvas", () => {
    const lost = reduceShell(initialShell, { type: "context-lost" });
    const retried = reduceShell(lost, { type: "retry" });
    expect(retried.generation).toBe(1);
    expect(retried.contextLost).toBe(false);
  });
});
