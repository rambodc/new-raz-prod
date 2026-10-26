import { useEffect, useRef } from "react";
import { createRaspberryScene, type SceneTheme } from "./raspberryScene";

type Props = {
  theme: SceneTheme;
  onReady: () => void;
  onFail: () => void;
};

/** Lazy-loaded 3D raspberry. Mounted only after first paint, never under reduced motion. */
export default function HeroScene({ theme, onReady, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof createRaspberryScene> | null>(null);
  const themeRef = useRef(theme);
  const cb = useRef({ onReady, onFail });
  cb.current = { onReady, onFail };

  useEffect(() => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let scene: ReturnType<typeof createRaspberryScene>;
    try {
      scene = createRaspberryScene(cv, () => cb.current.onFail());
    } catch {
      cb.current.onFail();
      return;
    }
    api.current = scene;
    scene.setTheme(themeRef.current);

    const size = () => {
      const r = el.getBoundingClientRect();
      scene.resize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      scene.setPointer((e.clientX - cx) / (window.innerWidth / 2), (e.clientY - cy) / (window.innerHeight / 2));
    };
    const onLeave = () => scene.setPointer(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let visible = true;
    let tabShown = !document.hidden;
    const update = () => scene.setActive(visible && tabShown);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    io.observe(el);
    const onVis = () => {
      tabShown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVis);

    // Reveal after the first rendered frame so the fallback never flashes blank.
    const ready = requestAnimationFrame(() => requestAnimationFrame(() => cb.current.onReady()));

    return () => {
      cancelAnimationFrame(ready);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      scene.dispose();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;
    api.current?.setTheme(theme);
  }, [theme]);

  return (
    <div ref={wrap} className="hero-scene">
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
