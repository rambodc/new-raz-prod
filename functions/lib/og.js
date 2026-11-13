import { createHash } from "node:crypto";
import { artistPath, eventPath, trackPath } from "./slug.js";

export function ogRevision(parts) {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\n")).digest("hex").slice(0, 16);
}

/** One hash for the trigger and the share function, so they do not rebuild the same card. */
export function previewRevision(kind, record, artistName = "") {
  if (kind === "event") {
    return ogRevision(["event", record.slug, record.title, record.imageURL, eventSubtitle(record)]);
  }
  if (kind === "track") {
    return ogRevision(["track", record.slug, record.title, record.coverURL, artistName]);
  }
  return ogRevision(["artist", record.slug, record.name, record.imageURL]);
}

export const THEME_COLOR = "#000000";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function clip(text, max) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (Array.from(value).length <= max) return value;
  return `${Array.from(value).slice(0, max - 1).join("").trimEnd()}…`;
}

export function eventSubtitle(event) {
  const date = typeof event?.startsAt?.toDate === "function" ? event.startsAt.toDate() : new Date(event?.startsAt);
  const when = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Edmonton",
      }).format(date);
  const place = [event?.venue, event?.city].filter(Boolean).join(", ");
  return [when, place].filter(Boolean).join(" · ");
}

/**
 * Tags crawlers read. Real browsers still receive the SPA shell this is injected into.
 * Every event is public, including its venue and city.
 */
export function shareMeta({ origin, parsed, model }) {
  const artist = model?.artist;
  const event = model?.event ?? null;
  const track = model?.track ?? null;
  const artistUrl = artist?.slug ? `${origin}${artistPath(artist.slug)}` : origin;
  if (!artist) {
    return {
      title: "Razzberry",
      description: "Nights, artists and the room.",
      url: origin,
      imagePath: null,
      imageSource: "",
      cardTitle: "Razzberry",
      cardSubtitle: "",
      cache: "public, max-age=60",
    };
  }
  const bio = clip(artist.bio, 160) || `Upcoming nights and music from ${artist.name}.`;
  if (parsed.kind === "event" && event) {
    const subtitle = eventSubtitle(event);
    return {
      title: `${event.title} · ${artist.name}`,
      description: clip(event.description, 180) || subtitle || bio,
      url: `${origin}${eventPath(artist.slug, event.slug)}`,
      imagePath: `og/events/${event.id}.jpg`,
      imageSource: event.imageURL || artist.imageURL || "",
      cardTitle: event.title,
      cardSubtitle: subtitle,
      cache: "public, max-age=300, s-maxage=600",
    };
  }
  if (parsed.kind === "track" && track) {
    return {
      title: `${track.title} · ${artist.name}`,
      description: `Listen to ${track.title} by ${artist.name} on Razzberry.`,
      url: `${origin}${trackPath(artist.slug, track.slug)}`,
      imagePath: `og/tracks/${artist.id}/${track.id}.jpg`,
      imageSource: track.coverURL || artist.imageURL || "",
      cardTitle: track.title,
      cardSubtitle: artist.name,
      cache: "public, max-age=300, s-maxage=600",
    };
  }
  return {
    title: artist.name,
    description: bio,
    url: artistUrl,
    imagePath: `og/artists/${artist.id}.jpg`,
    imageSource: artist.imageURL || "",
    cardTitle: artist.name,
    cardSubtitle: clip(artist.bio, 80),
    cache: "public, max-age=300, s-maxage=600",
  };
}

export function injectShareMeta(html, meta) {
  const image = meta.image || "";
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="theme-color" content="${THEME_COLOR}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Razzberry" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join("\n    ");
  let next = String(html)
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/i, "")
    .replace(/<meta\s+name=["']theme-color["'][^>]*>/i, "");
  if (!/<\/head>/i.test(next)) return `${tags}\n${next}`;
  return next.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}
