import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/service";
import type { Show } from "../data/types";

const state = vi.hoisted(() => ({
  user: null as AuthUser | null,
}));

const geo = vi.hoisted(() => ({ getPosition: vi.fn() }));
const media = vi.hoisted(() => ({ getUserMedia: vi.fn() }));

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

vi.mock("../data/api", () => ({
  listTonight: vi.fn(async () => []),
  listMyCheckIns: vi.fn(async () => new Set()),
  listMyNumbers: vi.fn(async () => []),
  getArtists: vi.fn(async () => new Map()),
  isAdmin: vi.fn(async () => false),
  checkIn: vi.fn(),
}));

vi.mock("../data/geo", () => geo);

import { AppRoutes } from "../App";
import { AuthProvider } from "../auth/AuthProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { checkIn, listMyCheckIns, listTonight } from "../data/api";

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

const HOUR = 3600_000;
const show = (id: string, startOffsetH: number): Show => ({
  id,
  venue: `Venue ${id}`,
  lat: 51,
  lng: -114,
  startsAt: new Date(Date.now() + startOffsetH * HOUR),
  endsAt: new Date(Date.now() + (startOffsetH + 3) * HOUR),
  artistIds: ["nova"],
  artistNames: ["NOVA"],
  });

beforeEach(() => {
  state.user = null;
  localStorage.clear();
  geo.getPosition.mockReset();
  media.getUserMedia.mockReset();
  vi.mocked(listTonight).mockResolvedValue([]);
  vi.mocked(listMyCheckIns).mockResolvedValue(new Set());
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: media.getUserMedia } });
});

afterEach(cleanup);

describe("sample world", () => {
  it("opens from sign-in without an account", async () => {
    renderAt("/signin");
    fireEvent.click(await screen.findByRole("link", { name: "Try the UI demo" }));
    expect(await screen.findByRole("heading", { name: "NOVA" })).toBeTruthy();
    expect(screen.getByText("Sample")).toBeTruthy();
    expect(screen.getByText(/28 here · sample/)).toBeTruthy();
  });

  it("follows, enters, and confirms I'm here without location or a microphone", async () => {
    renderAt("/demo");
    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
    expect(screen.getByRole("button", { name: "Following" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Enter Friday" }));
    expect(await screen.findByRole("heading", { name: /NOVA \/ Friday/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I'm here" }));
    expect((await screen.findAllByText(/location was not used/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/29 here · sample/)).toBeTruthy();
    expect(geo.getPosition).not.toHaveBeenCalled();
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
  });

  it("previews and cancels an edit locally, and says voice mode is not listening", async () => {
    renderAt("/demo");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit preview" })).toBeTruthy();
    expect(screen.getByText(/not listening/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voice mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert sample phrase" }));
    expect((screen.getByLabelText("Event line") as HTMLInputElement).value).toBe("Create Friday's event");
    fireEvent.change(screen.getByLabelText("Event line"), { target: { value: "violet room" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/Previewing Violet/)).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Friday")).toBeTruthy();
    expect(screen.queryByText("Draft")).toBeNull();
    expect(media.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("signed-in world", () => {
  beforeEach(() => {
    state.user = { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" };
  });

  it("shows an empty room without a sample count", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Your world" })).toBeTruthy();
    expect((await screen.findAllByText("No show today.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Sample")).toBeNull();
    expect(screen.queryByText(/here · sample/)).toBeNull();
    expect((screen.getByRole("link", { name: "Numbers" }) as HTMLAnchorElement).getAttribute("href")).toBe("/numbers");
  });

  it("enters a real show and asks for location only from I'm here", async () => {
    vi.mocked(listTonight).mockResolvedValue([show("live", -1)]);
    geo.getPosition.mockResolvedValue({ lat: 51, lng: -114, accuracy: 8 });
    vi.mocked(checkIn).mockResolvedValue({ status: "checked-in", artists: [] });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "NOVA" })).toBeTruthy();
    expect(screen.getAllByText(/Venue live/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Enter Venue live" }));
    fireEvent.click(await screen.findByRole("button", { name: "I'm here" }));
    expect(await screen.findByText(/location once/i)).toBeTruthy();
    await waitFor(() => expect(geo.getPosition).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(checkIn).toHaveBeenCalledWith("live", { lat: 51, lng: -114, accuracy: 8 }));
  });
});
