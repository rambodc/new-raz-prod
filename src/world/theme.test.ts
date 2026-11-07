import { describe, expect, it } from "vitest";
import { eventCopyFromLine, fanNote, themeForLine, THEMES } from "./theme";

describe("theme for a line", () => {
  it("keeps Friday and an empty line on raspberry", () => {
    expect(themeForLine("").id).toBe("raspberry");
    expect(themeForLine("Create Friday's event").id).toBe("raspberry");
    expect(themeForLine("NOVA")).toBe(THEMES.raspberry);
  });

  it("picks violet and aurora from the words, and is stable otherwise", () => {
    expect(themeForLine("a violet room").id).toBe("violet");
    expect(themeForLine("Saturday aurora 10 pm").id).toBe("aurora");
    expect(themeForLine("quiet hall")).toBe(themeForLine("quiet hall"));
  });
});

describe("event copy", () => {
  const fallback = { title: "Friday", when: "9 PM" };

  it("reads a weekday and a clock time, and leaves the rest alone", () => {
    expect(eventCopyFromLine("Create Friday's event", fallback)).toEqual({ title: "Friday", when: "9 PM" });
    expect(eventCopyFromLine("Saturday aurora 10:30 pm", fallback)).toEqual({ title: "Saturday", when: "10:30 PM" });
    expect(eventCopyFromLine("doors at 11 pm", fallback)).toEqual({ title: "Friday", when: "11 PM" });
  });
});

describe("fan note", () => {
  it("only mentions numbers we actually have", () => {
    expect(fanNote(null, null)).toBeNull();
    expect(fanNote(1, null)).toBe("You've been to 1 show");
    expect(fanNote(3, 12)).toBe("You've been to 3 shows · 12 fans");
    expect(fanNote(null, 1)).toBe("1 fan");
  });
});
