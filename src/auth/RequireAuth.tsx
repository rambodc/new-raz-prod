import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { routeAccess } from "./access";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <main className="route-loading" aria-live="polite">Loading your workspace…</main>;
  if (routeAccess(location.pathname, Boolean(user)) === "signin") {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
