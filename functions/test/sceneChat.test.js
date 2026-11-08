import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCENE, mergeScene, sanitizeScene } from "../lib/sceneSchema.js";
import { DEFAULT_MODEL, handleSceneChat, LIMITS } from "../lib/sceneChat.js";

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

test("one browser gets 1000 messages per 10 minutes and the next one waits", async () => {
  assert.equal(LIMITS.perIp, 1000);
  assert.equal(LIMITS.perIpWindowMs, 10 * 60 * 1000);
  assert.equal(LIMITS.global, 10_000);
  assert.equal(LIMITS.globalWindowMs, 60 * 60 * 1000);
  assert.ok(LIMITS.global >= LIMITS.perIp * (LIMITS.globalWindowMs / LIMITS.perIpWindowMs));
  assert.equal(LIMITS.maxOutputTokens, 700);
  assert.equal(LIMITS.maxMessages, 16);
  assert.equal(LIMITS.maxMessageChars, 500);
  assert.equal(LIMITS.maxRawBytes, 24_000);
  const store = new Map();
  const start = 5_000;
  store.set("ip:198.51.100.8", Array.from({ length: LIMITS.perIp - 1 }, (_, index) => start + index));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"reply":"Ok.","scene":{}}' } }] }) };
  };
  const allowed = await call({ store, now: start + LIMITS.perIp - 1, fetchImpl, ip: "198.51.100.8" });
  assert.equal(allowed.status, 200);
  const blocked = await call({ store, now: start + LIMITS.perIp, fetchImpl, ip: "198.51.100.8" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.scope, "browser");
  assert.equal(calls, 1);
  assert.match(blocked.body.message, /1000 messages every 10 minutes/);
  assert.equal(blocked.body.retryAfterSec > 0, true);
  const later = await call({ store, now: start + LIMITS.perIpWindowMs + 1, fetchImpl, ip: "198.51.100.8" });
  assert.equal(later.status, 200);
});

test("the default model is the verified non-reasoning id", () => {
  assert.equal(DEFAULT_MODEL, "grok-4.20-0309-non-reasoning");
});

test("a card is allowlisted and a password field is dropped", async () => {
  const result = await call({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "Which room?",
                scene: { colors: { glow: "red" } },
                card: {
                  type: "form",
                  id: "night-1",
                  prompt: "Name it <b>now</b>",
                  fields: ["eventTitle", "password"],
                },
              }),
            },
          },
        ],
      }),
    }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.card.type, "form");
  assert.deepEqual(result.body.card.fields, ["eventTitle"]);
  assert.equal(result.body.card.prompt.includes("<"), false);
  assert.equal(result.body.scene.colors, undefined);
});

test("another website origin is refused", async () => {
  const result = await call({ origin: "https://evil.example" });
  assert.equal(result.status, 403);
  assert.equal(result.allowOrigin, null);
});

test("the shared cap is per server copy and names the reset", async () => {
  const store = new Map();
  store.set("global", Array.from({ length: LIMITS.global }, () => 10_000));
  let calls = 0;
  const blocked = await call({
    store,
    now: 10_000,
    ip: "198.51.100.9",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"reply":"Ok.","scene":{}}' } }] }) };
    },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.scope, "instance");
  assert.match(blocked.body.message, /10000 messages an hour/);
  assert.equal(blocked.body.retryAfterSec > 0, true);
  assert.equal(calls, 0);
});

test("an event proposal is allowlisted and guest facts are context only", async () => {
  let sent = "";
  const result = await call({
    body: {
      messages: [{ role: "user", content: "Update the night." }],
      event: { title: "Friday night", venue: "<script>", style: "nope" },
      guestFacts: "yes: 1. Sample Ada.",
    },
    fetchImpl: async (_url, init) => {
      sent = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Proposal ready.",
                  scene: {},
                  card: {
                    type: "approval",
                    id: "e1",
                    prompt: "Update the page?",
                    proposal: {
                      event: { title: "Late <b>Friday</b>", venue: "The Hall", style: "expression(alert(1))", date: "2026-02-31" },
                      guests: { add: [{ name: "Sample Jo", group: "Friends", status: "yes" }, { name: "<>", status: "owner" }] },
                      scene: { name: "<style>body{}</style>" },
                    },
                  },
                }),
              },
            },
          ],
        }),
      };
    },
  });
  assert.equal(result.status, 200);
  assert.match(sent, /Sample Ada/);
  assert.equal(result.body.card.proposal.event.title.includes("<"), false);
  assert.equal(result.body.card.proposal.event.title.includes("Friday"), true);
  assert.equal(result.body.card.proposal.event.venue, "The Hall");
  assert.equal(result.body.card.proposal.event.date, undefined);
  assert.equal(result.body.card.proposal.event.style, undefined);
  assert.equal(result.body.card.proposal.guests.add.length, 1);
  assert.equal(result.body.card.proposal.guests.add[0].name, "Sample Jo");
  assert.equal(result.body.card.proposal.scene.name.includes("<"), false);
});

