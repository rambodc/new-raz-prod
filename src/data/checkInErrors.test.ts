import { describe, expect, it } from "vitest";
import { checkInProblem, geolocationProblem } from "./checkInErrors";
import { parsePlaces } from "./geocode";
import { fitWithin } from "../lib/image";

describe("check-in problems", () => {
  it("sends a refused location to the help screen, and explains other location trouble", () => {
    expect(geolocationProblem({ code: 1 })).toEqual({ kind: "denied" });
    expect(geolocationProblem({ code: 2 })).toMatchObject({ kind: "message" });
    expect(geolocationProblem({ code: 3 })).toMatchObject({ kind: "message", text: expect.stringMatching(/too long/) });
  });

  it("says in plain words why the server said no", () => {
    const say = (reason: string) => (checkInProblem({ code: "functions/failed-precondition", details: { reason } }) as { text: string }).text;
    expect(say("not-live")).toMatch(/isn't on right now/);
    expect(say("too-far")).toMatch(/don't seem to be at the show/);
    expect(say("poor-accuracy")).toMatch(/isn't exact enough/);
    expect(say("no-show")).toMatch(/isn't here any more/);
    expect((checkInProblem(new Error("boom")) as { text: string }).text).toMatch(/Something went wrong/);
    expect((checkInProblem({ code: "functions/unauthenticated" }) as { text: string }).text).toMatch(/sign in/i);
  });
});

describe("address search results", () => {
  it("keeps only places with a name and real numbers", () => {
    expect(parsePlaces([{ display_name: "Foundry 47, Calgary", lat: "51.04", lon: "-114.07" }, { display_name: "No place", lat: "x", lon: "1" }, { lat: 1, lon: 1 }, null])).toEqual([{ label: "Foundry 47, Calgary", lat: 51.04, lng: -114.07 }]);
    expect(parsePlaces({ error: "nope" })).toEqual([]);
  });
});

describe("image sizing", () => {
  it("shrinks big pictures to 1000 px on the long side and never enlarges small ones", () => {
    expect(fitWithin(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 });
    expect(fitWithin(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
    expect(fitWithin(600, 400, 1000)).toEqual({ width: 600, height: 400 });
  });
});
