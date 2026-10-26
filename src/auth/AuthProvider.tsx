import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { currentUser, subscribeToAuth, type AuthUser } from "./service";

type AuthState = {
  user: AuthUser | null;
  /** True until Firebase has reported the initial auth state. */
  loading: boolean;
  /** Set when Firebase could not start (for example a missing web config). */
  failed: boolean;
  /** While true, guest pages stay mounted after sign-up so the profile can finish saving. */
  holdRedirect: boolean;
  setHoldRedirect: (hold: boolean) => void;
  /** Re-read the current user (after updating the display name). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  failed: false,
  holdRedirect: false,
  setHoldRedirect: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [holdRedirect, setHoldRedirect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const start = () => {
      subscribeToAuth(
        (next) => {
          if (cancelled) return;
          setUser(next);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setFailed(true);
          setLoading(false);
        },
      ).then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      });
    };
    // The public home page doesn't need auth to paint, so wait until the browser is idle there.
    // Every other route needs the auth state right away.
    let idle: number | undefined;
    let timer: number | undefined;
    if (window.location.pathname === "/") {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 2000 });
      else timer = window.setTimeout(start, 600);
    } else {
      start();
    }
    return () => {
      cancelled = true;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await currentUser());
  }, []);

  const value = useMemo(() => ({ user, loading, failed, holdRedirect, setHoldRedirect, refreshUser }), [user, loading, failed, holdRedirect, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
