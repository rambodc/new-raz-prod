const protectedRoutes = new Set(["/welcome"]);
const guestRoutes = new Set(["/signin", "/signup", "/forgot-password"]);

export type RouteAccess = "allow" | "signin" | "welcome";

/** Decide what a visitor may see: protected pages need sign-in; guest pages bounce signed-in users. */
export function routeAccess(pathname: string, authenticated: boolean): RouteAccess {
  if (protectedRoutes.has(pathname) && !authenticated) return "signin";
  if (guestRoutes.has(pathname) && authenticated) return "welcome";
  return "allow";
}
