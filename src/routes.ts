import { isSlug, RESERVED } from "./slug";

export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "artist"; id: string }
  | { name: "artist-edit"; id: string }
  | { name: "event"; id: string }
  | { name: "event-edit"; id: string | null }
  | { name: "share"; artistSlug: string; eventSlug: string | null; trackSlug: string | null }
  | { name: "signin" }
  | { name: "missing" };

export function currentPath(): string {
  const path = window.location.pathname.replace(/\/$/, "");
  return path.length > 0 ? path : "/";
}

function slugPart(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return isSlug(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseRoute(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/signin") return { name: "signin" };
  if (path === "/events/new") return { name: "event-edit", id: null };
  const artistEdit = /^\/artist\/([^/]+)\/edit$/.exec(path);
  if (artistEdit) return { name: "artist-edit", id: decodeURIComponent(artistEdit[1]) };
  const artist = /^\/artist\/([^/]+)$/.exec(path);
  if (artist) return { name: "artist", id: decodeURIComponent(artist[1]) };
  const eventEdit = /^\/event\/([^/]+)\/edit$/.exec(path);
  if (eventEdit) return { name: "event-edit", id: decodeURIComponent(eventEdit[1]) };
  const event = /^\/event\/([^/]+)$/.exec(path);
  if (event) return { name: "event", id: decodeURIComponent(event[1]) };

  const parts = path.split("/").filter(Boolean);
  const artistSlug = parts.length > 0 ? slugPart(parts[0]) : null;
  if (!artistSlug || RESERVED.has(artistSlug)) return { name: "missing" };
  if (parts.length === 1) return { name: "share", artistSlug, eventSlug: null, trackSlug: null };
  if (parts.length === 3 && parts[1] === "t") {
    const trackSlug = slugPart(parts[2]);
    if (trackSlug) return { name: "share", artistSlug, eventSlug: null, trackSlug };
  }
  if (parts.length === 2) {
    const eventSlug = slugPart(parts[1]);
    if (eventSlug && eventSlug !== "t") return { name: "share", artistSlug, eventSlug, trackSlug: null };
  }
  return { name: "missing" };
}

/** A same-app path to send someone back to. Empty when the value is not safe. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return "";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return "";
  const pathname = value.split("?")[0].split("#")[0];
  if (!pathname || pathname === "/signin" || pathname.startsWith("/signin/")) return "";
  if (pathname.length > 240) return "";
  return value.slice(0, 300);
}

export function returnPathFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return safeReturnPath(params.get("return") || params.get("next") || "");
}
