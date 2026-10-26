import { SCENE_IDS, type SceneId } from "./sim";

/** What the rep phone can tell the screen, and what the screen reports back. */
export type Message =
  | { type: "hello"; from: "rep" | "screen" }
  | { type: "ping" }
  | { type: "scene"; scene: SceneId | null }
  | { type: "drop" }
  | { type: "question"; id: string | null }
  | { type: "black"; on: boolean }
  | { type: "state"; count: number; mood: number; scene: SceneId; black: boolean; question: { id: string; a: number; b: number } | null };

export const CHANNEL_NAME = "razzberry-lab-show";
export const STORAGE_KEY = "razzberry-lab-show-msg";

const isScene = (v: unknown): v is SceneId => typeof v === "string" && (SCENE_IDS as string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Accepts only messages we know how to read. Anything else from the page's channel is ignored. */
export function parseMessage(raw: unknown): Message | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case "hello":
      return m.from === "rep" || m.from === "screen" ? { type: "hello", from: m.from } : null;
    case "ping":
      return { type: "ping" };
    case "scene":
      return m.scene === null || isScene(m.scene) ? { type: "scene", scene: m.scene as SceneId | null } : null;
    case "drop":
      return { type: "drop" };
    case "question":
      return m.id === null || typeof m.id === "string" ? { type: "question", id: m.id as string | null } : null;
    case "black":
      return typeof m.on === "boolean" ? { type: "black", on: m.on } : null;
    case "state": {
      const q = m.question as Record<string, unknown> | null;
      const question = q && typeof q.id === "string" && isNum(q.a) && isNum(q.b) ? { id: q.id, a: q.a, b: q.b } : null;
      if (isNum(m.count) && isNum(m.mood) && isScene(m.scene) && typeof m.black === "boolean") {
        return { type: "state", count: m.count, mood: m.mood, scene: m.scene, black: m.black, question };
      }
      return null;
    }
    default:
      return null;
  }
}

export type ShowChannel = { post: (msg: Message) => void; close: () => void };

/**
 * Talks to the other tab on the same browser. Uses BroadcastChannel, and falls back to localStorage
 * events where BroadcastChannel is missing. A tab never hears its own messages.
 */
export function openChannel(onMessage: (msg: Message) => void): ShowChannel {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (e: MessageEvent) => {
        const msg = parseMessage(e.data);
        if (msg) onMessage(msg);
      };
      return { post: (msg) => bc.postMessage(msg), close: () => bc.close() };
    } catch {
      /* fall through to localStorage */
    }
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const msg = parseMessage((JSON.parse(e.newValue) as { msg?: unknown }).msg);
      if (msg) onMessage(msg);
    } catch {
      /* not ours */
    }
  };
  window.addEventListener("storage", onStorage);
  return {
    post: (msg) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: Math.random().toString(36).slice(2), t: Date.now(), msg }));
      } catch {
        /* storage blocked: the other tab just will not hear us */
      }
    },
    close: () => window.removeEventListener("storage", onStorage),
  };
}
