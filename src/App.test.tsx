import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("starter page", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the home screen in a system sans and toggles a device", () => {
    act(() => root.render(<App />));
    expect(container.querySelector(".brand")?.textContent).toBe("Razzberry");
    expect(container.querySelector("h1")?.textContent).toBe("25°");
    expect(container.textContent).toContain("Light");
    expect(container.textContent).toContain("Camera");
    expect(container.textContent).toContain("7:00pm, Daily");
    const light = container.querySelector("[aria-label='Outdoor light']") as HTMLButtonElement;
    expect(light.getAttribute("aria-checked")).toBe("true");
    act(() => light.click());
    expect(light.getAttribute("aria-checked")).toBe("false");
    const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toMatch(/ui-sans-serif/);
    expect(css).not.toMatch(/Georgia|Iowan|Times New Roman|Palatino/);
    expect(css).toMatch(/max-width:\s*100%/);
  });
});
