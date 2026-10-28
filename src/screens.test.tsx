import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "./auth/service";
import type { Artist, Show } from "./data/types";

// Firebase is replaced by in-memory fakes: the screens only ever talk to ./data/api and ./data/geo.
const h = vi.hoisted(() => ({
  user: { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" } as AuthUser | null,
  admin: false,
  api: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("./auth/service", () => ({
  subscribeToAuth: async (onUser: (u: AuthUser | null) => void) => {
    queueMicrotask(() => onUser(h.user));
    return () => {};
  },
  currentUser: async () => h.user,
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  signOutUser: vi.fn(),
}));

vi.mock("./data/api", () => {
  const names = ["listTonight", "listMyCheckIns", "listMyNumbers", "getArtists", "getArtist", "listPastShows", "checkIn", "isAdmin", "listAllShows", "listArtists", "createShow", "updateShowEnd", "deleteShow", "uploadArtistImage"];
  for (const n of names) h.api[n] = vi.fn();
  return h.api;
});

const geo = vi.hoisted(() => ({ getPosition: vi.fn() }));
vi.mock("./data/geo", () => geo);

import { AppRoutes } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";

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
const show = (id: string, startOffsetH: number, lengthH = 3, extra: Partial<Show> = {}): Show => ({
  id,
  venue: `Venue ${id}`,
  lat: 51.04,
  lng: -114.07,
  startsAt: new Date(Date.now() + startOffsetH * HOUR),
  endsAt: new Date(Date.now() + (startOffsetH + lengthH) * HOUR),
  artistIds: ["alpha", "beta"],
  artistNames: ["Alpha", "Beta"],
  ...extra,
});
const artist = (id: string, name: string, extra: Partial<Artist> = {}): Artist => ({ id, name, imageUrl: null, fanCount: 0, ...extra });

beforeEach(() => {
  h.user = { uid: "u1", displayName: "Ada Lovelace", email: "ada@example.com" };
  localStorage.clear();
  const a = h.api;
  for (const fn of Object.values(a)) fn.mockReset();
  a.listTonight.mockResolvedValue([]);
  a.listMyCheckIns.mockResolvedValue(new Set());
  a.listMyNumbers.mockResolvedValue([]);
  a.getArtists.mockResolvedValue(new Map());
  a.isAdmin.mockResolvedValue(false);
  a.listAllShows.mockResolvedValue([]);
  a.listArtists.mockResolvedValue([]);
  a.listPastShows.mockResolvedValue([]);
  geo.getPosition.mockReset();
});

afterEach(cleanup);

describe("home", () => {
  it("shows Tonight first, then your numbers, with simple empty states", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Tonight" })).toBeTruthy();
    expect(await screen.findByText("No shows today.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your numbers" })).toBeTruthy();
    expect(screen.getByText("Check in at a show to get your first number.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("lists tonight's shows with a big I'm here button when live, and a disabled one when not yet", async () => {
    h.api.listTonight.mockResolvedValue([show("live", -1), show("later", 4)]);
    renderAt("/");
    const cards = await screen.findAllByRole("listitem");
    const live = cards.find((c) => within(c).queryByText("Venue live"))!;
    const later = cards.find((c) => within(c).queryByText("Venue later"))!;
    expect(within(live).getByText("Alpha · Beta")).toBeTruthy();
    expect((within(live).getByRole("button", { name: "I'm here" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(later).getByRole("button", { name: "I'm here" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(later).getByText(/^Starts /)).toBeTruthy();
  });

  it("shows 'Checked in' instead of the button for a show the fan already checked in to", async () => {
    h.api.listTonight.mockResolvedValue([show("live", -1)]);
    h.api.listMyCheckIns.mockResolvedValue(new Set(["live"]));
    renderAt("/");
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Checked in")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I'm here" })).toBeNull();
  });

  it("shows one row per artist with a big number and an avatar when there is a picture", async () => {
    h.api.listMyNumbers.mockResolvedValue([
      { artistId: "alpha", artistName: "Alpha", count: 3 },
      { artistId: "beta", artistName: "Beta", count: 1 },
    ]);
    h.api.getArtists.mockResolvedValue(new Map([["alpha", artist("alpha", "Alpha", { imageUrl: "https://img.test/alpha.jpg" })]]));
    renderAt("/");
    const alpha = await screen.findByRole("link", { name: /Alpha/ });
    expect(alpha.getAttribute("href")).toBe("/artist/alpha");
    expect(within(alpha).getByLabelText("3 shows").textContent).toBe("3");
    expect(alpha.querySelector("img")?.getAttribute("src")).toBe("https://img.test/alpha.jpg");
    const beta = screen.getByRole("link", { name: /Beta/ });
    expect(within(beta).getByLabelText("1 show").textContent).toBe("1");
    expect(beta.querySelector("img")).toBeNull();
    expect(beta.querySelector(".avatar--blank")?.textContent).toBe("B");
  });

  it("offers the admin page only to admins", async () => {
    h.api.isAdmin.mockResolvedValue(true);
    renderAt("/");
    expect((await screen.findByRole("link", { name: "Admin" })).getAttribute("href")).toBe("/admin");
  });
});

describe("check-in", () => {
  async function openLive() {
    h.api.listTonight.mockResolvedValue([show("live", -1)]);
    renderAt("/");
    return screen.findByRole("button", { name: "I'm here" });
  }

  it("says why it needs your location first, asks once, calls the function and refreshes", async () => {
    let finish!: (v: unknown) => void;
    geo.getPosition.mockReturnValue(new Promise((r) => (finish = r)));
    h.api.checkIn.mockResolvedValue({ status: "checked-in", artists: [] });
    fireEvent.click(await openLive());
    expect(await screen.findByText("We use your location once to confirm you're at the show.")).toBeTruthy();
    h.api.listMyCheckIns.mockResolvedValue(new Set(["live"]));
    await act(async () => finish({ lat: 51.04, lng: -114.07, accuracy: 12 }));
    await waitFor(() => expect(h.api.checkIn).toHaveBeenCalledWith("live", { lat: 51.04, lng: -114.07, accuracy: 12 }));
    expect(await screen.findByText("Checked in")).toBeTruthy();
    expect(geo.getPosition).toHaveBeenCalledTimes(1);
  });

  it("takes you to the location help when the browser says no", async () => {
    geo.getPosition.mockRejectedValue({ code: 1 });
    fireEvent.click(await openLive());
    expect(await screen.findByRole("heading", { level: 1, name: "Turn on location" })).toBeTruthy();
    expect(h.api.checkIn).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/");
  });

  it("shows a friendly line when the server says you're too far", async () => {
    geo.getPosition.mockResolvedValue({ lat: 1, lng: 1, accuracy: 10 });
    h.api.checkIn.mockRejectedValue({ code: "functions/failed-precondition", details: { reason: "too-far" } });
    fireEvent.click(await openLive());
    expect((await screen.findByRole("alert")).textContent).toBe("You don't seem to be at the show yet.");
    expect((screen.getByRole("button", { name: "I'm here" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a friendly line when the location can't be found", async () => {
    geo.getPosition.mockRejectedValue({ code: 2 });
    fireEvent.click(await openLive());
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't find your location/i);
  });
});

describe("artist page", () => {
  it("shows the image, name, fan total and past shows", async () => {
    h.api.getArtist.mockResolvedValue(artist("alpha", "Alpha", { imageUrl: "https://img.test/a.jpg", fanCount: 12 }));
    h.api.listPastShows.mockResolvedValue([show("p1", -50, 3, { venue: "Old Hall" })]);
    renderAt("/artist/alpha");
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Alpha" }).getAttribute("src")).toBe("https://img.test/a.jpg");
    expect(screen.getByText("12").tagName).toBe("STRONG");
    expect(screen.getByText("fans")).toBeTruthy();
    expect(screen.getByText("Old Hall")).toBeTruthy();
    expect(h.api.listPastShows.mock.calls[0][0]).toBe("alpha");
  });

  it("handles one fan, no shows, and a missing artist", async () => {
    h.api.getArtist.mockResolvedValue(artist("alpha", "Alpha", { fanCount: 1 }));
    renderAt("/artist/alpha");
    expect(await screen.findByText("fan")).toBeTruthy();
    expect(screen.getByText("No past shows yet.")).toBeTruthy();
    cleanup();
    h.api.getArtist.mockResolvedValue(null);
    renderAt("/artist/nobody");
    expect(await screen.findByText("That artist isn't here.")).toBeTruthy();
  });
});

describe("admin page", () => {
  it("tells everyone else it is for admins", async () => {
    renderAt("/admin");
    expect(await screen.findByText("This page is for admins.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add show" })).toBeNull();
    expect(h.api.listAllShows).not.toHaveBeenCalled();
  });

  async function openAdmin() {
    h.api.isAdmin.mockResolvedValue(true);
    renderAt("/admin");
    return screen.findByRole("button", { name: "Add show" });
  }

  it("adds a show from the form, with a lineup, and refreshes the list", async () => {
    h.api.createShow.mockResolvedValue("new1");
    await openAdmin();
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "Foundry 47" } });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "51.0447" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-114.0719" } });
    fireEvent.click(screen.getByRole("button", { name: "Start now (3 hours)" }));
    fireEvent.change(screen.getByLabelText("Artist 1"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "Add artist" }));
    fireEvent.change(screen.getByLabelText("Artist 2"), { target: { value: "Beta" } });
    const before = h.api.listAllShows.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Add show" }));
    await waitFor(() => expect(h.api.createShow).toHaveBeenCalledTimes(1));
    const input = h.api.createShow.mock.calls[0][0];
    expect(input).toMatchObject({ venue: "Foundry 47", lat: 51.0447, lng: -114.0719, artistNames: ["Alpha", "Beta"] });
    expect(input.endsAt.getTime() - input.startsAt.getTime()).toBe(3 * HOUR);
    expect(Math.abs(input.startsAt.getTime() - Date.now())).toBeLessThan(120_000);
    expect(await screen.findByText("Show added.")).toBeTruthy();
    await waitFor(() => expect(h.api.listAllShows.mock.calls.length).toBeGreaterThan(before));
  });

  it("asks for what's missing instead of sending a half-filled show", async () => {
    await openAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Add show" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Add the venue name.");
    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "Hall" } });
    fireEvent.click(screen.getByRole("button", { name: "Add show" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Set the venue location.");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "95" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Add show" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Set the venue location.");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add show" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Add at least one artist.");
    expect(h.api.createShow).not.toHaveBeenCalled();
  });

  it("fills in the location from the phone's position", async () => {
    await openAdmin();
    geo.getPosition.mockResolvedValue({ lat: 51.123456789, lng: -114.5, accuracy: 18.4 });
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    await waitFor(() => expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("51.123457"));
    expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe("-114.500000");
  });

  it("finds an address with the free search and fills in the numbers", async () => {
    await openAdmin();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ display_name: "Foundry 47, 10 St, Calgary", lat: "51.05", lon: "-114.08" }] });
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.change(screen.getByLabelText("Search an address"), { target: { value: "foundry calgary" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.click(await screen.findByRole("button", { name: /Foundry 47, 10 St/ }));
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=foundry%20calgary");
    expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("51.050000");
    expect((screen.getByLabelText("Venue") as HTMLInputElement).value).toBe("Foundry 47");
    vi.unstubAllGlobals();
  });

  it("lists shows, edits the end time and deletes after confirming", async () => {
    h.api.listAllShows.mockResolvedValue([show("s1", -1)]);
    h.api.updateShowEnd.mockResolvedValue(undefined);
    h.api.deleteShow.mockResolvedValue(undefined);
    await openAdmin();
    const row = (await screen.findByText("Venue s1")).closest("li")!;
    fireEvent.change(within(row).getByLabelText("End time"), { target: { value: "23:59" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.api.updateShowEnd).toHaveBeenCalledTimes(1));
    expect(h.api.updateShowEnd.mock.calls[0][0]).toBe("s1");
    const end: Date = h.api.updateShowEnd.mock.calls[0][1];
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59]);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(h.api.deleteShow).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.api.deleteShow).toHaveBeenCalledWith("s1"));
    confirm.mockRestore();
  });

  it("lets an admin add or replace one image per artist", async () => {
    h.api.listArtists.mockResolvedValue([artist("alpha", "Alpha"), artist("beta", "Beta", { imageUrl: "https://img.test/b.jpg" })]);
    h.api.uploadArtistImage.mockResolvedValue("https://img.test/new.jpg");
    await openAdmin();
    expect(await screen.findByText("Add image")).toBeTruthy();
    expect(screen.getByText("Replace image")).toBeTruthy();
    const input = screen.getByLabelText("Image for Alpha") as HTMLInputElement;
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    // A file of the wrong type is turned away before anything is sent.
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/JPG, PNG or WebP/);
    expect(h.api.uploadArtistImage).not.toHaveBeenCalled();
  });
});
