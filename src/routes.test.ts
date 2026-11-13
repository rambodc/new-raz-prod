import { describe, expect, it } from "vitest";
import { parseRoute, safeReturnPath } from "./routes";

describe("routes", () => {
  it("keeps the app routes and reads public share links", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("/settings")).toEqual({ name: "settings" });
    expect(parseRoute("/artist/nova")).toEqual({ name: "artist", id: "nova" });
    expect(parseRoute("/artist/nova/edit")).toEqual({ name: "artist-edit", id: "nova" });
    expect(parseRoute("/events/new")).toEqual({ name: "event-edit", id: null });
    expect(parseRoute("/event/night")).toEqual({ name: "event", id: "night" });
    expect(parseRoute("/event/night/edit")).toEqual({ name: "event-edit", id: "night" });
    expect(parseRoute("/ada-vale")).toEqual({ name: "share", artistSlug: "ada-vale", eventSlug: null, trackSlug: null });
    expect(parseRoute("/ada-vale/river-room")).toEqual({ name: "share", artistSlug: "ada-vale", eventSlug: "river-room", trackSlug: null });
    expect(parseRoute("/ada-vale/t/midnight")).toEqual({ name: "share", artistSlug: "ada-vale", eventSlug: null, trackSlug: "midnight" });
    expect(parseRoute("/i/abcdefghjk")).toEqual({ name: "missing" });
    expect(parseRoute("/signin")).toEqual({ name: "signin" });
    expect(safeReturnPath("/ada-vale/river-room")).toBe("/ada-vale/river-room");
    expect(safeReturnPath("/signin?return=/")).toBe("");
    expect(safeReturnPath("//evil.example")).toBe("");
    expect(parseRoute("/login")).toEqual({ name: "missing" });
    expect(parseRoute("/nope/nope/nope")).toEqual({ name: "missing" });
  });
});