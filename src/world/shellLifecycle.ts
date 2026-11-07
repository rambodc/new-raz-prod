import { Capacitor } from "@capacitor/core";

export type FrameLoop = "always" | "demand" | "never";

export type ShellState = {
  /** App or tab is not in the foreground. Rendering must stop. */
  background: boolean;
  /** The current canvas lost its WebGL context and has not been replaced. */
  contextLost: boolean;
  /** Bumped to remount the canvas after a context that did not restore. */
  generation: number;
};

export type ShellEvent =
  | { type: "visibility"; hidden: boolean }
  | { type: "native"; active: boolean }
  | { type: "context-lost" }
  | { type: "context-restored" }
  | { type: "resume-check"; contextLost: boolean }
  | { type: "retry" };

export const initialShell: ShellState = { background: false, contextLost: false, generation: 0 };

/**
 * Foreground and WebGL decisions for the shared scene.
 * A lost context stays mounted so WKWebView can restore it. A resume that is still lost rebuilds the canvas.
 */
export function reduceShell(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case "visibility":
      return { ...state, background: event.hidden };
    case "native":
      return { ...state, background: !event.active };
    case "context-lost":
      return { ...state, contextLost: true };
    case "context-restored":
      return { ...state, contextLost: false };
    case "resume-check":
      if (state.background) return state;
      if (event.contextLost) return { background: false, contextLost: false, generation: state.generation + 1 };
      return { ...state, contextLost: false };
    case "retry":
      return { background: state.background, contextLost: false, generation: state.generation + 1 };
  }
}

export function frameLoop(state: ShellState, reducedMotion: boolean): FrameLoop {
  if (state.background || state.contextLost) return "never";
  return reducedMotion ? "demand" : "always";
}

/** Stop the loop while iOS has suspended the WKWebView, then check the context when it returns. */
export async function listenNativeAppState(onActive: (active: boolean) => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("appStateChange", ({ isActive }) => onActive(isActive));
  return () => {
    void handle.remove();
  };
}

/**
 * Edge-to-edge status bar and native keyboard resizing. No microphone, push, or payment setup.
 * Browser sessions return immediately.
 */
/** Tells the iOS shell that this page did or did not create a WebGL context. Browsers ignore the native hook. */
export function signalWebGL(ready: boolean) {
  const message = ready ? "webgl-ready" : "webgl-unavailable";
  console.info(ready ? "RAZZBERRY_WEBGL_READY" : "RAZZBERRY_WEBGL_UNAVAILABLE");
  const hook = (window as Window & { webkit?: { messageHandlers?: { razzberry?: { postMessage: (body: string) => void } } } }).webkit?.messageHandlers?.razzberry;
  hook?.postMessage(message);
}

export async function prepareNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setOverlaysWebView({ overlay: true });
  await StatusBar.setStyle({ style: Style.Dark });
  const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
  await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
}
