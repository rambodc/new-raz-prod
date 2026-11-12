// Readable share slugs. Keep this in step with functions/lib/slug.js.

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function isSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 60 && SLUG_RE.test(value);
}

export function slugify(name: string): string {
  const base = name
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

export function slugCandidates(name: string, blocked: string[] = []): string[] {
  const root = slugify(name);
  const skip = new Set<string>([...RESERVED, ...blocked]);
  const out: string[] = [];
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

export function artistPath(slug: string): string {
  return `/${slug}`;
}

export function eventPath(artistSlug: string, eventSlug: string): string {
  return `/${artistSlug}/${eventSlug}`;
}

export function trackPath(artistSlug: string, trackSlug: string): string {
  return `/${artistSlug}/t/${trackSlug}`;
}

export function artistHref(artist: { slug: string }): string {
  return artistPath(artist.slug);
}
