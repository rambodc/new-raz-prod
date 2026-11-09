import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("sign-in screen", () => {
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

  it("asks for an email in a sans and does not show the old home screen", () => {
    act(() => root.render(<App />));
    expect(container.querySelector(".wordmark")?.textContent).toBe("Razzberry");
    expect(container.querySelector("h1")?.textContent).toBe("Be there.");
    expect(container.textContent).toContain("Send me a code");
    expect(container.textContent).toContain("No password needed.");
    expect(container.textContent).not.toContain("25°");
    const input = container.querySelector("input[type='email']") as HTMLInputElement;
    expect(input.placeholder).toBe("you@email.com");
    const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    expect(css).toMatch(/Inter Variable/);
    expect(css).toMatch(/ui-sans-serif/);
    expect(css).not.toMatch(/Georgia|Iowan|Times New Roman|Palatino|Didot|Garamond/);
    expect(css).toMatch(/font-size:\s*16px/);
    expect(css).toMatch(/max-width:\s*100%/);
    expect(css).toMatch(/#d81e5b/);
  });
});
