import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

/** Pointer-following highlight for glass cards (sets --mx / --my). */
export function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export type Loaded<T> = { data: T | null; error: boolean; loading: boolean; reload: () => void };

/** Runs an async loader on mount (and again when `key` changes, or on reload()). */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({ data: null, error: false, loading: true });
  const [n, setN] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let live = true;
    loader
      .current()
      .then((data) => live && setState({ data, error: false, loading: false }))
      .catch(() => live && setState((s) => ({ data: s.data, error: true, loading: false })));
    return () => {
      live = false;
    };
  }, [key, n]);
  const reload = useCallback(() => setN((v) => v + 1), []);
  return { ...state, reload };
}
