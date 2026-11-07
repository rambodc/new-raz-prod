import { Canvas } from "@react-three/fiber";
import { Component, createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import WorldScene, { type AnchorEls, type PortalStyle, type StageName } from "./WorldScene";
import { layoutFor } from "./layout";
import { canUseWebGL, prefersReducedMotion, qualityFor, readQualityInput } from "./quality";
import type { WorldTheme } from "./theme";
import "./world.css";

type BindKey = keyof AnchorEls;
type Binds = Record<BindKey, (node: HTMLElement | null) => void>;

const AnchorBindContext = createContext<Binds | null>(null);

function useReducedMotion(): boolean {
  const [on, setOn] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const apply = () => setOn(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return on;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const next = { w: window.innerWidth, h: vv?.height ?? window.innerHeight };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
      document.documentElement.style.setProperty("--vvh", `${next.h}px`);
      document.documentElement.style.setProperty("--vv-top", `${vv?.offsetTop ?? 0}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
    };
  }, []);
  return size;
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function FallbackRoom({ portalStyle }: { portalStyle: PortalStyle }) {
  return (
    <div className={`fb-room fb-room--${portalStyle}`} aria-hidden="true">
      <div className="fb-sky" />
      <div className="fb-steps" />
      <div className="fb-sculpture">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="fb-portal" />
      <div className="fb-floor" />
    </div>
  );
}

export function Anchored({ name, className, children }: { name: BindKey; className?: string; children?: ReactNode }) {
  const binds = useContext(AnchorBindContext);
  return (
    <div ref={binds?.[name]} className={`world-anchor${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

/** Transparent control that the 3D view moves over the portal. Keyboard and screen readers use the same button. */
export function PortalButton({ label, onClick }: { label: string; onClick: () => void }) {
  const binds = useContext(AnchorBindContext);
  return <button ref={binds?.portalHit} type="button" className="world-anchor world-portal-hit" aria-label={label} onClick={onClick} />;
}

export function WorldHeader({ start, end }: { start: ReactNode; end?: ReactNode }) {
  return (
    <header className="world-top">
      <div className="world-top-start">{start}</div>
      <div className="world-top-actions">{end}</div>
    </header>
  );
}

export function WorldDock({ children }: { children: ReactNode }) {
  return <div className="world-dock">{children}</div>;
}

export default function WorldStage({
  stage,
  theme,
  portalStyle,
  description,
  children,
}: {
  stage: StageName;
  theme: WorldTheme;
  portalStyle: PortalStyle;
  description: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const hidden = usePageHidden();
  const size = useViewport();
  const quality = useMemo(() => qualityFor(readQualityInput()), []);
  const layout = useMemo(() => layoutFor(size.w, size.h), [size.w, size.h]);
  const [supported, setSupported] = useState(canUseWebGL);
  const [lost, setLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const anchors = useRef<AnchorEls>({ sign: null, portalHit: null, portalLabel: null, here: null });
  const binds = useMemo<Binds>(() => {
    const assign = (key: BindKey) => (node: HTMLElement | null) => {
      anchors.current[key] = node;
    };
    return { sign: assign("sign"), portalHit: assign("portalHit"), portalLabel: assign("portalLabel"), here: assign("here") };
  }, []);
  const showWebGL = supported && !lost;
  const initialShot = stage === "auth" ? layout.auth : stage === "event" ? layout.event : layout.artist;
  const cssVars = {
    "--sculpt-a": theme.a,
    "--sculpt-b": theme.b,
    "--sculpt-c": theme.c,
    "--portal": theme.portal,
  } as CSSProperties;

  return (
    <div
      className={`world-root world--${layout.band} ${layout.portrait ? "world--portrait" : "world--landscape"} world--${stage} world-portal-${portalStyle}${showWebGL ? " world-stage-live" : " world--fallback"}`}
      style={cssVars}
    >
      <div className="world-stage" aria-hidden="true">
        {showWebGL ? (
          <SceneBoundary onFail={() => setLost(true)}>
            <Canvas
              key={attempt}
              className="world-canvas"
              dpr={[1, quality.dpr]}
              frameloop={hidden ? "never" : reduced ? "demand" : "always"}
              shadows={quality.shadows}
              camera={{ fov: initialShot.fov, near: 0.08, far: 90, position: initialShot.position }}
              gl={{
                antialias: quality.tier !== "low",
                alpha: false,
                powerPreference: "default",
                stencil: false,
                failIfMajorPerformanceCaveat: false,
              }}
              onCreated={({ gl }) => {
                gl.setClearColor("#07060a", 1);
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.08;
                gl.domElement.addEventListener("webglcontextlost", (event) => {
                  event.preventDefault();
                  setLost(true);
                });
              }}
            >
              <WorldScene stage={stage} theme={theme} portalStyle={portalStyle} layout={layout} reduced={reduced} quality={quality} anchors={anchors} />
            </Canvas>
          </SceneBoundary>
        ) : (
          <FallbackRoom portalStyle={portalStyle} />
        )}
        <div className="world-vignette" />
        <div className="world-grain" />
      </div>
      <a className="skip-link" href="#world-main">
        Skip to content
      </a>
      <p className="sr-only">{description}</p>
      <main id="world-main" className="world-main" tabIndex={-1}>
        <AnchorBindContext.Provider value={binds}>{children}</AnchorBindContext.Provider>
        {!showWebGL && (
          <p className="world-gl-note" role="status">
            {lost ? "The 3D view paused." : "A simpler view is showing because 3D isn't available."}{" "}
            {lost && (
              <button
                type="button"
                className="world-text-btn"
                onClick={() => {
                  setLost(false);
                  setSupported(canUseWebGL());
                  setAttempt((n) => n + 1);
                }}
              >
                Try the 3D scene again
              </button>
            )}
          </p>
        )}
      </main>
    </div>
  );
}
