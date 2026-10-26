import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Re-renders on an interval and returns the current time in ms. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const CODE_WINDOW_MS = 30_000;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

/** A fake proof-of-presence code that is a pure function of the 30 s window (demo only, not a real secret). */
export function presenceCode(windowIndex: number, length = 6): string {
  let h = (windowIndex * 2654435761) >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 374761393 + i * 668265263) >>> 0;
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
  }
  return out;
}

export function codeState(now: number) {
  const windowIndex = Math.floor(now / CODE_WINDOW_MS);
  const elapsed = now - windowIndex * CODE_WINDOW_MS;
  return { windowIndex, code: presenceCode(windowIndex), elapsedMs: elapsed, secondsLeft: Math.ceil((CODE_WINDOW_MS - elapsed) / 1000) };
}

/** Animate a number up to `value` once (instant under reduced motion). */
export function useCountUp(value: number, duration = 1400, enabled = true): number {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);
  const instant = reduced || !enabled;
  useEffect(() => {
    if (instant) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, instant]);
  return instant ? value : n;
}

/**
 * Pointer and device-motion tilt. Writes --rx, --ry (degrees) and --gx, --gy (0-100%, for glare) on the element.
 * Does nothing under prefers-reduced-motion. (iPhones need a permission tap for motion, so there it is pointer-only.)
 */
export function useTilt<T extends HTMLElement>(max = 12): RefObject<T | null> {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();

  const apply = useCallback(
    (nx: number, ny: number) => {
      const el = ref.current;
      if (!el) return;
      el.style.setProperty("--rx", `${(-ny * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(nx * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((nx + 1) * 50).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((ny + 1) * 50).toFixed(1)}%`);
    },
    [max],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      apply(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const leave = () => apply(0, 0);
    const motion = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      apply(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("deviceorientation", motion);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      window.removeEventListener("deviceorientation", motion);
    };
  }, [apply, reduced]);

  return ref;
}
