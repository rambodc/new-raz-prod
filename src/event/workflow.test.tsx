import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function setField(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonNamed(container: HTMLElement, name: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === name && !button.disabled) as HTMLButtonElement;
}

describe("event page workflow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("answers the current guest list without the model, then applies one mocked proposal", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({
      ok: true,
      json: async () => ({
        reply: "Mocked model proposal.",
        scene: { colors: { glow: "#112233" } },
        card: {
          type: "approval",
          id: "mock-late",
          prompt: "Use Late Friday?",
          proposal: { event: { title: "Late Friday", venue: "The Hall", time: "21:00", timeZone: "America/Edmonton" } },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<App />);
    });
    const page = () => container.querySelector(".event-page");
    expect(page()?.textContent).toContain("Friday night");
    expect(page()?.textContent).toContain("Venue not set");
    expect(page()?.textContent).toContain("Sample Ada");
    expect(page()?.textContent).toContain("NOT SENT");
    expect(page()?.getAttribute("data-style")).toBe("calm");

    const ask = container.querySelector("#ask") as HTMLTextAreaElement;
    await act(async () => setField(ask, "How many friends said yes?"));
    await act(async () => buttonNamed(container, "↑").click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1 yes in Friends");
    expect(container.textContent).toContain("Sample Ada");

    await act(async () => setField(ask, "Please retitle this night"));
    await act(async () => buttonNamed(container, "↑").click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request.body)).guestFacts).toContain("Sample Ada");
    expect(page()?.textContent).not.toContain("The Hall");

    await act(async () => buttonNamed(container, "Accept").click());
    expect(page()?.textContent).toContain("Late Friday");
    expect(page()?.textContent).toContain("The Hall");
    expect(page()?.textContent).toContain("21:00 · America/Edmonton");
    expect(page()?.textContent).toContain("NOT SENT");
    expect(page()?.textContent).not.toContain("Venue not set");
    expect(container.textContent).toContain("Applied in this session");
    expect(page()?.getAttribute("style")).not.toContain("#112233");
    expect(buttonNamed(container, "Accept")).toBeUndefined();
    expect(container.querySelectorAll(".event-page h2")).toHaveLength(1);
  });

  it("keeps a typed change behind accept, counts the new sample guest, and restores text after refresh", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<App />);
    });
    const ask = () => container.querySelector("#ask") as HTMLTextAreaElement;
    const page = () => container.querySelector(".event-page");

    await act(async () => setField(ask(), "Set the title to Kept Night"));
    await act(async () => buttonNamed(container, "↑").click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(page()?.querySelector("h2")?.textContent).toBe("Friday night");
    await act(async () => buttonNamed(container, "Accept").click());
    expect(page()?.querySelector("h2")?.textContent).toBe("Kept Night");

    await act(async () => setField(ask(), "Add sample guest Sample Jo to Friends as yes"));
    await act(async () => buttonNamed(container, "↑").click());
    await act(async () => buttonNamed(container, "Accept").click());
    await act(async () => setField(ask(), "How many friends said yes?"));
    await act(async () => buttonNamed(container, "↑").click());
    expect(container.textContent).toContain("2 yes in Friends");
    expect(container.textContent).toContain("Sample Jo");
    expect(container.textContent).toContain("Sample Ada");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    expect(container.querySelector(".event-page h2")?.textContent).toBe("Kept Night");
    expect(container.textContent).toContain("Sample Jo");
    expect(container.textContent).toContain("Closing the tab clears them");
  });
});
