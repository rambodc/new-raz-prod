import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { codeState, formatClock, presenceCode } from "./hooks";

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
const PATHS = ["/app", "/app/pass", "/app/live", "/app/passport", "/app/rewards", "/app/discover", "/app/artist"];

beforeEach(() => {
  state.user = signedIn;
  localStorage.clear();
});

afterEach(cleanup);

describe("design lab access", () => {
  it.each(PATHS)("sends signed-out visitors from %s to sign in", async (path) => {
    state.user = null;
    renderAt(path);
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
    ["/app/live", /live now/i],
    ["/app/passport", /your passport/i],
    ["/app/rewards", /your streak/i],
    ["/app/discover", /coming up/i],
    ["/app/artist", /your fans/i],
  ];

  it.each(pages)("%s renders its heading and the Demo marker without errors", async (path, heading) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("lists the six pages on the hub, grouped Fan and Artist", async () => {
    renderAt("/app");
    const hub = await screen.findByRole("heading", { level: 2, name: "Fan" });
    expect(hub).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Artist" })).toBeTruthy();
    const links = screen.getAllByRole("link").filter((l) => l.classList.contains("hub-item"));
    expect(links.map((l) => l.getAttribute("href"))).toEqual(PATHS.slice(1));
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

  it("lets a fan vote locally on the live page", async () => {
    renderAt("/app/live");
    const option = await screen.findByRole("button", { name: /smoother/i });
    expect(option.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(option);
    expect(option.getAttribute("aria-pressed")).toBe("true");
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

describe("presence code", () => {
  it("is deterministic per 30 second window and changes between windows", () => {
    expect(presenceCode(100)).toBe(presenceCode(100));
    expect(presenceCode(100)).not.toBe(presenceCode(101));
    expect(presenceCode(7)).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  });

  it("counts down inside a window", () => {
    const start = 1_800_000_000_000 - (1_800_000_000_000 % 30_000);
    expect(codeState(start).secondsLeft).toBe(30);
    expect(codeState(start + 29_500).secondsLeft).toBe(1);
    expect(codeState(start + 30_000).code).not.toBe(codeState(start).code);
  });

  it("formats clocks", () => {
    expect(formatClock(75)).toBe("01:15");
    expect(formatClock(4300)).toBe("1:11:40");
  });
});
