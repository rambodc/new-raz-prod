import { useCallback, useEffect, useRef, type RefObject } from "react";
import { crowdAt, lerp, moodAt, smooth } from "./sim";

/** Numbers the canvases read every frame. The screen updates this object; nothing here re-renders. */
export type LiveLevels = { crowd: number; mood: number; black: boolean };

const TAU = Math.PI * 2;

/** Keeps a canvas sized to its box (at most 1.5x pixel density, to stay light on big TVs). */
function useCanvasSize(canvas: RefObject<HTMLCanvasElement | null>, onResize: (w: number, h: number) => void) {
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(el.clientWidth * dpr));
      const h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        onResize(w, h);
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvas, onResize]);
}

/* ---------- Scene 1: the room as a brush ---------- */

const MAX_PARTICLES = 900;

function flow(x: number, y: number, t: number): number {
  return (Math.sin(x * 1.7 + t) + Math.sin(y * 1.3 - t * 0.8) + Math.sin((x + y) * 0.9 + t * 0.5)) / 3;
}

/**
 * Soft strokes drift across the screen. A fuller room paints more of them, and a heavier mood makes them
 * thicker, faster and darker. A light, small room is open, bright and slow. Motion is slow and continuous,
 * so nothing flickers.
 */
export function BrushCanvas({ live, calm }: { live: RefObject<LiveLevels>; calm: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 1, h: 1 });
  const px = useRef(new Float32Array(MAX_PARTICLES));
  const py = useRef(new Float32Array(MAX_PARTICLES));
  const resized = useRef(true);

  const onResize = useCallback((w: number, h: number) => {
    size.current = { w, h };
    resized.current = true;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      px.current[i] = Math.random() * w;
      py.current[i] = Math.random() * h;
    }
  }, []);
  useCanvasSize(ref, onResize);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const slow = calm ? 0.25 : 1;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { crowd, mood, black } = live.current;
      const { w, h } = size.current;
      if (black) return;
      t += dt * slow * (0.35 + mood * 0.9);

      // Heavier = darker background, deeper colours. Lighter = a glowing, open room.
      const bg = `hsl(${lerp(336, 268, mood)} ${lerp(100, 42, mood)}% ${lerp(88, 4, mood ** 1.3)}%)`;
      if (resized.current) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        resized.current = false;
      }
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      const scale = Math.sqrt((w * h) / (1920 * 1080));
      const active = Math.min(MAX_PARTICLES, Math.floor((120 + crowd * 640) * Math.max(0.5, scale) * (calm ? 0.6 : 1)));
      const speed = (30 + mood * 150) * slow * scale;
      ctx.lineWidth = (1.1 + mood * 2.1) * Math.max(0.7, scale);
      ctx.lineCap = "round";
      const light = lerp(34, 72, smooth(0.3, 0.55, mood));
      const hues = [lerp(330, 345, mood), lerp(268, 285, mood), lerp(200, 300, mood)];

      for (let b = 0; b < 3; b++) {
        ctx.strokeStyle = `hsl(${hues[b]} 85% ${light}% / ${lerp(0.75, 0.6, mood)})`;
        ctx.beginPath();
        for (let i = b; i < active; i += 3) {
          const x = px.current[i];
          const y = py.current[i];
          const a = flow(x * 0.0016, y * 0.0016, t) * TAU * 1.6;
          const nx = x + Math.cos(a) * speed * dt;
          const ny = y + Math.sin(a) * speed * dt;
          ctx.moveTo(x, y);
          ctx.lineTo(nx, ny);
          // A few strokes start over each frame, so the flow never piles up into one thick rope.
          if (nx < 0 || ny < 0 || nx > w || ny > h || Math.random() < 0.004) {
            px.current[i] = Math.random() * w;
            py.current[i] = Math.random() * h;
          } else {
            px.current[i] = nx;
            py.current[i] = ny;
          }
        }
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, calm]);

  return <canvas ref={ref} className="vs-canvas" aria-hidden="true" />;
}

/* ---------- Scene 4: the closing moment ---------- */

/**
 * One image built from the night: each ring is one moment of the evening. Ring width is how full the room was,
 * and ring colour is how heavy it felt. The rings wobble at first, then settle into calm circles.
 */
export function ClosingCanvas({ peakCrowd: crowdProp, peakMood: moodProp, calm }: { peakCrowd: number; peakMood: number; calm: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The picture is made once, when the scene appears, from the night so far.
  const peaks = useRef({ crowd: crowdProp, mood: moodProp }).current;
  const peakCrowd = peaks.crowd;
  const peakMood = peaks.mood;
  const size = useRef({ w: 1, h: 1 });
  const redraw = useRef<() => void>(() => {});
  const onResize = useCallback((w: number, h: number) => {
    size.current = { w, h };
    redraw.current();
  }, []);
  useCanvasSize(ref, onResize);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const RINGS = 48;
    const crowdCurve = Array.from({ length: RINGS }, (_, i) => (crowdAt(i / (RINGS - 1)) * peakCrowd) / Math.max(0.01, crowdAt(1)));
    const moodMax = Math.max(...Array.from({ length: RINGS }, (_, i) => moodAt(i / (RINGS - 1))));
    const moodCurve = Array.from({ length: RINGS }, (_, i) => (moodAt(i / (RINGS - 1)) * peakMood) / Math.max(0.01, moodMax));
    const start = performance.now();
    const settleMs = calm ? 1 : 12000;

    const draw = (now: number) => {
      const { w, h } = size.current;
      const el = now - start;
      const settle = Math.min(1, el / settleMs);
      const fade = Math.min(1, el / 2500);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#07040c";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * 0.46;
      const R = Math.min(w, h) * 0.46;
      const breathe = calm ? 1 : 1 + 0.008 * Math.sin(el / 2600);
      ctx.globalAlpha = fade;
      for (let k = 0; k < RINGS; k++) {
        const r = R * breathe * (0.16 + 0.84 * (k / (RINGS - 1)));
        const wob = (1 - settle) * moodCurve[k] * R * 0.05;
        const hue = lerp(200, 335, moodCurve[k]);
        ctx.strokeStyle = `hsl(${hue} 85% ${lerp(70, 58, moodCurve[k])}% / ${0.25 + 0.5 * crowdCurve[k]})`;
        ctx.lineWidth = (0.8 + crowdCurve[k] * 3.4) * Math.max(0.8, w / 1920);
        ctx.shadowColor = `hsl(${hue} 90% 60% / 0.7)`;
        ctx.shadowBlur = 14 * Math.max(0.6, w / 1920);
        ctx.beginPath();
        for (let s = 0; s <= 120; s++) {
          const a = (s / 120) * TAU;
          const rr = r + wob * Math.sin(a * 3 + k * 0.5 + el / 1800) + wob * 0.6 * Math.sin(a * 5 - k * 0.3);
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = (now: number) => {
      draw(now);
      if (now - start < settleMs + 2600) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    redraw.current = () => draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [peakCrowd, peakMood, calm]);

  return <canvas ref={ref} className="vs-canvas" aria-hidden="true" />;
}
