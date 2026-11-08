import { sanitizeCard, validateDraftInput } from "../../functions/lib/cards.js";
import { mergeScene } from "../scene/schema";
import type { Scene, ScenePatch } from "../scene/types";

export type Draft = { artistName: string; eventTitle: string; vibe: string; details: string };
export type CardStatus = "pending" | "answered" | "submitted" | "applied" | "rejected" | "superseded";
export type ChoiceOption = { id: string; label: string };
export type Card =
  | { type: "choice"; id: string; prompt: string; options: ChoiceOption[]; status: CardStatus; answer?: string }
  | { type: "form"; id: string; prompt: string; fields: string[]; status: CardStatus }
  | { type: "approval"; id: string; prompt: string; proposal: { scene: ScenePatch; draft: Partial<Draft> }; status: CardStatus };

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
): { items: TranscriptItem[]; text: string; draft: Draft } | { error: string; errors?: Record<string, string> } {
  const item = items.find((entry) => entry.kind === "card" && entry.card.id === cardId);
  if (!item || item.kind !== "card" || item.card.type !== "form") return { error: "That form is gone." };
  if (item.card.status !== "pending") return { error: "Already submitted." };
  const checked = validateDraftInput(item.card.fields, values) as { ok: boolean; errors: Record<string, string>; clean: Partial<Draft> };
  if (!checked.ok) return { error: "Check the form.", errors: checked.errors };
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
): { items: TranscriptItem[]; scene: Scene; draft: Draft; changed: boolean } | { error: string } {
  const item = items.find((entry) => entry.kind === "card" && entry.card.id === cardId);
  if (!item || item.kind !== "card" || item.card.type !== "approval") return { error: "That proposal is gone." };
  if (item.card.status !== "pending") return { error: "Already decided." };
  if (!accept) {
    return { items: replaceCard(items, cardId, "rejected"), scene, draft, changed: false };
  }
  return {
    items: [...replaceCard(items, cardId, "applied"), { kind: "text", role: "user", text: "Accepted" }],
    scene: mergeScene(scene, item.card.proposal.scene),
    draft: { ...draft, ...item.card.proposal.draft },
    changed: true,
  };
}
