import { readFile } from "node:fs/promises";
import { inviteShareMeta } from "./invites.js";
import { injectShareMeta, isPublicEvent, ogRevision, previewRevision, shareMeta } from "./og.js";
import { renderOgCard } from "./ogImage.js";
import { parseSharePath } from "./slug.js";
import { loadShareModel } from "./shares.js";

const INDEX_TTL_MS = 60_000;
let indexCache = { at: 0, html: "" };

export function publicObjectUrl(bucketName, objectPath, revision) {
  const encoded = encodeURIComponent(objectPath);
  const emulator = process.env.FUNCTIONS_EMULATOR === "true" || Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  const base = emulator
    ? `http://127.0.0.1:9199/v0/b/${bucketName}/o/${encoded}?alt=media`
    : `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media`;
  return `${base}&v=${encodeURIComponent(revision)}`;
}

export async function readIndexHtml(origin, fetchImpl = fetch) {
  const now = Date.now();
  if (indexCache.html && now - indexCache.at < INDEX_TTL_MS) return indexCache.html;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    try {
      const html = await readFile(new URL("../../dist/index.html", import.meta.url), "utf8");
      indexCache = { at: now, html };
      return html;
    } catch {
      // The hosting emulator can still serve the built file.
    }
  }
  const response = await fetchImpl(`${origin}/index.html`);
  if (!response.ok) throw new Error("Could not read index.html");
  const html = await response.text();
  indexCache = { at: now, html };
  return html;
}

export function resetIndexCache() {
  indexCache = { at: 0, html: "" };
}

/** Save a 1200×630 JPEG if this revision is not already stored. */
export async function ensureOgImage({ bucket, bucketName, objectPath, revision, photoUrl, title, subtitle, fetchImpl = fetch }) {
  const file = bucket.file(objectPath);
  try {
    const [meta] = await file.getMetadata();
    if (meta?.metadata?.revision === revision) return publicObjectUrl(bucketName, objectPath, revision);
  } catch {
    // The object is not there yet.
  }
  let photo = null;
  if (photoUrl) {
    try {
      const response = await fetchImpl(photoUrl);
      if (response.ok) photo = Buffer.from(await response.arrayBuffer());
    } catch {
      photo = null;
    }
  }
  const jpeg = await renderOgCard({ photo, title, subtitle });
  await file.save(jpeg, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=86400",
      metadata: { revision },
    },
  });
  return publicObjectUrl(bucketName, objectPath, revision);
}

export async function composeSharePage({ path, origin, indexHtml, db, ensureImage, now = Date.now() }) {
  const parsed = parseSharePath(path);
  if (parsed.kind === "spa") return { status: 200, cache: "no-store", html: indexHtml };
  if (parsed.kind === "invite") {
    const meta = await inviteShareMeta({ db, origin, code: parsed.code, now });
    let image = `${origin}/apple-touch-icon.png`;
    if (meta.imagePath) {
      const revision = ogRevision(["invite", parsed.code, meta.cardTitle, meta.cardSubtitle, meta.imageSource]);
      image = await ensureImage({
        objectPath: meta.imagePath,
        revision,
        photoUrl: meta.imageSource,
        title: meta.cardTitle,
        subtitle: meta.cardSubtitle,
      });
    }
    return {
      status: 200,
      cache: meta.cache,
      html: injectShareMeta(indexHtml, { title: meta.title, description: meta.description, url: meta.url, image }),
    };
  }
  const model = await loadShareModel(db, parsed);
  const meta = shareMeta({ origin, parsed, model });
  let image = `${origin}/apple-touch-icon.png`;
  if (meta.imagePath && model?.artist) {
    const kind = parsed.kind === "event" && model.event && isPublicEvent(model.event) ? "event" : parsed.kind === "track" && model.track ? "track" : "artist";
    const record = kind === "event" ? model.event : kind === "track" ? model.track : model.artist;
    const revision = previewRevision(kind, record, model.artist.name || "");
    image = await ensureImage({
      objectPath: meta.imagePath,
      revision,
      photoUrl: meta.imageSource,
      title: meta.cardTitle,
      subtitle: meta.cardSubtitle,
    });
  }
  return {
    status: 200,
    cache: meta.cache,
    html: injectShareMeta(indexHtml, { title: meta.title, description: meta.description, url: meta.url, image }),
  };
}

export function requestOrigin(req) {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const host = req.get?.("x-forwarded-host") || req.get?.("host") || "127.0.0.1:5000";
    const proto = req.get?.("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }
  return process.env.PUBLIC_ORIGIN || "https://new-raz-prod.web.app";
}

export async function handleShareRequest(req, { db, bucket, bucketName }) {
  const origin = requestOrigin(req);
  const indexHtml = await readIndexHtml(origin);
  const url = req.originalUrl || req.url || "/";
  return composeSharePage({
    path: url,
    origin,
    indexHtml,
    db,
    ensureImage: (spec) => ensureOgImage({ ...spec, bucket, bucketName }),
  });
}
