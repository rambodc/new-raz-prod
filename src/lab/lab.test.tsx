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

beforeEach(() => {
  state.user = signedIn;
  localStorage.clear();
});

afterEach(cleanup);

describe("design lab access", () => {
  it.each(["/app", "/app/pass", "/app/live", "/app/passport", "/app/rewards", "/app/discover", "/app/artist"])("sends signed-out visitors from %s to sign in", async (path) => {
    state.user = null;
    renderAt(path);
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  });

  it("links to the lab from the welcome page", async () => {
    renderAt("/welcome");
    const link = await screen.findByRole("link", { name: /explore six new screens/i });
    expect(link.getAttribute("href")).toBe("/app");
  });
});

describe("design lab pages render", () => {
  const pages: [string, RegExp][] = [
    ["/app", /six ways razzberry/i],
    ["/app/pass", /your pass/i],
    ["/app/live", /nightshift/i],
    ["/app/passport", /where you/i],
    ["/app/rewards", /keep the/i],
    ["/app/discover", /find your/i],
    ["/app/artist", /fans who were/i],
  ];

  it.each(pages)("%s renders its heading and the demo-data footer without errors", async (path, heading) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByText(/demo data — design preview/i)).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("shows a rotating presence code and a checked-in state on the show pass", async () => {
    renderAt("/app/pass");
    expect(await screen.findByLabelText(/presence code/i)).toBeTruthy();
    expect(screen.queryByText("Checked in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /simulate rep confirmation/i }));
    expect(screen.getByText("Checked in")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reset demo/i }));
    expect(screen.queryByText("Checked in")).toBeNull();
  });

  it("lets a fan vote locally on the live show", async () => {
    renderAt("/app/live");
    const option = await screen.findByRole("button", { name: /rolling and hypnotic/i });
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

describe("design lab styles and roles", () => {
  it("switches between Aurora and Cinematic, persists the choice, and locks Cinematic to dark", async () => {
    renderAt("/app");
    const aurora = await screen.findByRole("radio", { name: "Aurora", checked: true });
    expect(aurora).toBeTruthy();
    const root = document.querySelector(".lab")!;
    expect(root.classList.contains("lab--aurora")).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Cinematic" }));
    expect(root.classList.contains("lab--cinematic")).toBe(true);
    expect(localStorage.getItem("razzberry-lab-style")).toBe("cinematic");
    expect(root.classList.contains("is-dark")).toBe(true);
    const toggle = screen.getByRole("button", { name: /cinematic is always dark/i }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });

  it("keeps the site light/dark switch working for Aurora", async () => {
    renderAt("/app");
    const toggle = await screen.findByRole("button", { name: /switch to light mode/i });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector(".lab")!.classList.contains("is-light")).toBe(true);
  });

  it("lists the artist page under Artist view and the fan pages under Fan view", async () => {
    renderAt("/app/artist");
    const nav = await screen.findByRole("navigation", { name: /design lab pages/i });
    expect(within(nav).getByRole("link", { name: "Verified fans" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Show pass" })).toBeNull();
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

describe("timers", () => {
  it("ticks the live show clock without crashing", async () => {
    vi.useFakeTimers();
    try {
      renderAt("/app/live");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000);
      });
      expect(screen.getAllByText(/verified in the room/i).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
