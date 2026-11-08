import { describe, expect, it } from "vitest";
import { EMPTY_EVENT } from "../../functions/lib/event.js";
import { DEFAULT_SCENE } from "../scene/schema";
import { answerChoice, appendAssistant, asCard, decideApproval, EMPTY_DRAFT, submitForm, type TranscriptItem } from "./flow";

const choice = asCard({
  type: "choice",
  id: "q1",
  prompt: "Which way?",
  options: [
    { id: "warm", label: "Warm" },
    { id: "bad", label: "<script>no</script> Cool" },
  ],
});

describe("cards from the model", () => {
  it("drops markup, unknown fields, and password-like keys", () => {
    expect(choice?.type).toBe("choice");
    if (choice?.type !== "choice") return;
    expect(choice.options[1].label.includes("<")).toBe(false);
    expect(asCard({ type: "form", id: "f1", prompt: "About the night", fields: ["artistName", "password", "eventTitle"] })).toMatchObject({
      fields: ["artistName", "eventTitle"],
    });
    expect(asCard({ type: "form", id: "f2", prompt: "x", fields: ["password"] })).toBeNull();
  });
});

describe("choice, form, and approval", () => {
  const items: TranscriptItem[] = [{ kind: "card", card: choice! }];

  it("answers a choice once and keeps the reply in the thread", () => {
    const first = answerChoice(items, "q1", "warm");
    expect("text" in first && first.text).toBe("Warm");
    if (!("items" in first)) return;
    expect(first.items.at(-1)).toMatchObject({ kind: "text", text: "Warm" });
    expect(answerChoice(first.items, "q1", "warm")).toMatchObject({ error: "Already answered." });
  });

  it("validates a form and stores only a session draft", () => {
    const form = asCard({ type: "form", id: "f1", prompt: "Name the night", fields: ["artistName", "details"] })!;
    const withForm = appendAssistant([], "Tell me the name.", form);
    const missing = submitForm(withForm, "f1", { artistName: "" }, EMPTY_DRAFT);
    expect(missing).toMatchObject({ error: "Check the form." });
    expect(EMPTY_DRAFT.artistName).toBe("");
    const done = submitForm(withForm, "f1", { artistName: "NOVA", details: "Late set" }, EMPTY_DRAFT);
    expect("draft" in done && done.draft.artistName).toBe("NOVA");
    if (!("items" in done)) return;
    expect(submitForm(done.items, "f1", { artistName: "Other" }, done.draft)).toMatchObject({ error: "Already submitted." });
  });

  it("applies an approval once and leaves the scene untouched on reject", () => {
    const approval = asCard({
      type: "approval",
      id: "p1",
      prompt: "Use this room?",
      proposal: { scene: { colors: { glow: "#22aa99" }, name: "<b>NOVA</b>" }, draft: { eventTitle: "Friday" } },
    })!;
    const pending = appendAssistant([], "Here is a proposal.", approval);
    const rejected = decideApproval(pending, "p1", false, DEFAULT_SCENE, EMPTY_DRAFT, EMPTY_EVENT);
    expect("scene" in rejected && rejected.scene.colors.glow).toBe(DEFAULT_SCENE.colors.glow);
    expect("event" in rejected && rejected.event.title).toBe(EMPTY_EVENT.title);
    expect("changed" in rejected && rejected.changed).toBe(false);
    const accepted = decideApproval(pending, "p1", true, DEFAULT_SCENE, EMPTY_DRAFT, EMPTY_EVENT);
    expect("scene" in accepted && accepted.scene.colors.glow).toBe("#22aa99");
    expect("scene" in accepted && accepted.scene.name.includes("<")).toBe(false);
    expect("draft" in accepted && accepted.draft.eventTitle).toBe("Friday");
    if (!("items" in accepted)) return;
    expect(decideApproval(accepted.items, "p1", true, accepted.scene, accepted.draft, accepted.event)).toMatchObject({ error: "Already decided." });
  });

  it("turns an event form into one approval and applies it once", () => {
    const form = asCard({ type: "form", id: "ev", prompt: "Event details", fields: ["eventTitle", "venue", "time", "timeZone", "date"] })!;
    const withForm = appendAssistant([], "Details.", form);
    const invalid = submitForm(withForm, "ev", { eventTitle: "Late Friday", date: "2026-02-31" }, EMPTY_DRAFT);
    expect(invalid).toMatchObject({ error: "Check the form." });
    const done = submitForm(withForm, "ev", { eventTitle: "Late Friday", venue: "The Hall", time: "21:00", timeZone: "America/Edmonton" }, EMPTY_DRAFT);
    expect("skipModel" in done && done.skipModel).toBe(true);
    expect("draft" in done && done.draft.eventTitle).toBe("");
    if (!("items" in done)) return;
    const accepted = decideApproval(done.items, "ev-apply", true, DEFAULT_SCENE, EMPTY_DRAFT, EMPTY_EVENT);
    expect("event" in accepted && accepted.event.title).toBe("Late Friday");
    expect("event" in accepted && accepted.event.venue).toBe("The Hall");
    expect("event" in accepted && accepted.event.timeZone).toBe("America/Edmonton");
    if (!("items" in accepted)) return;
    expect(decideApproval(accepted.items, "ev-apply", true, accepted.scene, accepted.draft, accepted.event)).toMatchObject({ error: "Already decided." });
  });

  it("keeps a multi-field event proposal unapplied until accept", () => {
    const approval = asCard({
      type: "approval",
      id: "night-1",
      prompt: "Apply this to the event page?",
      proposal: { event: { title: "Midnight Drop", venue: "Sample Lounge", date: "2026-12-31", time: "21:00" } },
    })!;
    const pending = appendAssistant([], "Proposal ready.", approval);
    const waiting = decideApproval(pending, "night-1", false, DEFAULT_SCENE, EMPTY_DRAFT, EMPTY_EVENT);
    expect("changed" in waiting && waiting.changed).toBe(false);
    expect("event" in waiting && waiting.event.title).toBe(EMPTY_EVENT.title);
    expect("event" in waiting && waiting.event.venue).toBe("");
    const accepted = decideApproval(pending, "night-1", true, DEFAULT_SCENE, EMPTY_DRAFT, EMPTY_EVENT);
    expect("event" in accepted && accepted.event).toMatchObject({ title: "Midnight Drop", venue: "Sample Lounge", date: "2026-12-31", time: "21:00" });
  });

  it("disables an older pending card when a new one of the same kind arrives", () => {
    const newer = asCard({
      type: "choice",
      id: "q2",
      prompt: "Instead?",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    })!;
    const next = appendAssistant(items, "Another question.", newer);
    const old = next.find((item) => item.kind === "card" && item.card.id === "q1");
    expect(old && old.kind === "card" && old.card.status).toBe("superseded");
    expect(answerChoice(next, "q1", "warm")).toMatchObject({ error: "Already answered." });
  });
});
