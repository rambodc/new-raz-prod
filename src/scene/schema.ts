import { DEFAULT_SCENE as defaultScene, mergeScene as merge, sanitizeScene as sanitize } from "../../functions/lib/sceneSchema.js";
import type { Scene, ScenePatch } from "./types";

export const DEFAULT_SCENE = defaultScene as Scene;

export function sanitizeScene(input: unknown): ScenePatch {
  return sanitize(input) as ScenePatch;
}

export function mergeScene(current: Scene, patch: ScenePatch): Scene {
  return merge(current, patch) as Scene;
}

const STORAGE_KEY = "razzberry-test-scene";

export function loadScene(): Scene {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCENE;
    return mergeScene(DEFAULT_SCENE, sanitizeScene(JSON.parse(raw)));
  } catch {
    return DEFAULT_SCENE;
  }
}

export function saveScene(scene: Scene) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
  } catch {
    // The scene still lives in memory for this page.
  }
}
