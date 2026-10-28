import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RaspberryMark } from "../components/RaspberryMark";
import { useAuth } from "./AuthProvider";

function Splash() {
  return (
    <main className="splash" aria-live="polite" aria-busy="true">
      <RaspberryMark className="splash-mark" />
      <span className="sr-only">Loading…</span>
    </main>
  );
}

/** Pages that need an account. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Sign-in, sign-up and password reset: signed-in users go straight to the app. */
export function GuestOnly() {
  const { user, loading, holdRedirect } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (user && !holdRedirect) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/") && !from.startsWith("//") ? from : "/"} replace />;
  }
  return <Outlet />;
}
