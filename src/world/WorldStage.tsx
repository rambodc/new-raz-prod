import { Canvas } from "@react-three/fiber";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import WorldScene, { type AnchorEls, type PortalStyle, type StageName } from "./WorldScene";
import { layoutFor } from "./layout";
import { canUseWebGL, prefersReducedMotion, qualityFor, readQualityInput } from "./quality";
import { frameLoop, initialShell, listenNativeAppState, reduceShell, signalWebGL, type ShellEvent, type ShellState } from "./shellLifecycle";
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

function canvasContextLost(): boolean {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return true;
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  return !gl || gl.isContextLost();
}

function useShell(): { state: ShellState; dispatch: (event: ShellEvent) => void } {
  const [state, setState] = useState<ShellState>(() => ({ ...initialShell, background: document.visibilityState === "hidden" }));
  const dispatch = useCallback((event: ShellEvent) => {
    setState((current) => reduceShell(current, event));
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      dispatch({ type: "visibility", hidden });
      if (!hidden) dispatch({ type: "resume-check", contextLost: canvasContextLost() });
    };
    document.addEventListener("visibilitychange", onVisibility);
    let removeNative = () => {};
    let cancelled = false;
    void listenNativeAppState((active) => {
      if (cancelled) return;
      dispatch({ type: "native", active });
      if (active) dispatch({ type: "resume-check", contextLost: canvasContextLost() });
    }).then((remove) => {
      if (cancelled) remove();
      else removeNative = remove;
    });
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      removeNative();
    };
  }, []);

  return { state, dispatch };
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
  const { state: shell, dispatch } = useShell();
  const size = useViewport();
  const quality = useMemo(() => qualityFor(readQualityInput()), []);
  const layout = useMemo(() => layoutFor(size.w, size.h), [size.w, size.h]);
  const [supported, setSupported] = useState(canUseWebGL);
  const [failed, setFailed] = useState(false);
  const anchors = useRef<AnchorEls>({ sign: null, portalHit: null, portalLabel: null, here: null });
  const binds = useMemo<Binds>(() => {
    const assign = (key: BindKey) => (node: HTMLElement | null) => {
      anchors.current[key] = node;
    };
    return { sign: assign("sign"), portalHit: assign("portalHit"), portalLabel: assign("portalLabel"), here: assign("here") };
  }, []);
  const showWebGL = supported && !failed;
  useEffect(() => {
    if (!showWebGL) signalWebGL(false);
  }, [showWebGL]);
  const loop = frameLoop(shell, reduced);
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
          <SceneBoundary onFail={() => setFailed(true)}>
            <Canvas
              key={shell.generation}
              className="world-canvas"
              dpr={[1, quality.dpr]}
              frameloop={loop}
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
                const canvas = gl.domElement;
                canvas.addEventListener("webglcontextlost", (event) => {
                  event.preventDefault();
                  dispatch({ type: "context-lost" });
                });
                canvas.addEventListener("webglcontextrestored", () => {
                  dispatch({ type: "context-restored" });
                });
                signalWebGL(true);
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
        {(shell.contextLost || !showWebGL) && (
          <p className="world-gl-note" role="status">
            {shell.contextLost || failed ? "The 3D view paused." : "A simpler view is showing because 3D isn't available."}{" "}
            {(shell.contextLost || failed) && (
              <button
                type="button"
                className="world-text-btn"
                onClick={() => {
                  setFailed(false);
                  setSupported(canUseWebGL());
                  dispatch({ type: "retry" });
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
