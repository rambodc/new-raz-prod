import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

function rule(selector: string) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\}`));
  return match?.[0] ?? "";
}

describe("mobile event page overflow", () => {
  it("clips decorative blobs in the atmosphere instead of hiding page overflow", () => {
    expect(rule(".event-atmosphere")).toMatch(/overflow:\s*hidden/);
    expect(rule(".event-page")).not.toMatch(/overflow-x:\s*hidden/);
    expect(rule(".event-page")).toMatch(/min-width:\s*0/);
    expect(rule(".event-guests li")).toMatch(/minmax\(0,\s*1\.4fr\)/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).not.toMatch(/Georgia|Iowan|Times New Roman/);
  });
});
