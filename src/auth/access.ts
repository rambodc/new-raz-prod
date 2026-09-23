const protectedRoutes = new Set(["/dashboard"]);

export function routeAccess(pathname: string, authenticated: boolean): "allow" | "signin" {
  return protectedRoutes.has(pathname) && !authenticated ? "signin" : "allow";
}
