import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { hasWebGL, prefersReducedMotion } from "../lib/webgl";
import { RaspberryMark } from "./RaspberryMark";
import { useTheme } from "./ThemeProvider";

const HeroScene = lazy(() => import("../three/HeroScene"));

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The hero raspberry. A polished SVG shows instantly; the real-time 3D scene loads after first
 * paint and fades in over it. Stays on the SVG for reduced motion, no WebGL, or any failure.
 */
export function HeroVisual() {
  const { theme } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || !hasWebGL()) return;
    const start = () => setEnabled(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 300);
    return () => window.clearTimeout(id);
  }, []);

  const showScene = enabled && !failed;
  return (
    <div className={`hero-visual${ready && showScene ? " is-ready" : ""}`}>
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-fallback" role="img" aria-label="A glossy raspberry made of teardrop-shaped drupelets with a three-leaf crown">
        <RaspberryMark variant="glossy" className="hero-fallback-mark" />
      </div>
      {showScene && (
        <Boundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <HeroScene theme={theme} onReady={() => setReady(true)} onFail={() => setFailed(true)} />
          </Suspense>
        </Boundary>
      )}
    </div>
  );
}
