import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { eventSubtitle, injectShareMeta, isPublicEvent, shareMeta } from "../lib/og.js";
import { renderOgCard } from "../lib/ogImage.js";
import { parseSharePath, slugCandidates, slugify } from "../lib/slug.js";
import { backfillShares } from "../lib/shares.js";
import { composeSharePage } from "../lib/sharePage.js";

const shell = `<!doctype html><html><head><title>Razzberry</title><meta name="description" content="old"><meta name="theme-color" content="#111"></head><body><div id="root"></div></body></html>`;

function fakeDb(records) {
  return {
    doc(path) {
      return {
        async get() {
          const data = records[path];
          return {
            exists: data !== undefined,
            id: path.split("/").pop(),
            data: () => data,
            get: (field) => data?.[field],
          };
        },
        async set(data) {
          records[path] = { ...data };
        },
        async update(patch) {
          records[path] = { ...(records[path] || {}), ...patch };
        },
      };
    },
    collection(path) {
      const prefix = `${path}/`;
      return {
        async get() {
          const docs = Object.entries(records)
            .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
            .map(([key, data]) => ({
              id: key.slice(prefix.length),
              data: () => data,
              get: (field) => data?.[field],
              ref: {
                update: async (patch) => {
                  records[key] = { ...records[key], ...patch };
                },
              },
            }));
          return { docs };
        },
      };
    },
  };
}

test("slugs stay lowercase and skip reserved words", () => {
  assert.equal(slugify("Ada Vale"), "ada-vale");
  assert.equal(slugCandidates("Settings")[0], "settings-2");
  assert.equal(parseSharePath("/ada-vale").kind, "artist");
  assert.equal(parseSharePath("/ada-vale/river-room").eventSlug, "river-room");
  assert.equal(parseSharePath("/ada-vale/t/midnight").trackSlug, "midnight");
  assert.equal(parseSharePath("/settings").kind, "spa");
  assert.equal(parseSharePath("/artist/nova").kind, "spa");
});

