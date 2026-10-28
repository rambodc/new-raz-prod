import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ createShow: vi.fn(), getArtist: vi.fn(), uploadArtistImage: vi.fn() }));
vi.mock("../../data/api", () => api);
vi.mock("../../lib/image", () => ({ resizeToJpegBase64: vi.fn().mockResolvedValue("QUJD") }));

import DemoData from "./DemoData";

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.createShow.mockResolvedValue("id");
  api.uploadArtistImage.mockResolvedValue("https://img.test/x.jpg");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "image/jpeg" }) }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("demo data button", () => {
  it("adds the John Summit dates, a TEST show that is live now, and a picture for each artist without one", async () => {
    api.getArtist.mockImplementation(async (id: string) => (id === "john-summit" ? { id, name: "John Summit", imageUrl: null, fanCount: 0 } : { id, name: "Test DJ Raz", imageUrl: null, fanCount: 0 }));
    const changed = vi.fn();
    render(<DemoData onChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: "Add demo data" }));
    expect(await screen.findByText(/TEST show is open now/)).toBeTruthy();
    expect(api.createShow).toHaveBeenCalledTimes(3);
    const test = api.createShow.mock.calls[2];
    expect(test[0].venue).toContain("TEST");
    expect(test[0].artistNames).toEqual(["Test DJ Raz", "John Summit"]);
    expect(Math.abs(test[0].startsAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect(test[1]).toEqual({ id: "demo-test-razzberry", replace: true });
    expect(api.createShow.mock.calls[0][1].replace).toBe(false);
    expect(api.uploadArtistImage.mock.calls.map((c) => c[0])).toEqual(["john-summit", "test-dj-raz"]);
    expect(changed).toHaveBeenCalled();
  });

  it("keeps a picture that is already there, and says so when something fails", async () => {
    api.getArtist.mockResolvedValue({ id: "x", name: "X", imageUrl: "https://img.test/old.jpg", fanCount: 0 });
    render(<DemoData onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add demo data" }));
    await screen.findByText(/TEST show is open now/);
    expect(api.uploadArtistImage).not.toHaveBeenCalled();
    api.createShow.mockRejectedValue(new Error("nope"));
    fireEvent.click(screen.getByRole("button", { name: "Add demo data" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Tap again/));
  });
});
