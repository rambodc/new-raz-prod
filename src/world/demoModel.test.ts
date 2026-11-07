import { describe, expect, it } from "vitest";
import { approveEdit, cancelEdit, confirmHere, createDemo, enterEvent, hereLabel, insertSamplePhrase, previewEdit, setLine, toggleFollow } from "./demoModel";

describe("sample world", () => {
  it("toggles follow without changing the sample count", () => {
    const start = createDemo();
    const next = toggleFollow(start);
    expect(next.following).toBe(true);
    expect(next.hereCount).toBe(28);
    expect(toggleFollow(next).following).toBe(false);
  });

  it("notes I'm here once and does not invent a second visit", () => {
    const once = confirmHere(enterEvent(createDemo()));
    expect(once.present).toBe(true);
    expect(once.hereCount).toBe(29);
    expect(hereLabel(once)).toBe("29 here · sample");
    expect(confirmHere(once)).toBe(once);
  });

  it("previews a theme locally and cancel restores the committed room", () => {
    const editing = setLine({ ...createDemo(), editing: true }, "violet room");
    const staged = previewEdit(editing);
    expect(staged.stagedThemeId).toBe("violet");
    expect(staged.committedThemeId).toBe("raspberry");
    const cancelled = cancelEdit(staged);
    expect(cancelled.editing).toBe(false);
    expect(cancelled.stagedThemeId).toBeNull();
    expect(cancelled.eventTitle).toBe("Friday");
    expect(cancelled.committedThemeId).toBe("raspberry");
  });

  it("approve keeps the staged look on the device and still marks the count as sample", () => {
    const withPhrase = insertSamplePhrase({ ...createDemo(), editing: true, voicePreview: true });
    expect(withPhrase.line).toBe("Create Friday's event");
    const approved = approveEdit(previewEdit(setLine(withPhrase, "Saturday aurora 8 pm")));
    expect(approved.editing).toBe(false);
    expect(approved.committedThemeId).toBe("aurora");
    expect(approved.eventTitle).toBe("Saturday");
    expect(approved.eventWhen).toBe("8 PM");
    expect(approved.hereCount).toBe(28);
    expect(hereLabel(approved)).toContain("sample");
  });
});
