import type { EventPage } from "../event/types";
import { sanitizeScene } from "../scene/schema";
import type { Scene, ScenePatch } from "../scene/types";
import { asCard, type Card, type Draft } from "./flow";
import { safeSources } from "./search";

export class ChatError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export async function sendSceneChat(
  messages: { role: "user" | "assistant"; content: string }[],
  scene: Scene,
  draft: Draft,
  context: { event: EventPage; guestFacts: string },
): Promise<{ reply: string; scene: ScenePatch; card: Card | null }> {
  const response = await fetch("/api/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, scene, draft, event: context.event, guestFacts: context.guestFacts }),
  });
  const data = (await response.json().catch(() => null)) as { reply?: unknown; scene?: unknown; card?: unknown; message?: unknown; error?: unknown } | null;
  if (!response.ok) {
    const message = data && typeof data.message === "string" ? data.message : "Chat didn't answer.";
    throw new ChatError(message, typeof data?.error === "string" ? data.error : "failed");
  }
  return {
    reply: typeof data?.reply === "string" ? data.reply : "",
    scene: sanitizeScene(data?.scene),
    card: asCard(data?.card),
  };
}

export async function sendWebSearch(query: string, signal: AbortSignal): Promise<{ reply: string; sources: { url: string; title: string; host: string }[] }> {
  const response = await fetch("/api/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "search", query }),
    signal,
  });
  const data = (await response.json().catch(() => null)) as { reply?: unknown; sources?: unknown; message?: unknown; error?: unknown } | null;
  if (!response.ok) {
    const message = data && typeof data.message === "string" ? data.message : "Web search didn't answer.";
    throw new ChatError(message, typeof data?.error === "string" ? data.error : "failed");
  }
  const sources = safeSources(data?.sources);
  if (!sources.length) throw new ChatError("Web search didn't return a source link, so the answer isn't shown.", "search-unsourced");
  return { reply: typeof data?.reply === "string" ? data.reply : "Sources are below.", sources };
}
