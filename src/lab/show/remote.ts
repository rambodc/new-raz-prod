import type { Message } from "./channel";
import type { SceneId } from "./sim";

/** The parts of the screen that the rep phone controls. */
export type Remote = {
  sceneLock: SceneId | null;
  black: boolean;
  dropN: number;
  dropAt: number | null;
  question: { id: string; at: number } | null;
};

export const INITIAL_REMOTE: Remote = { sceneLock: null, black: false, dropN: 0, dropAt: null, question: null };

/** A second drop inside this window is ignored, so the screen can never burst more than once every few seconds. */
export const DROP_GAP_MS = 3000;

export function applyRep(state: Remote, msg: Message, now: number): Remote {
  switch (msg.type) {
    case "scene":
      return { ...state, sceneLock: msg.scene };
    case "black":
      return { ...state, black: msg.on };
    case "question":
      return { ...state, question: msg.id ? { id: msg.id, at: now } : null };
    case "drop":
      if (state.dropAt !== null && now - state.dropAt < DROP_GAP_MS) return state;
      return { ...state, dropN: state.dropN + 1, dropAt: now };
    default:
      return state;
  }
}
