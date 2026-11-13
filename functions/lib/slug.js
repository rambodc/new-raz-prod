// Readable share slugs. Artist slugs are global. Event and track slugs are unique per artist.
// The same helpers run in the client (src/slug.ts) and here. Keep the two copies in step.

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// First path segment of the SPA, plus words we never want an artist to claim.
export const RESERVED = new Set([
  "about",
  "account",
  "accounts",
  "admin",
  "admins",
  "api",
  "app",
  "apple-touch-icon",
  "artist",
  "artists",
  "assets",
  "auth",
  "cdn",
  "check-in",
  "checkin",
  "dist",
  "edit",
  "email",
  "emailchanges",
  "emulator",
  "emulators",
  "event",
  "events",
  "false",
  "favicon",
  "firestore",
  "functions",
  "help",
  "home",
  "hosting",
  "i",
  "index",
  "login",
  "logincodes",
  "logout",
  "mail",
  "manifest",
  "models",
  "new",
  "null",
  "og",
  "privacy",
  "profile",
  "profiles",
  "public",
  "robots",
  "settings",
  "share",
  "shares",
  "show",
  "shows",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "site",
  "sitemap",
  "src",
  "static",
  "storage",
  "support",
  "t",
  "terms",
  "track",
  "tracks",
  "true",
  "undefined",
  "user",
  "users",
  "www",
]);

export function isSlug(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 60 && SLUG_RE.test(value);
}

export function slugify(name) {
  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "page";
}

/** Up to 30 candidates. Reserved words and anything in `blocked` are skipped. */
export function slugCandidates(name, blocked = []) {
  const root = slugify(name);
  const skip = new Set([...RESERVED, ...blocked]);
  const out = [];
  let n = 1;
  while (out.length < 30 && n < 80) {
    const raw = n === 1 ? root : `${root}-${n}`;
    const slug = raw.slice(0, 60).replace(/-+$/g, "");
    n += 1;
    if (!isSlug(slug) || skip.has(slug) || out.includes(slug)) continue;
    out.push(slug);
  }
  return out;
}

export function artistPath(slug) {
  return `/${slug}`;
}

export function eventPath(artistSlug, eventSlug) {
  return `/${artistSlug}/${eventSlug}`;
}

export function trackPath(artistSlug, trackSlug) {
  return `/${artistSlug}/t/${trackSlug}`;
}

export function eventSharePath(artistId, slug) {
  return `artists/${artistId}/eventShares/${slug}`;
}

export function trackSharePath(artistId, slug) {
  return `artists/${artistId}/trackShares/${slug}`;
}

/** Hosting and the share function both use this. Reserved first segments stay on the SPA shell. */
export function parseSharePath(pathname) {
  const clean = String(pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const marker = "/sharePage";
  const at = clean.indexOf(marker);
  const path = (at >= 0 ? clean.slice(at + marker.length) : clean) || "/";
  const parts = path.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts.length === 0 || !isSlug(parts[0]) || RESERVED.has(parts[0])) return { kind: "spa" };
  if (parts.length === 1) return { kind: "artist", artistSlug: parts[0] };
  if (parts.length === 3 && parts[1] === "t" && isSlug(parts[2])) {
    return { kind: "track", artistSlug: parts[0], trackSlug: parts[2] };
  }
  if (parts.length === 2 && isSlug(parts[1]) && parts[1] !== "t") {
    return { kind: "event", artistSlug: parts[0], eventSlug: parts[1] };
  }
  return { kind: "spa" };
}
