import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCENE, mergeScene, sanitizeScene } from "../lib/sceneSchema.js";
import { DEFAULT_MODEL, handleSceneChat } from "../lib/sceneChat.js";

const origin = "http://localhost:5173";

function call(extra) {
  return handleSceneChat({
    method: "POST",
    origin,
    ip: "203.0.113.10",
    body: { messages: [{ role: "user", content: "Make the room sunrise orange." }] },
    rawLength: 80,
    now: 1_000,
    store: new Map(),
    apiKey: "test-key",
    model: "grok-4.20-0309-non-reasoning",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"reply":"Sunrise it is.","scene":{"colors":{"glow":"#ffb067"}}}' } }] }) }),
    ...extra,
  });
}

test("unsafe scene fields are dropped and numbers are clamped", () => {
  const scene = sanitizeScene({
    colors: { glow: "#FFB067", base: "red", html: "<b>" },
    name: "<script>alert(1)</script> Nova",
    line: "Friday · 9 PM",
    portrait: { x: 4, scale: 9, y: "no" },
    javascript: "alert(1)",
    shapes: { count: 99, softness: 0.2 },
  });
  assert.deepEqual(scene.colors, { glow: "#ffb067" });
  assert.equal(scene.name.includes("<"), false);
  assert.equal(scene.name.includes("Nova"), true);
  assert.equal(scene.portrait.x, 1);
  assert.equal(scene.portrait.scale, 1.35);
  assert.equal(scene.portrait.y, undefined);
  assert.equal(scene.javascript, undefined);
  assert.equal(scene.shapes.count, 7);
  const merged = mergeScene(DEFAULT_SCENE, scene);
  assert.equal(merged.colors.base, DEFAULT_SCENE.colors.base);
  assert.equal(merged.colors.glow, "#ffb067");
});

test("a missing server key is an error and does not call Grok", async () => {
  let called = false;
  const result = await call({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "not-configured");
  assert.equal(JSON.stringify(result.body).includes("test-key"), false);
});

test("a real Grok JSON reply is returned and the provider key stays out of the response", async () => {
  let auth = "";
  const result = await call({
    fetchImpl: async (_url, init) => {
      auth = init.headers.Authorization;
      assert.equal(init.body.includes("test-key"), false);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"reply":"Warmer now.","scene":{"colors":{"base":"#e36a3a"},"evil":"<img>"}}' } }] }),
      };
    },
  });
  assert.equal(auth, "Bearer test-key");
  assert.equal(result.status, 200);
  assert.equal(result.body.reply, "Warmer now.");
  assert.deepEqual(result.body.scene.colors, { base: "#e36a3a" });
  assert.equal(result.body.scene.evil, undefined);
  assert.equal(JSON.stringify(result.body).includes("test-key"), false);
});

test("the ninth message in a window is refused before Grok is called", async () => {
  const store = new Map();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"reply":"Ok.","scene":{}}' } }] }) };
  };
  for (let i = 0; i < 8; i += 1) {
    const result = await call({ store, now: 5_000 + i, fetchImpl, ip: "198.51.100.8" });
    assert.equal(result.status, 200);
  }
  const blocked = await call({ store, now: 5_100, fetchImpl, ip: "198.51.100.8" });
  assert.equal(blocked.status, 429);
  assert.equal(calls, 8);
});

test("the default model is the verified non-reasoning id", () => {
  assert.equal(DEFAULT_MODEL, "grok-4.20-0309-non-reasoning");
});

test("another website origin is refused", async () => {
  const result = await call({ origin: "https://evil.example" });
  assert.equal(result.status, 403);
  assert.equal(result.allowOrigin, null);
});

test("local dev ports can call chat and a missing key is still an error", async () => {
  const result = await call({ origin: "http://127.0.0.1:5176", apiKey: "  " });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "not-configured");
  assert.equal(result.allowOrigin, "http://127.0.0.1:5176");
});
