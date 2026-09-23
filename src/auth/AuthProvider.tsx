import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type AuthState = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  const location = useLocation();

  useEffect(() => {
    const needsSession = ["/signup", "/signin", "/forgot-password", "/dashboard"].includes(location.pathname);
    if (!needsSession) {
      setState((current) => ({ ...current, loading: false }));
      return;
    }

    let unsubscribe = () => {};
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    void import("../firebase").then(({ auth }) => {
      if (cancelled) return;
      unsubscribe = auth.onAuthStateChanged((user) => setState({ user, loading: false }));
    }).catch(() => setState({ user: null, loading: false }));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [location.pathname]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
