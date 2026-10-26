import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/service";

// The design lab never talks to a backend. Only the auth layer is faked, the same way App.test.tsx does it.
const state = vi.hoisted(() => ({ user: null as AuthUser | null }));

vi.mock("../auth/service", () => ({
  subscribeToAuth: async (onUser: (u: AuthUser | null) => void) => {
    queueMicrotask(() => onUser(state.user));
    return () => {};
  },
  currentUser: async () => state.user,
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock("../lib/webgl", () => ({ hasWebGL: () => false, prefersReducedMotion: () => false }));

import { AppRoutes } from "../App";
import { AuthProvider } from "../auth/AuthProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { openChannel, parseMessage, STORAGE_KEY, type Message } from "./show/channel";
import RepPhone, { DROP_COOLDOWN_MS } from "./pages/RepPhone";
import VenueScreen from "./pages/VenueScreen";
import { applyRep, DROP_GAP_MS, INITIAL_REMOTE } from "./show/remote";
import { CAPACITY, crowdAt, foundingCount, handle, levels, moodAt, questionResults, sceneAt, zoneLevel, ZONES, FOUNDING_TOTAL } from "./show/sim";

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

const signedIn = { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" };
const PATHS = ["/app", "/app/pass", "/app/passport", "/app/discover", "/app/artist", "/app/live", "/app/rep"];

/** A stand-in for BroadcastChannel: a message reaches every other open channel with the same name, never the sender. */
class FakeChannel {
  static all: FakeChannel[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent);
  }
  close() {
    FakeChannel.all = FakeChannel.all.filter((c) => c !== this);
  }
}

beforeEach(() => {
  state.user = signedIn;
  localStorage.clear();
  FakeChannel.all = [];
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  // jsdom has no canvas. The visuals simply skip drawing when there is no 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("design lab access", () => {
  it.each(PATHS)("sends signed-out visitors from %s to sign in", async (path) => {
    state.user = null;
    renderAt(path);
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  });

  it("sends signed-out visitors from the old rewards address to sign in too", async () => {
    state.user = null;
    renderAt("/app/rewards");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  });

  it("links to the lab from the welcome page", async () => {
    renderAt("/welcome");
    const link = await screen.findByRole("link", { name: /take a look around/i });
    expect(link.getAttribute("href")).toBe("/app");
  });
});

describe("design lab pages render", () => {
  const pages: [string, RegExp][] = [
    ["/app", /pick a screen/i],
    ["/app/pass", /your pass/i],
    ["/app/passport", /your passport/i],
    ["/app/discover", /coming up/i],
    ["/app/artist", /your fans/i],
    ["/app/rep", /rep phone/i],
  ];

  it.each(pages)("%s renders its heading and the Demo marker without errors", async (path, heading) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
  });

  it("renders the venue screen on its own, outside the lab shell", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/app/live");
    expect(await screen.findByRole("heading", { level: 1, name: "Venue screen" })).toBeTruthy();
    expect(document.querySelector(".lab")).toBeNull();
    expect(screen.queryByText("Demo")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("moves the old rewards address to the rep phone", async () => {
    renderAt("/app/rewards");
    expect(await screen.findByRole("heading", { level: 1, name: /rep phone/i })).toBeTruthy();
  });

  it("lists the six pages on the hub in three groups", async () => {
    renderAt("/app");
    for (const g of ["Fan", "Artist", "Show night"]) {
      expect(await screen.findByRole("heading", { level: 2, name: g })).toBeTruthy();
    }
    const links = screen.getAllByRole("link").filter((l) => l.classList.contains("hub-item"));
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Pass"),
      expect.stringContaining("Passport"),
      expect.stringContaining("Discover"),
      expect.stringContaining("Verified fans"),
      expect.stringContaining("Venue screen"),
      expect.stringContaining("Rep phone"),
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/app/pass", "/app/passport", "/app/discover", "/app/artist", "/app/live", "/app/rep"]);
  });

  it("shows a pass code and a checked-in state", async () => {
    renderAt("/app/pass");
    expect(await screen.findByLabelText(/pass code/i)).toBeTruthy();
    expect(screen.queryByText("Checked in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(screen.getByText("Checked in")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.queryByText("Checked in")).toBeNull();
  });

  it("filters shows by genre chip on discover", async () => {
    renderAt("/app/discover");
    const chips = await screen.findByRole("group", { name: /filter by genre/i });
    fireEvent.click(within(chips).getByRole("button", { name: "DnB" }));
    expect(screen.getByRole("heading", { name: "Rattle & Hum" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Deep Cargo" })).toBeNull();
  });
});

describe("light and dark", () => {
  it("always offers the dark/light switch and keeps the lab in step with it", async () => {
    renderAt("/app");
    const toggle = await screen.findByRole("button", { name: /switch to light mode/i });
    const root = document.querySelector(".lab")!;
    expect(root.classList.contains("is-dark")).toBe(true);
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(root.classList.contains("is-light")).toBe(true);
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeTruthy();
  });

  it("keeps the rep phone in the lab shell, so it follows the toggle", async () => {
    renderAt("/app/rep");
    await screen.findByRole("heading", { level: 1, name: /rep phone/i });
    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.querySelector(".lab")!.classList.contains("is-light")).toBe(true);
  });

  it("ignores and clears the look and view choices that earlier previews stored", async () => {
    localStorage.setItem("razzberry-lab-style", "old-look");
    localStorage.setItem("razzberry-lab-role", "artist");
    renderAt("/app");
    await screen.findByRole("heading", { level: 1, name: /pick a screen/i });
    expect(document.querySelector(".lab")!.classList.contains("is-dark")).toBe(true);
    expect(localStorage.getItem("razzberry-lab-style")).toBeNull();
    expect(localStorage.getItem("razzberry-lab-role")).toBeNull();
  });
});

function renderPair() {
  const screenView = render(
    <MemoryRouter>
      <VenueScreen />
    </MemoryRouter>,
  );
  const repView = render(<RepPhone />);
  return { screenView, repView };
}

const screenRoot = () => document.querySelector(".vs") as HTMLElement;

describe("venue screen", () => {
  it("starts on its own night and shows the first scene", async () => {
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    expect(screenRoot().dataset.scene).toBe("brush");
    expect(screenRoot().dataset.black).toBe("off");
    expect(screen.queryByText("Rep connected")).toBeNull();
  });

  it("moves through the scenes by itself as the night plays", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    fireEvent.click(screen.getByRole("button", { name: "4x" }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screenRoot().dataset.scene).not.toBe("brush");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screenRoot().dataset.scene).toBe("closing");
    expect(screen.getByText("Thank you, Calgary")).toBeTruthy();
    // The night ends and stops, ready to replay.
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("switches scenes from the control strip, and back to auto", () => {
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Skyline" }));
    expect(screenRoot().dataset.scene).toBe("skyline");
    expect(screen.getByRole("img", { name: /skyline/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Founding fans" }));
    expect(screenRoot().dataset.scene).toBe("wall");
    expect(screen.getByRole("heading", { name: "Founding fans" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Closing" }));
    expect(screen.getByText("Thank you, Calgary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(screenRoot().dataset.scene).toBe("brush");
  });

  it("lets the crowd and mood sliders take over, and the fan wall fill up", () => {
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Founding fans" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.change(screen.getByRole("slider", { name: "Crowd size" }), { target: { value: String(CAPACITY) } });
    expect(screen.getAllByRole("listitem")).toHaveLength(FOUNDING_TOTAL);
    expect(document.querySelectorAll(".vs-chip.is-new")).toHaveLength(1);
    fireEvent.change(screen.getByRole("slider", { name: /mood/i }), { target: { value: "90" } });
    expect(screen.getByText("Heavy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Follow the night" }));
    expect(screen.getByRole("button", { name: "Follow the night" }).hasAttribute("disabled")).toBe(true);
  });

  it("cuts to black and back, from the button and the B key", () => {
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    const layer = screen.getByTestId("black-layer");
    expect(layer.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Black screen" }));
    expect(layer.hasAttribute("hidden")).toBe(false);
    expect(screenRoot().dataset.black).toBe("on");
    fireEvent.click(screen.getByRole("button", { name: "Black screen" }));
    expect(layer.hasAttribute("hidden")).toBe(true);
    fireEvent.keyDown(window, { key: "b" });
    expect(screenRoot().dataset.black).toBe("on");
    fireEvent.keyDown(window, { key: "b" });
    expect(screenRoot().dataset.black).toBe("off");
  });

  it("calms its motion when the visitor asks for less", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    expect(screenRoot().classList.contains("is-calm")).toBe(true);
  });

  it("is always dark and has a way out", () => {
    render(
      <MemoryRouter>
        <VenueScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /exit/i }).getAttribute("href")).toBe("/app");
    expect(screen.getByRole("button", { name: /full screen/i })).toBeTruthy();
  });
});

describe("rep phone and venue screen together", () => {
  it("shows the big controls, one hint line and a demo-only idea", () => {
    render(<RepPhone />);
    expect(screen.getByRole("button", { name: /drop/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^scene/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Black screen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "ASK THE ROOM" })).toBeTruthy();
    expect(screen.getByText("Open the Venue screen in another tab to see it respond.")).toBeTruthy();
    expect(screen.getByText(/AI idea · demo/)).toBeTruthy();
    expect(screen.getByText("No screen yet")).toBeTruthy();
  });

  it("sends a Drop that bursts on the screen, then rests before the next one", () => {
    vi.useFakeTimers();
    renderPair();
    expect(screen.queryByTestId("drop-burst")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "DROP" }));
    expect(screen.getByTestId("drop-burst")).toBeTruthy();
    expect(screen.getByText("Drop sent")).toBeTruthy();
    expect(screen.getByText("Rep connected")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const btn = screen.getByRole("button", { name: /drop|wait/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(DROP_COOLDOWN_MS);
    });
    expect((screen.getByRole("button", { name: "DROP" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("changes the screen's scene from the rep phone, and the screen echoes it back", () => {
    vi.useFakeTimers();
    renderPair();
    fireEvent.click(screen.getByRole("button", { name: "Skyline" }));
    expect(screenRoot().dataset.scene).toBe("skyline");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText("Screen linked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^scene/i }));
    expect(screenRoot().dataset.scene).toBe("wall");
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(screenRoot().dataset.scene).toBe("brush");
  });

  it("cuts the screen to black and back from the rep phone", () => {
    vi.useFakeTimers();
    renderPair();
    const layer = screen.getByTestId("black-layer");
    fireEvent.click(screen.getByRole("button", { name: "Black screen" }));
    expect(layer.hasAttribute("hidden")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(screen.getByRole("button", { name: "Back on" }));
    expect(layer.hasAttribute("hidden")).toBe(true);
  });

  it("asks the room a question and shows the bar on both screens", () => {
    vi.useFakeTimers();
    renderPair();
    fireEvent.click(screen.getByRole("button", { name: "Heavier or smoother?" }));
    expect(screen.getAllByText("Heavier or smoother?").length).toBeGreaterThan(1);
    expect(screen.getByRole("status", { name: /Heavier \d+, Smoother \d+/ })).toBeTruthy();
    // With the crowd slider up, answers trickle in over a few seconds.
    fireEvent.click(screen.getByRole("button", { name: "Controls" }));
    fireEvent.change(screen.getByRole("slider", { name: "Crowd size" }), { target: { value: "500" } });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    const label = screen.getByRole("status", { name: /Heavier \d+, Smoother \d+/ }).getAttribute("aria-label")!;
    const [a, b] = label.match(/\d+/g)!.map(Number);
    expect(a + b).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Heavier or smoother?", pressed: true }));
    expect(screen.queryByRole("status", { name: /Heavier \d+, Smoother \d+/ })).toBeNull();
  });

  it("works alone: its own made-up numbers, an answer bar, and a demo idea it can accept or skip", () => {
    vi.useFakeTimers();
    render(<RepPhone />);
    fireEvent.click(screen.getByRole("button", { name: "Brighter or darker?" }));
    expect(screen.getByRole("status", { name: /Brighter \d+, Darker \d+/ })).toBeTruthy();
    expect(screen.getByText("Show the skyline")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Ask: brighter or darker?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByText("Show the fan wall")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Brighter or darker?" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("rep to screen messages", () => {
  const at = 1_000_000;

  it("reads only messages it knows", () => {
    expect(parseMessage({ type: "drop" })).toEqual({ type: "drop" });
    expect(parseMessage({ type: "scene", scene: "wall" })).toEqual({ type: "scene", scene: "wall" });
    expect(parseMessage({ type: "scene", scene: null })).toEqual({ type: "scene", scene: null });
    expect(parseMessage({ type: "scene", scene: "disco" })).toBeNull();
    expect(parseMessage({ type: "black", on: true })).toEqual({ type: "black", on: true });
    expect(parseMessage({ type: "black", on: "yes" })).toBeNull();
    expect(parseMessage({ type: "question", id: "q1" })).toEqual({ type: "question", id: "q1" });
    expect(parseMessage({ type: "question", id: 4 })).toBeNull();
    expect(parseMessage({ type: "state", count: 10, mood: 0.5, scene: "brush", black: false, question: null })).toMatchObject({ type: "state", count: 10 });
    expect(parseMessage({ type: "state", count: "10" })).toBeNull();
    expect(parseMessage({ type: "explode" })).toBeNull();
    expect(parseMessage("drop")).toBeNull();
    expect(parseMessage(null)).toBeNull();
  });

  it("applies scene, black and question messages", () => {
    let s = applyRep(INITIAL_REMOTE, { type: "scene", scene: "skyline" }, at);
    expect(s.sceneLock).toBe("skyline");
    s = applyRep(s, { type: "scene", scene: null }, at);
    expect(s.sceneLock).toBeNull();
    s = applyRep(s, { type: "black", on: true }, at);
    expect(s.black).toBe(true);
    s = applyRep(s, { type: "black", on: false }, at);
    expect(s.black).toBe(false);
    s = applyRep(s, { type: "question", id: "q2" }, at);
    expect(s.question).toEqual({ id: "q2", at });
    s = applyRep(s, { type: "question", id: null }, at);
    expect(s.question).toBeNull();
  });

  it("never lets drops burst faster than one every few seconds", () => {
    let s = applyRep(INITIAL_REMOTE, { type: "drop" }, at);
    expect(s.dropN).toBe(1);
    s = applyRep(s, { type: "drop" }, at + 500);
    s = applyRep(s, { type: "drop" }, at + DROP_GAP_MS - 1);
    expect(s.dropN).toBe(1);
    s = applyRep(s, { type: "drop" }, at + DROP_GAP_MS);
    expect(s.dropN).toBe(2);
    expect(DROP_COOLDOWN_MS).toBeGreaterThanOrEqual(DROP_GAP_MS);
  });

  it("ignores messages that are not commands", () => {
    expect(applyRep(INITIAL_REMOTE, { type: "ping" }, at)).toBe(INITIAL_REMOTE);
  });

  it("passes messages to the other tab, never back to the sender", () => {
    const heardA: Message[] = [];
    const heardB: Message[] = [];
    const a = openChannel((m) => heardA.push(m));
    const b = openChannel((m) => heardB.push(m));
    a.post({ type: "drop" });
    expect(heardB).toEqual([{ type: "drop" }]);
    expect(heardA).toEqual([]);
    a.close();
    b.close();
  });

  it("falls back to localStorage when BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const heard: Message[] = [];
    const ch = openChannel((m) => heard.push(m));
    ch.post({ type: "black", on: true });
    const written = localStorage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(written).msg).toEqual({ type: "black", on: true });
    // The other tab gets a storage event for the same value. Junk and unknown keys are ignored.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: written }));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "{not json" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: written }));
    expect(heard).toEqual([{ type: "black", on: true }]);
    ch.close();
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: written }));
    expect(heard).toHaveLength(1);
  });
});

describe("the simulated night", () => {
  it("fills the room and feels heavier at the peak, then settles", () => {
    expect(crowdAt(0)).toBeLessThan(0.05);
    for (let i = 1; i <= 100; i++) expect(crowdAt(i / 100)).toBeGreaterThanOrEqual(crowdAt((i - 1) / 100) - 1e-9);
    expect(crowdAt(1)).toBeGreaterThan(0.9);
    expect(moodAt(0.65)).toBeGreaterThan(moodAt(0.05) + 0.3);
    expect(moodAt(1)).toBeLessThan(moodAt(0.65));
    for (let i = 0; i <= 100; i++) {
      expect(moodAt(i / 100)).toBeGreaterThanOrEqual(0);
      expect(moodAt(i / 100)).toBeLessThanOrEqual(1);
    }
  });

  it("runs the four scenes in order", () => {
    expect([0, 0.3, 0.6, 0.9].map(sceneAt)).toEqual(["brush", "skyline", "wall", "closing"]);
  });

  it("lets sliders override the night", () => {
    expect(levels(0, 0.5, 0.9)).toEqual({ crowd: 0.5, mood: 0.9, count: CAPACITY / 2 });
    expect(levels(0, 3, -2)).toMatchObject({ crowd: 1, mood: 0 });
  });

  it("lights big areas first and every area as the room fills", () => {
    const beltline = ZONES.find((z) => z.id === "beltline")!;
    const airdrie = ZONES.find((z) => z.id === "airdrie")!;
    expect(zoneLevel(beltline, 0.2)).toBeGreaterThan(zoneLevel(airdrie, 0.2));
    expect(zoneLevel(airdrie, 0.05)).toBe(0);
    for (const z of ZONES) expect(zoneLevel(z, 1)).toBeGreaterThan(0.3);
  });

  it("makes fake fans, up to a limit", () => {
    expect(handle(0)).toMatch(/^@[a-z]+\.[a-z]+$/);
    expect(new Set(Array.from({ length: FOUNDING_TOTAL }, (_, i) => handle(i))).size).toBe(FOUNDING_TOTAL);
    expect(foundingCount(0)).toBe(0);
    expect(foundingCount(95)).toBe(9);
    expect(foundingCount(100000)).toBe(FOUNDING_TOTAL);
  });

  it("trickles in answers that add up to part of the room", () => {
    const [a0, b0] = questionResults("q1", 400, 0.8, 0);
    expect(a0 + b0).toBe(0);
    const [a, b] = questionResults("q1", 400, 0.8, 20000);
    expect(a + b).toBeGreaterThan(200);
    expect(a + b).toBeLessThanOrEqual(400);
    expect(a).toBeGreaterThan(b);
    const [c, d] = questionResults("q1", 400, 0.1, 20000);
    expect(d).toBeGreaterThan(c);
  });
});
