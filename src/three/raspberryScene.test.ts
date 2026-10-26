import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no WebGL, so swap only the GPU-facing classes. Everything else (geometry, materials,
// lights, math, the animation loop) runs for real, which catches construction and per-frame errors.
const renders = vi.hoisted(() => ({ count: 0, disposed: false }));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class FakeRenderer {
    toneMapping = 0;
    toneMappingExposure = 1;
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render() {
      renders.count++;
    }
    dispose() {
      renders.disposed = true;
    }
  }
  class FakePMREM {
    fromScene() {
      return { texture: { dispose() {} } };
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
});

import { createRaspberryScene } from "./raspberryScene";

afterEach(() => {
  renders.count = 0;
  renders.disposed = false;
  vi.useRealTimers();
});

describe("raspberry scene", () => {
  it("builds the berry, animates for several frames, reacts to theme and pointer, and disposes", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const scene = createRaspberryScene(document.createElement("canvas"), () => {});
    scene.resize(520, 540);
    scene.setPointer(0.5, -0.4);
    scene.setTheme("light");
    scene.setTheme("dark");

    let t = performance.now();
    for (let i = 0; i < 5; i++) {
      const cb = callbacks.shift();
      expect(cb).toBeDefined();
      t += 16;
      cb!(t);
    }
    expect(renders.count).toBeGreaterThanOrEqual(5);

    scene.setActive(false);
    scene.dispose();
    expect(renders.disposed).toBe(true);
    vi.unstubAllGlobals();
  });
});
