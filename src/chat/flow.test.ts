import { describe, expect, it } from "vitest";
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
    const rejected = decideApproval(pending, "p1", false, DEFAULT_SCENE, EMPTY_DRAFT);
    expect("scene" in rejected && rejected.scene.colors.glow).toBe(DEFAULT_SCENE.colors.glow);
    expect("changed" in rejected && rejected.changed).toBe(false);
    const accepted = decideApproval(pending, "p1", true, DEFAULT_SCENE, EMPTY_DRAFT);
    expect("scene" in accepted && accepted.scene.colors.glow).toBe("#22aa99");
    expect("scene" in accepted && accepted.scene.name.includes("<")).toBe(false);
    expect("draft" in accepted && accepted.draft.eventTitle).toBe("Friday");
    if (!("items" in accepted)) return;
    expect(decideApproval(accepted.items, "p1", true, accepted.scene, accepted.draft)).toMatchObject({ error: "Already decided." });
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
