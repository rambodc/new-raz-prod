export type QualityTier = "low" | "medium" | "high";

export type Quality = {
  tier: QualityTier;
  /** Upper cap for the renderer pixel ratio. */
  dpr: number;
  /** Soft contact shading and a second ribbon pass for the floor. */
  reflection: boolean;
  shadows: boolean;
  motes: boolean;
};

export type QualityInput = {
  cores: number;
  memoryGb: number | null;
  coarse: boolean;
  saveData: boolean;
};

export function qualityFor(input: QualityInput): Quality {
  const tight = input.saveData || (input.memoryGb !== null && input.memoryGb <= 3) || input.cores <= 2;
  if (tight) return { tier: "low", dpr: 1, reflection: false, shadows: false, motes: false };
  if (input.coarse) return { tier: "medium", dpr: 1.35, reflection: true, shadows: false, motes: true };
  return { tier: "high", dpr: 1.75, reflection: true, shadows: true, motes: true };
}

export function readQualityInput(): QualityInput {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let coarse = false;
  try {
    coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  } catch {
    coarse = false;
  }
  return {
    cores: nav.hardwareConcurrency || 8,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    coarse,
    saveData: Boolean(nav.connection?.saveData),
  };
}

export function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    (document.body ?? document.documentElement).appendChild(canvas);
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) || canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    const ok = Boolean(gl && !gl.isContextLost());
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
    return ok;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}
