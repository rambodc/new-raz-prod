import { describe, expect, it, vi } from "vitest";
import { readPhoto, requestImage } from "./client";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("photo upload", () => {
  it("rejects a file that is not a photo before decoding it", async () => {
    await expect(readPhoto(new File(["<html><script>"], "page.html", { type: "text/html" }))).rejects.toThrow(/JPEG/);
  });

  it("polls one deferred generation instead of waiting on a single long request", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if (body.action === "generate") {
        return { ok: true, status: 202, json: async () => ({ status: "pending", requestId: "req-12345678", kind: "ai-generated" }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: "ready", image: PNG, mime: "image/png", kind: "ai-generated", model: "grok-imagine-image-2.0" }) };
    });
    const result = await requestImage({ action: "generate", prompt: "A quiet room", aspect: "background", signal: new AbortController().signal });
    expect(result.image).toBe(PNG);
    expect(bodies).toEqual([
      { action: "generate", prompt: "A quiet room", aspect: "background" },
      { action: "poll", requestId: "req-12345678" },
    ]);
    vi.unstubAllGlobals();
  });
});