test("a public event link carries Open Graph tags and a private event does not", async () => {
  const image = "https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/og%2Fevents%2Fe1.jpg?alt=media&v=abc";
  const records = {
    "slugs/ada-vale": { artistId: "ada", kind: "artist" },
    "artists/ada": { name: "Ada Vale", slug: "ada-vale", bio: "Night bass", imageURL: "https://example.com/a.jpg", ownerUid: "ada" },
    "artists/ada/eventShares/river-room": { eventId: "e1" },
    "artists/ada/eventShares/secret-set": { eventId: "e2" },
    "events/e1": {
      artistId: "ada",
      title: "River Room",
      slug: "river-room",
      visibility: "public",
      venue: "Hall",
      city: "Calgary",
      description: "A late set",
      imageURL: "https://example.com/e.jpg",
      startsAt: new Date("2026-11-11T03:00:00Z"),
    },
    "events/e2": {
      artistId: "ada",
      title: "Secret Set",
      slug: "secret-set",
      visibility: "private",
      venue: "Loft",
      city: "Calgary",
      description: "Invite only",
      imageURL: "https://example.com/s.jpg",
      startsAt: new Date("2026-12-01T03:00:00Z"),
    },
  };
  const db = fakeDb(records);
  const pub = await composeSharePage({
    path: "/ada-vale/river-room",
    origin: "https://new-raz-prod.web.app",
    indexHtml: shell,
    db,
    ensureImage: async () => image,
  });
  assert.match(pub.html, /property="og:title" content="River Room · Ada Vale"/);
  assert.match(pub.html, /property="og:image" content="https:\/\/firebasestorage/);
  assert.match(pub.html, /property="og:image:width" content="1200"/);
  assert.match(pub.html, /property="og:image:height" content="630"/);
  assert.match(pub.html, /name="twitter:card" content="summary_large_image"/);
  assert.match(pub.html, /rel="canonical" href="https:\/\/new-raz-prod.web.app\/ada-vale\/river-room"/);
  assert.match(pub.html, /name="theme-color" content="#000000"/);
  assert.match(pub.html, /<div id="root">/);
  assert.equal(pub.cache.includes("public"), true);

  const hidden = await composeSharePage({
    path: "/ada-vale/secret-set",
    origin: "https://new-raz-prod.web.app",
    indexHtml: shell,
    db,
    ensureImage: async () => image,
  });
  assert.equal(hidden.html.includes("Secret Set"), false);
  assert.equal(hidden.html.includes("Invite only"), false);
  assert.match(hidden.html, /property="og:title" content="Ada Vale"/);
  assert.equal(hidden.cache, "private, no-store");
  assert.equal(isPublicEvent(records["events/e2"]), false);
  assert.equal(shareMeta({ origin: "https://new-raz-prod.web.app", parsed: parseSharePath("/ada-vale"), model: { artist: records["artists/ada"], event: null, track: null } }).title, "Ada Vale");
  assert.match(eventSubtitle(records["events/e1"]), /Hall, Calgary/);
});

test("inject escapes quotes in titles", () => {
  const html = injectShareMeta(shell, {
    title: `Ada "Vale"`,
    description: "Bass & nights",
    url: "https://new-raz-prod.web.app/ada-vale",
    image: "https://example.com/a.jpg",
  });
  assert.match(html, /Ada &quot;Vale&quot;/);
  assert.match(html, /Bass &amp; nights/);
});

test("backfill assigns slugs once and leaves private events private", async () => {
  const records = {
    "slugs/ada-vale": { artistId: "someone-else", kind: "artist" },
    "artists/ada": { name: "Ada Vale", bio: "", imageURL: "", ownerUid: "ada" },
    "artists/ada/tracks/t1": { title: "Midnight" },
    "events/e1": { artistId: "ada", title: "River Room" },
    "events/e2": { artistId: "ada", title: "Secret Set", visibility: "private" },
  };
  const db = fakeDb(records);
  const first = await backfillShares(db);
  assert.equal(records["artists/ada"].slug, "ada-vale-2");
  assert.equal(records["slugs/ada-vale-2"].artistId, "ada");
  assert.equal(records["events/e1"].visibility, "public");
  assert.equal(records["events/e1"].slug, "river-room");
  assert.equal(records["artists/ada/eventShares/river-room"].eventId, "e1");
  assert.equal(records["events/e2"].visibility, "private");
  assert.equal(records["events/e2"].slug, "secret-set");
  assert.equal(records["artists/ada/tracks/t1"].slug, "midnight");
  assert.equal(records["artists/ada/trackShares/midnight"].trackId, "t1");
  assert.equal(first.artists > 0, true);
  const second = await backfillShares(db);
  assert.deepEqual(second, { artists: 0, events: 0, tracks: 0 });
  assert.equal(records["artists/ada"].name, "Ada Vale");
  assert.equal(records["events/e2"].title, "Secret Set");
});

function pixel(image, x, y) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data;
}

test("preview cards crop the uploaded photo and draw the raspberry mark", async () => {
  const photo = readFileSync(new URL("../../public/concert.jpg", import.meta.url));
  const jpeg = await renderOgCard({ photo, title: "River Room", subtitle: "Dec 19 · River Room, Calgary" });
  assert.equal(jpeg[0], 0xff);
  assert.equal(jpeg[1], 0xd8);
  const image = await loadImage(jpeg);
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);

  let berry = false;
  for (let y = 34; y < 84 && !berry; y += 2) {
    for (let x = 58; x < 110; x += 2) {
      const [red, green, blue] = pixel(image, x, y);
      if (red > 200 && green < 90 && blue > 70 && blue < 150) berry = true;
    }
  }
  assert.equal(berry, true);

  const lights = pixel(image, 860, 180);
  const flat = Math.hypot(lights[0] - 20, lights[1] - 8, lights[2] - 13);
  assert.ok(flat > 50, `photo did not show through the card (${lights[0]},${lights[1]},${lights[2]})`);
  const sky = pixel(image, 600, 150);
  const floor = pixel(image, 600, 560);
  const luma = (sample) => sample[0] * 0.3 + sample[1] * 0.6 + sample[2] * 0.1;
  assert.ok(luma(floor) < luma(sky), "the bottom gradient should keep the name readable");
});
