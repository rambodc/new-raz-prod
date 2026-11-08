export type SceneColors = { base: string; glow: string; deep: string };
export type SceneLight = { warmth: number; intensity: number };
export type SceneShapes = { count: number; softness: number; drift: number };
export type ScenePortrait = { x: number; y: number; scale: number };

export type Scene = {
  colors: SceneColors;
  light: SceneLight;
  shapes: SceneShapes;
  name: string;
  line: string;
  portrait: ScenePortrait;
};

export type ScenePatch = {
  colors?: Partial<SceneColors>;
  light?: Partial<SceneLight>;
  shapes?: Partial<SceneShapes>;
  name?: string;
  line?: string;
  portrait?: Partial<ScenePortrait>;
};
