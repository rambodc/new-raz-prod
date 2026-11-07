import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("simulator frame check", () => {
  it("rejects a blank frame and accepts a colored upper area", () => {
    const output = execFileSync("python3", ["scripts/ios/webgl_frame.py", "--self-test"], { encoding: "utf8" });
    expect(output).toContain("webgl frame self-test ok");
  });
});
