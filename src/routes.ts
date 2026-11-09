export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "artist"; id: string }
  | { name: "artist-edit"; id: string }
  | { name: "event"; id: string }
  | { name: "event-edit"; id: string | null }
  | { name: "missing" };

export function currentPath(): string {
  const path = window.location.pathname.replace(/\/$/, "");
  return path.length > 0 ? path : "/";
}

export function parseRoute(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/events/new") return { name: "event-edit", id: null };
  const artistEdit = /^\/artist\/([^/]+)\/edit$/.exec(path);
  if (artistEdit) return { name: "artist-edit", id: decodeURIComponent(artistEdit[1]) };
  const artist = /^\/artist\/([^/]+)$/.exec(path);
  if (artist) return { name: "artist", id: decodeURIComponent(artist[1]) };
  const eventEdit = /^\/event\/([^/]+)\/edit$/.exec(path);
  if (eventEdit) return { name: "event-edit", id: decodeURIComponent(eventEdit[1]) };
  const event = /^\/event\/([^/]+)$/.exec(path);
  if (event) return { name: "event", id: decodeURIComponent(event[1]) };
  return { name: "missing" };
}
