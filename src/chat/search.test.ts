import { describe, expect, it } from "vitest";
import { searchRequest } from "./search";

describe("public search", () => {
  it("takes the question and leaves sample names out", () => {
    expect(searchRequest("Search the web for what a listening room is", ["Sample Ada"])).toEqual({ query: "what a listening room is" });
    expect(searchRequest("Look up a quiet venue", [])).toEqual({ query: "a quiet venue" });
    expect(searchRequest("Set the title to Late Friday", ["Sample Ada"])).toBeNull();
    expect(searchRequest("Search the web for Sample Ada", ["Sample Ada"])).toMatchObject({ error: expect.stringMatching(/Sample Ada/) });
    expect(searchRequest("Search the web for ", [])).toMatchObject({ error: expect.stringMatching(/public question/i) });
  });
});