test("Dec 31 with no year becomes the next December 31, not a stale model year", async () => {
  let sent = "";
  const result = await call({
    now: Date.parse("2026-11-08T18:00:00Z"),
    body: { messages: [{ role: "user", content: "Let's do Dec31" }], event: { timeZone: "America/Edmonton" } },
    fetchImpl: async (_url, init) => {
      sent = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ reply: "Updated the date.", scene: {}, card: { type: "approval", id: "d1", prompt: "Use 2024-12-31?", proposal: { event: { date: "2024-12-31" } } } }) } }],
        }),
      };
    },
  });
  assert.match(sent, /2026-11-08/);
  assert.match(sent, /America\/Edmonton/);
  assert.equal(result.status, 200);
  assert.equal(result.body.card.proposal.event.date, "2026-12-31");
  assert.equal(result.body.card.prompt.includes("2024"), false);
  assert.equal(/\bupdated\b/i.test(result.body.reply), false);
  assert.match(result.body.reply, /Accept/);
});

test("an explicit past year is kept and a no-change reply cannot say updated", async () => {
  const historic = await call({
    now: Date.parse("2026-11-08T18:00:00Z"),
    body: { messages: [{ role: "user", content: "The show was December 31, 2024" }] },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ reply: "Updated.", scene: {}, card: { type: "approval", id: "d2", prompt: "Use this date?", proposal: { event: { date: "2026-12-31" } } } }) } }],
      }),
    }),
  });
  assert.equal(historic.body.card.proposal.event.date, "2024-12-31");
  assert.equal(/\bupdated\b/i.test(historic.body.reply), false);

  const empty = await call({
    now: Date.parse("2026-11-08T18:00:00Z"),
    body: { messages: [{ role: "user", content: "Make it feel warmer" }] },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: "Updated the night.", scene: {}, card: null }) } }] }),
    }),
  });
  assert.equal(empty.body.card, null);
  assert.deepEqual(empty.body.scene, {});
  assert.equal(/\bupdated\b/i.test(empty.body.reply), false);
  assert.match(empty.body.reply, /Nothing was changed/);
});

function modelCard(content) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  });
}

test("a compound request keeps title, venue, and time on the same approval as the date", async () => {
  const ask = "Midnight Drop at Sample Lounge on Dec31 at 21:00";
  const now = Date.parse("2026-11-08T18:00:00Z");
  const merged = await call({
    now,
    body: { messages: [{ role: "user", content: ask }] },
    fetchImpl: modelCard({
      reply: "Proposal ready for Midnight Drop at Sample Lounge.",
      scene: {},
      card: { type: "approval", id: "d-2026-12-31", prompt: "Use 2026-12-31?", proposal: { event: { date: "2026-12-31" } } },
    }),
  });
  assert.equal(merged.body.card.id, "d-2026-12-31");
  assert.equal(merged.body.card.type, "approval");
  assert.deepEqual(merged.body.scene, {});
  assert.equal(merged.body.card.proposal.event.title, "Midnight Drop");
  assert.equal(merged.body.card.proposal.event.venue, "Sample Lounge");
  assert.equal(merged.body.card.proposal.event.date, "2026-12-31");
  assert.equal(merged.body.card.proposal.event.time, "21:00");
  assert.match(merged.body.reply, /Proposal ready/);
  assert.equal(/\bupdated\b/i.test(merged.body.reply), false);

  const created = await call({
    now,
    body: { messages: [{ role: "user", content: ask }] },
    fetchImpl: modelCard({ reply: "Proposal ready for Midnight Drop.", scene: {}, card: null }),
  });
  assert.equal(created.body.card.type, "approval");
  assert.deepEqual(created.body.scene, {});
  assert.equal(created.body.card.proposal.event.title, "Midnight Drop");
  assert.equal(created.body.card.proposal.event.venue, "Sample Lounge");
  assert.equal(created.body.card.proposal.event.time, "21:00");
  assert.equal(created.body.card.proposal.event.date, "2026-12-31");
});

test("a date correction does not drop the other fields already on the proposal", async () => {
  const result = await call({
    now: Date.parse("2026-11-08T18:00:00Z"),
    body: { messages: [{ role: "user", content: "December 31, 2024" }] },
    fetchImpl: modelCard({
      reply: "Proposal ready.",
      scene: {},
      card: {
        type: "approval",
        id: "keep-1",
        prompt: "Use this night?",
        proposal: { event: { title: "Keep Me", venue: "The Hall", time: "20:00", date: "2026-12-31" } },
      },
    }),
  });
  assert.equal(result.body.card.id, "keep-1");
  assert.equal(result.body.card.proposal.event.date, "2024-12-31");
  assert.equal(result.body.card.proposal.event.title, "Keep Me");
  assert.equal(result.body.card.proposal.event.venue, "The Hall");
  assert.equal(result.body.card.proposal.event.time, "20:00");
  assert.deepEqual(result.body.scene, {});
});

test("an impossible day does not turn into a different date", async () => {
  const result = await call({
    now: Date.parse("2026-11-08T18:00:00Z"),
    body: { messages: [{ role: "user", content: "February 31" }] },
    fetchImpl: modelCard({
      reply: "March 1, 2027 or March 3, 2027?",
      scene: {},
      card: {
        type: "choice",
        id: "march",
        prompt: "Which day?",
        options: [
          { id: "a", label: "March 1, 2027" },
          { id: "b", label: "March 3, 2027" },
        ],
      },
    }),
  });
  assert.equal(result.body.card, null);
  assert.equal(/march|2027/i.test(result.body.reply), false);
  assert.match(result.body.reply, /isn't a real calendar day/);
});

test("local dev ports can call chat and a missing key is still an error", async () => {
  const result = await call({ origin: "http://127.0.0.1:5176", apiKey: "  " });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "not-configured");
  assert.equal(result.allowOrigin, "http://127.0.0.1:5176");
});
