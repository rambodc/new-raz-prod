import { act } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { readPhoto, requestImage } from "../image/client";

vi.mock("../image/client", async () => {
  const actual = await vi.importActual<typeof import("../image/client")>("../image/client");
  return { ...actual, readPhoto: vi.fn(), requestImage: vi.fn() };
});

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function setField(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function buttonNamed(container: HTMLElement, name: string) {
  return [...container.querySelectorAll("button")].find((button) => (button.textContent || "").trim() === name && !button.disabled) as HTMLButtonElement | undefined;
}

function ask(container: HTMLElement) {
  return container.querySelector("#ask") as HTMLTextAreaElement;
}

async function openPageChat(container: HTMLElement) {
  await act(async () => container.querySelector(".event-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => buttonNamed(container, "Page chat")?.click());
}

describe("event page editor", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(readPhoto).mockReset();
    vi.mocked(requestImage).mockReset();
    URL.createObjectURL = () => "blob:photo";
    URL.revokeObjectURL = () => undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("opens the full page from the card, edits it in page chat, and keeps main history", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.mode === "search") {
        return { ok: true, json: async () => ({ reply: "A listening room is a quiet room.", sources: [{ url: "https://example.com/room", title: "Listening rooms", host: "example.com" }] }) };
      }
      return {
        ok: true,
        json: async () => ({
          reply: "Mocked model proposal.",
          scene: { colors: { glow: "#112233" } },
          card: { type: "approval", id: "mock-late", prompt: "Use Late Friday?", proposal: { event: { title: "Late Friday", venue: "The Hall", time: "21:00", timeZone: "America/Edmonton" } } },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<App />));
    expect(container.querySelector("main")?.getAttribute("data-surface")).toBe("main");
    expect(container.querySelector(".event-page")).toBeNull();
    expect(container.querySelector(".event-card")?.textContent).toContain("Friday night");
    expect(container.querySelector(".event-card")?.textContent).toContain("Open event");

    const log = container.querySelector(".log") as HTMLElement;
    log.scrollTop = 80;
    await act(async () => container.querySelector(".event-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("main")?.getAttribute("data-surface")).toBe("event");
    const page = () => container.querySelector(".event-page");
    expect(page()?.querySelector("h2")?.textContent).toBe("Friday night");
    expect(page()?.textContent).toContain("Sample Ada");
    expect(page()?.textContent).toContain("NOT SENT");
    expect(page()?.textContent).toContain("Venue not set");
    expect(page()?.getAttribute("data-style")).toBe("calm");

    await act(async () => buttonNamed(container, "Page chat")?.click());
    expect(container.querySelector("main")?.getAttribute("data-surface")).toBe("page");
    expect(container.textContent).toContain("Edit image sends a photo");
    await act(async () => setField(ask(container), "How many friends said yes?"));
    await act(async () => buttonNamed(container, "↑")?.click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1 yes in Friends");
    expect(container.textContent).toContain("Sample Ada");

    await act(async () => setField(ask(container), "Please retitle this night"));
    await act(async () => buttonNamed(container, "↑")?.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).guestFacts).toContain("Sample Ada");
    expect(page()).toBeNull();
    await act(async () => buttonNamed(container, "Accept")?.click());
    expect(container.textContent).toContain("Applied in this session");
    await act(async () => buttonNamed(container, "Back")?.click());
    expect(page()?.querySelector("h2")?.textContent).toBe("Late Friday");
    expect(page()?.textContent).toContain("The Hall");
    expect(page()?.textContent).toContain("21:00 · America/Edmonton");
    expect(page()?.textContent).toContain("NOT SENT");
    expect(page()?.textContent).not.toContain("Venue not set");
    expect(buttonNamed(container, "Accept")).toBeUndefined();
    await act(async () => buttonNamed(container, "Back")?.click());
    expect(container.querySelector("main")?.getAttribute("data-surface")).toBe("main");
    expect(container.querySelector(".event-card")?.textContent).toContain("Late Friday");
    expect(container.querySelector(".event-card")?.textContent).toContain("The Hall");
    expect(container.textContent).not.toContain("Please retitle this night");
    expect((container.querySelector(".log") as HTMLElement).scrollTop).toBe(80);
    expect(container.querySelector(".event-page h2")).toBeNull();
  });

  it("keeps a compound edit behind accept and restores text without the photo", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await act(async () => root.render(<App />));
    await openPageChat(container);
    await act(async () => setField(ask(container), "Midnight Drop at Sample Lounge on Dec31 at 21:00"));
    await act(async () => buttonNamed(container, "↑")?.click());
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => buttonNamed(container, "Not now")?.click());
    await act(async () => buttonNamed(container, "Back")?.click());
    expect(container.querySelector(".event-page h2")?.textContent).toBe("Friday night");
    await act(async () => buttonNamed(container, "Page chat")?.click());
    await act(async () => setField(ask(container), "Set the title to Kept Night"));
    await act(async () => buttonNamed(container, "↑")?.click());
    await act(async () => buttonNamed(container, "Accept")?.click());
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => root.render(<App />));
    expect(container.querySelector(".event-card")?.textContent).toContain("Kept Night");
    expect(sessionStorage.getItem("razzberry-event-session")).not.toMatch(/base64|data:image/);
    await act(async () => container.querySelector(".event-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".event-page h2")?.textContent).toBe("Kept Night");
    expect(container.textContent).toContain("Closing the tab clears them");
    expect(container.querySelector(".event-figure img")).toBeNull();
  });

  it("previews an uploaded edit without replacing the original, then applies it", async () => {
    vi.mocked(readPhoto).mockResolvedValue({ blob: new Blob([Uint8Array.from([1, 2, 3])], { type: "image/jpeg" }), mime: "image/jpeg" });
    vi.mocked(requestImage).mockResolvedValue({ image: PNG, mime: "image/png", kind: "ai-edited", model: "grok-imagine-image-2.0" });
    await act(async () => root.render(<App />));
    await openPageChat(container);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["photo"], "person.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector(".image-card")?.getAttribute("data-image-kind")).toBe("original");
    expect(container.textContent).toContain("Not uploaded yet");
    await act(async () => setField(ask(container), "Warm dusk light"));
    await act(async () => buttonNamed(container, "Edit image")?.click());
    expect(requestImage).toHaveBeenCalledTimes(1);
    const request = vi.mocked(requestImage).mock.calls[0][0];
    expect(request.action).toBe("edit");
    expect(request.prompt).toBe("Warm dusk light");
    expect(request.blob).toBeInstanceOf(Blob);
    expect(container.querySelectorAll(".image-card")).toHaveLength(2);
    expect(container.querySelectorAll("[data-image-kind='original']")).toHaveLength(1);
    expect(container.querySelector("[data-image-kind='ai-edited']")).not.toBeNull();
    expect(container.textContent).toContain("AI-edited preview");
    const edited = container.querySelector("[data-image-kind='ai-edited']") as HTMLElement;
    const use = [...edited.querySelectorAll("button")].find((button) => button.textContent === "Foreground");
    await act(async () => use?.click());
    await act(async () => buttonNamed(container, "Back")?.click());
    expect(container.querySelector(".event-figure")?.getAttribute("data-image-kind")).toBe("ai-edited");
    expect(container.querySelector(".event-page")?.textContent).toContain("AI-edited");
    expect(container.querySelector(".event-page h2")?.textContent).toBe("Friday night");
  });

  it("shows search sources and does not send a sample name or a photo", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({
      ok: true,
      json: async () => ({ reply: "A listening room is quiet.", sources: [{ url: "https://example.com/room", title: "Listening rooms", host: "example.com" }, { url: "javascript:alert(1)", title: "Bad", host: "bad" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<App />));
    await act(async () => setField(ask(container), "Search the web for Sample Ada"));
    await act(async () => buttonNamed(container, "↑")?.click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("sample list");
    await act(async () => setField(ask(container), "Search the web for what a listening room is"));
    await act(async () => buttonNamed(container, "↑")?.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ mode: "search", query: "what a listening room is" });
    expect(container.querySelector(".source-list a")?.getAttribute("href")).toBe("https://example.com/room");
    expect(container.querySelector(".source-list")?.textContent).not.toContain("javascript:");
    const link = container.querySelector(".source-list a") as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  it("follows the visible viewport when a keyboard is simulated", async () => {
    const viewport = { height: 430, offsetTop: 0, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    await act(async () => root.render(<App />));
    const main = container.querySelector("main") as HTMLElement;
    expect(main.style.height).toBe("430px");
    expect(main.className).toContain("is-short");
    viewport.height = 844;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(main.style.height).toBe("844px");
    expect(main.className).not.toContain("is-short");
  });
});
