import { sanitizeCard, validateDraftInput } from "../../functions/lib/cards.js";
import { applyEventPatch, applyGuestOps, sanitizeEventPatch } from "../../functions/lib/event.js";
import { mergeScene } from "../scene/schema";
import type { Scene, ScenePatch } from "../scene/types";
import type { EventPage } from "../event/types";

export type Draft = { artistName: string; eventTitle: string; vibe: string; details: string };
export type CardStatus = "pending" | "answered" | "submitted" | "applied" | "rejected" | "superseded";
export type ChoiceOption = { id: string; label: string };
export type Card =
  | { type: "choice"; id: string; prompt: string; options: ChoiceOption[]; status: CardStatus; answer?: string }
  | { type: "form"; id: string; prompt: string; fields: string[]; status: CardStatus }
  | {
      type: "approval";
      id: string;
      prompt: string;
      proposal: { scene: ScenePatch; draft: Partial<Draft>; event: Partial<EventPage>; guests: { add: { name: string; group: string; status: string }[]; set: { name: string; group?: string; status?: string }[] } };
      status: CardStatus;
    };

export type TranscriptItem =
  | { kind: "text"; role: "user" | "assistant" | "error"; text: string }
  | { kind: "card"; card: Card };

export const EMPTY_DRAFT: Draft = { artistName: "", eventTitle: "", vibe: "", details: "" };

export function asCard(input: unknown): Card | null {
  const clean = sanitizeCard(input) as Card | null;
  return clean ? { ...clean, status: "pending" } : null;
}

export function supersedePending(items: TranscriptItem[], type: Card["type"]): TranscriptItem[] {
  return items.map((item) => {
    if (item.kind !== "card" || item.card.type !== type || item.card.status !== "pending") return item;
    return { kind: "card", card: { ...item.card, status: "superseded" } };
  });
}

export function appendAssistant(items: TranscriptItem[], reply: string, card: Card | null): TranscriptItem[] {
  const next = [...items];
  if (reply) next.push({ kind: "text", role: "assistant", text: reply });
  if (!card) return next;
  return [...supersedePending(next, card.type), { kind: "card", card }];
}

function replaceCard(items: TranscriptItem[], id: string, status: CardStatus, answer?: string): TranscriptItem[] {
  return items.map((item) => {
    if (item.kind !== "card" || item.card.id !== id) return item;
    return { kind: "card", card: { ...item.card, status, ...(answer ? { answer } : {}) } };
  });
}

export function answerChoice(items: TranscriptItem[], cardId: string, optionId: string): { items: TranscriptItem[]; text: string } | { error: string } {
  const item = items.find((entry) => entry.kind === "card" && entry.card.id === cardId);
  if (!item || item.kind !== "card" || item.card.type !== "choice") return { error: "That question is gone." };
  if (item.card.status !== "pending") return { error: "Already answered." };
  const option = item.card.options.find((entry) => entry.id === optionId);
  if (!option) return { error: "That option is not available." };
  return {
    items: [...replaceCard(items, cardId, "answered", option.label), { kind: "text", role: "user", text: option.label }],
    text: option.label,
  };
}

export function submitForm(
  items: TranscriptItem[],
  cardId: string,
  values: Record<string, string>,
  draft: Draft,
): { items: TranscriptItem[]; text: string; draft: Draft; skipModel?: boolean } | { error: string; errors?: Record<string, string> } {
  const item = items.find((entry) => entry.kind === "card" && entry.card.id === cardId);
  if (!item || item.kind !== "card" || item.card.type !== "form") return { error: "That form is gone." };
  if (item.card.status !== "pending") return { error: "Already submitted." };
  const checked = validateDraftInput(item.card.fields, values) as { ok: boolean; errors: Record<string, string>; clean: Record<string, string> };
  if (!checked.ok) return { error: "Check the form.", errors: checked.errors };
  if (item.card.fields.includes("guestName")) {
    const name = checked.clean.guestName;
    const proposal = {
      type: "approval",
      id: `${cardId}-add`,
      prompt: `Add ${name} to the sample list?`,
      proposal: { guests: { add: [{ name, group: checked.clean.guestGroup || "General", status: checked.clean.guestStatus || "invited" }] } },
    };
    const approval = asCard(proposal);
    const text = `Add guest ${name}`;
    const submitted = [...replaceCard(items, cardId, "submitted"), { kind: "text" as const, role: "user" as const, text }];
    return { items: approval ? appendAssistant(submitted, "Accept to add them. Nothing is invited.", approval) : submitted, text, draft, skipModel: true };
  }
  const eventFields = ["eventTitle", "description", "date", "time", "timeZone", "venue"];
  if (item.card.fields.some((key) => eventFields.includes(key))) {
    const event = sanitizeEventPatch({
      title: checked.clean.eventTitle,
      description: checked.clean.description,
      date: checked.clean.date,
      time: checked.clean.time,
      timeZone: checked.clean.timeZone,
      venue: checked.clean.venue,
      artistName: checked.clean.artistName,
    });
    if (!Object.keys(event).length) return { error: "Nothing on that form can go on the page." };
    const approval = asCard({
      type: "approval",
      id: `${cardId}-apply`,
      prompt: "Update the event page?",
      proposal: { event, draft: { eventTitle: event.title, artistName: event.artistName } },
    });
    const text = "Update the event page";
    const submitted = [...replaceCard(items, cardId, "submitted"), { kind: "text" as const, role: "user" as const, text }];
    return { items: approval ? appendAssistant(submitted, "Accept to put this on the page. Nothing is sent.", approval) : submitted, text, draft, skipModel: true };
  }
  const text = Object.entries(checked.clean)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return {
    items: [...replaceCard(items, cardId, "submitted"), { kind: "text", role: "user", text }],
    text,
    draft: { ...draft, ...checked.clean },
  };
}

export function decideApproval(
  items: TranscriptItem[],
  cardId: string,
  accept: boolean,
  scene: Scene,
  draft: Draft,
  event: EventPage,
): { items: TranscriptItem[]; scene: Scene; draft: Draft; event: EventPage; changed: boolean } | { error: string } {
  const item = items.find((entry) => entry.kind === "card" && entry.card.id === cardId);
  if (!item || item.kind !== "card" || item.card.type !== "approval") return { error: "That proposal is gone." };
  if (item.card.status !== "pending") return { error: "Already decided." };
  if (!accept) {
    return { items: replaceCard(items, cardId, "rejected"), scene, draft, event, changed: false };
  }
  const proposed = item.card.proposal;
  return {
    items: [...replaceCard(items, cardId, "applied"), { kind: "text", role: "user", text: "Accepted" }],
    scene: mergeScene(scene, proposed.scene),
    draft: { ...draft, ...proposed.draft },
    event: applyGuestOps(applyEventPatch(event, proposed.event), proposed.guests),
    changed: true,
  };
}
