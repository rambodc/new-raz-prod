import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyCode = vi.fn(async (email: string, code: string) => {
  if (!email || code.length !== 6) throw new Error("missing code");
  return { needsProfile: false };
});

vi.mock("./services", () => ({
  authFailure: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Something went wrong. Try again.",
    reason: "",
    retryAfterSeconds: 0,
  }),
  requestCode: vi.fn(async () => undefined),
  verifyCode: (email: string, code: string) => verifyCode(email, code),
}));

import { SignInSheet } from "./signin";

describe("sign-in code step", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    verifyCode.mockClear();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionStorage.clear();
  });

  it("restores the code step and submits six digits", async () => {
    sessionStorage.setItem(
      "razzberry.pendingSignIn",
      JSON.stringify({ email: "ada@example.com", step: "code", cooldownUntil: Date.now() + 45_000 }),
    );
    act(() => root.render(<SignInSheet onClose={() => undefined} onVerified={() => undefined} />));

    const boxes = [...container.querySelectorAll(".code-boxes input")] as HTMLInputElement[];
    expect(boxes).toHaveLength(6);
    expect(boxes[0].autocomplete).toBe("one-time-code");
    expect(boxes[0].inputMode).toBe("numeric");
    expect(boxes.every((box) => box.disabled === false)).toBe(true);
    expect(container.textContent).toContain("Resend code in");
    expect(container.textContent).toContain("Use a different email");
    const resend = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Resend code"));
    expect((resend as HTMLButtonElement).disabled).toBe(true);

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(boxes[0], "482019");
      boxes[0].dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(verifyCode).toHaveBeenCalledWith("ada@example.com", "482019");
    expect(boxes.map((box) => box.value).join("")).toBe("482019");
  });
});
