import test from "node:test";
import assert from "node:assert/strict";
import { inspectImage } from "../lib/imageFile.js";
import { handleImageRequest, IMAGE_LIMITS, IMAGE_MODEL } from "../lib/images.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function call(extra) {
  return handleImageRequest({
    method: "POST",
    origin: "http://localhost:5173",
    ip: "203.0.113.41",
    body: { action: "generate", prompt: "A quiet dusk room", aspect: "background" },
    rawLength: 80,
    now: 80_000,
    store: new Map(),
    apiKey: "test-key",
    model: IMAGE_MODEL,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG }] }) }),
    ...extra,
  });
}

test("a photo is accepted only as a real jpeg, png, or webp within bounds", () => {
  const bytes = Buffer.from(PNG, "base64");
  assert.equal(inspectImage(bytes).mime, "image/png");
  assert.equal(inspectImage(Buffer.from("<svg><script>")).error.includes("JPEG"), true);
  const huge = Buffer.from(bytes);
  huge.writeUInt32BE(3000, 16);
  assert.match(inspectImage(huge).error, /2048/);
});

test("a new image uses Imagine generations and never downloads a provider link", async () => {
  let url = "";
  let sent = "";
  const fetches = [];
  const result = await call({
    fetchImpl: async (target, init) => {
      fetches.push(target);
      url = target;
      sent = init.body;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG, url: "https://images.example/secret.png" }] }) };
    },
  });
  const request = JSON.parse(sent);
  assert.equal(url, "https://api.x.ai/v1/images/generations");
  assert.equal(request.model, "grok-imagine-image-2.0");
  assert.equal(request.n, 1);
  assert.equal(request.response_format, "b64_json");
  assert.equal(request.resolution, "1k");
  assert.equal(request.quality, "medium");
  assert.equal(request.aspect_ratio, "3:2");
  assert.equal(request.image, undefined);
  assert.equal(fetches.length, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.kind, "ai-generated");
  assert.equal(result.body.mime, "image/png");
  assert.equal(result.body.image, PNG);
  assert.equal(JSON.stringify(result.body).includes("https://"), false);
  assert.equal(JSON.stringify(result.body).includes("test-key"), false);
});

test("an edit sends the photo as a data URI and keeps the original request to one image", async () => {
  let sent = "";
  const result = await call({
    body: { action: "edit", prompt: "Warm dusk light", aspect: "foreground", image: { data: PNG } },
    fetchImpl: async (_url, init) => {
      sent = init.body;
      assert.equal(_url, "https://api.x.ai/v1/images/edits");
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG }] }) };
    },
  });
  const request = JSON.parse(sent);
  assert.equal(request.n, 1);
  assert.equal(request.aspect_ratio, "3:4");
  assert.equal(request.image.type, "image_url");
  assert.match(request.image.url, /^data:image\/png;base64,/);
  assert.equal(request.image.url.startsWith("http"), false);
  assert.equal(JSON.stringify(request).includes("Sample Ada"), false);
  assert.equal(result.body.kind, "ai-edited");
});

test("generate refuses an attached photo, a remote url, guests, and a link-only provider response", async () => {
  let called = false;
  const fetchImpl = async (target) => {
    called = true;
    assert.equal(String(target).startsWith("https://api.x.ai/"), true);
    return { ok: true, status: 200, json: async () => ({ data: [{ url: "https://images.example/only.png" }] }) };
  };
  const withPhoto = await call({ body: { action: "generate", prompt: "A room", image: { data: PNG } }, fetchImpl });
  assert.equal(withPhoto.status, 400);
  const linked = await call({ body: { action: "edit", prompt: "A room", image: { url: "https://evil.example/a.png" } }, fetchImpl });
  assert.equal(linked.status, 400);
  const guests = await call({ body: { action: "generate", prompt: "A room", guestFacts: "Sample Ada" }, fetchImpl });
  assert.equal(guests.status, 400);
  assert.equal(called, false);
  const urlOnly = await call({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ url: "https://images.example/only.png" }] }) }),
  });
  assert.equal(urlOnly.status, 502);
  assert.match(urlOnly.body.message, /not downloaded/);
});

test("image requests use a small separate cap and a missing key makes no provider call", async () => {
  assert.equal(IMAGE_LIMITS.perIp, 8);
  assert.equal(IMAGE_LIMITS.global, 40);
  assert.equal(IMAGE_LIMITS.maxInflight, 2);
  const store = new Map();
  store.set("image:203.0.113.41", Array.from({ length: IMAGE_LIMITS.perIp }, () => 80_000));
  let called = false;
  const blocked = await call({
    store,
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG }] }) };
    },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.scope, "image");
  assert.equal(called, false);
  const missing = await call({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  assert.equal(missing.status, 503);
  assert.equal(called, false);
});
