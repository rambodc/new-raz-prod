import { describe, expect, it } from "vitest";
import { parseRoute } from "./routes";

describe("routes", () => {
  it("maps the artist and event pages", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("/settings")).toEqual({ name: "settings" });
    expect(parseRoute("/artist/nova")).toEqual({ name: "artist", id: "nova" });
    expect(parseRoute("/artist/nova/edit")).toEqual({ name: "artist-edit", id: "nova" });
    expect(parseRoute("/events/new")).toEqual({ name: "event-edit", id: null });
    expect(parseRoute("/event/night")).toEqual({ name: "event", id: "night" });
    expect(parseRoute("/event/night/edit")).toEqual({ name: "event-edit", id: "night" });
    expect(parseRoute("/nope")).toEqual({ name: "missing" });
  });
});
