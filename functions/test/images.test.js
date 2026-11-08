import test from "node:test";
import assert from "node:assert/strict";
import { inspectImage } from "../lib/imageFile.js";
import { handleImageRequest, IMAGE_LIMITS, IMAGE_MODEL, IMAGE_ROUTE_BUDGET_SEC, EDIT_TIMEOUT_MS } from "../lib/images.js";

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
  assert.equal(request.deferred, true);
  assert.equal(request.response_format, undefined);
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
  assert.equal(request.aspect_ratio, undefined);
  assert.equal(request.deferred, undefined);
  assert.equal(request.response_format, "b64_json");
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
  assert.match(urlOnly.body.message, /won't download/);
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

test("an edit keeps the photo's aspect unless the instruction names a shape", async () => {
  let landscape = "";
  await call({
    body: { action: "edit", prompt: "Warm dusk light", aspect: "foreground", image: { data: PNG } },
    fetchImpl: async (_url, init) => {
      landscape = init.body;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG }] }) };
    },
  });
  assert.equal(JSON.parse(landscape).aspect_ratio, undefined);
  let portrait = "";
  await call({
    body: { action: "edit", prompt: "Make this a portrait", image: { data: PNG } },
    fetchImpl: async (_url, init) => {
      portrait = init.body;
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG }] }) };
    },
  });
  assert.equal(JSON.parse(portrait).aspect_ratio, "3:4");
});

test("generation starts under the hosting limit and a poll downloads only an x.ai image", async () => {
  assert.ok(IMAGE_ROUTE_BUDGET_SEC < 60);
  assert.ok(EDIT_TIMEOUT_MS < 60_000);
  const calls = [];
  const started = await call({
    fetchImpl: async (target, init) => {
      calls.push(target);
      assert.equal(JSON.parse(init.body).deferred, true);
      return { ok: true, status: 200, json: async () => ({ request_id: "req-12345678" }) };
    },
  });
  assert.equal(started.status, 202);
  assert.equal(started.body.status, "pending");
  assert.equal(started.body.requestId, "req-12345678");
  assert.equal(started.body.image, undefined);
  assert.equal(calls.length, 1);

  const png = Buffer.from(PNG, "base64");
  const done = await call({
    body: { action: "poll", requestId: "req-12345678" },
    fetchImpl: async (target) => {
      calls.push(String(target));
      if (String(target) === "https://api.x.ai/v1/images/req-12345678") {
        return { ok: true, status: 200, json: async () => ({ status: "done", data: [{ url: "https://imgen.x.ai/out.png" }] }) };
      }
      assert.equal(String(target), "https://imgen.x.ai/out.png");
      return { ok: true, status: 200, arrayBuffer: async () => png };
    },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.image, PNG);
  assert.equal(done.body.kind, "ai-generated");
  assert.equal(calls.includes("https://imgen.x.ai/out.png"), true);

  let fetchedEvil = false;
  const blocked = await call({
    body: { action: "poll", requestId: "req-12345678" },
    fetchImpl: async (target) => {
      if (String(target).includes("evil.example")) fetchedEvil = true;
      return { ok: true, status: 200, json: async () => ({ status: "done", data: [{ url: "https://evil.example/x.png" }] }) };
    },
  });
  assert.equal(blocked.status, 502);
  assert.match(blocked.body.message, /won't download/);
  assert.equal(fetchedEvil, false);
  const injected = await call({ body: { action: "poll", requestId: "req-12345678", url: "https://evil.example/x.png" } });
  assert.equal(injected.status, 400);
});
