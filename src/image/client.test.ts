import { describe, expect, it } from "vitest";
import { readPhoto } from "./client";

describe("photo upload", () => {
  it("rejects a file that is not a photo before decoding it", async () => {
    await expect(readPhoto(new File(["<html><script>"], "page.html", { type: "text/html" }))).rejects.toThrow(/JPEG/);
  });
});
