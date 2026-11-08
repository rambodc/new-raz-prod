import { sanitizeScene } from "../scene/schema";
import type { Scene, ScenePatch } from "../scene/types";
import { asCard, type Card, type Draft } from "./flow";

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
): Promise<{ reply: string; scene: ScenePatch; card: Card | null }> {
  const response = await fetch("/api/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, scene, draft }),
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
