import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type AuthState = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    void Promise.all([import("../firebase"), import("../firebaseServices")]).then(([{ auth }]) => {
      if (cancelled) return;
      unsubscribe = auth.onAuthStateChanged((user) => setState({ user, loading: false }));
    }).catch(() => setState({ user: null, loading: false }));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
