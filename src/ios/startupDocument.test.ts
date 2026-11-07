import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripCrossOriginAttributes } from "./startupDocument";

describe("packaged startup document", () => {
  it("removes the crossorigin attribute Vite adds to module scripts and styles", () => {
    const html = [
      '<script type="module" crossorigin src="/assets/index.js"></script>',
      '<link rel="stylesheet" crossorigin="anonymous" href="/assets/index.css">',
      '<link rel="modulepreload" crossorigin href="/assets/vendor.js">',
    ].join("");
    const stripped = stripCrossOriginAttributes(html);
    expect(stripped).not.toContain("crossorigin");
    expect(stripped).toContain('src="/assets/index.js"');
    expect(stripped).toContain('href="/assets/index.css"');
  });

  it("keeps a visible startup message in the document that loads before the bundle", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('id="boot"');
    expect(html).toContain("Starting Razzberry");
    expect(html).toContain("Try again");
  });
});
