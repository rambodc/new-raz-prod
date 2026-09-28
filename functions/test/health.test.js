import test from "node:test";
import assert from "node:assert/strict";
import { accountAccessReply, openAiReply, platformHealth } from "../index.js";

test("platform health reports the service identity and an ISO timestamp", () => {
  const result = platformHealth();
  assert.equal(result.status, "ok");
  assert.equal(result.service, "razzberry");
  assert.equal(Number.isNaN(Date.parse(result.checkedAt)), false);
});

test("account questions return the account card for guests", () => {
  const result = accountAccessReply("Can I sign up?");
  assert.equal(result.card, "account-access");
  assert.match(result.text, /sign-up is available/i);
});

test("existing users get a clear signed-in answer and account card", () => {
  const result = accountAccessReply("can u create an account?", "listener@example.com");
  assert.equal(result.card, "account-access");
  assert.match(result.text, /already signed in as listener@example.com/i);
});

test("unrelated prompts are left for the product guide", () => {
  assert.equal(accountAccessReply("What is Razzberry?"), null);
});

test("OpenAI text events are parsed when the stream uses CRLF line endings", async () => {
  const originalFetch = globalThis.fetch;
  const deltas = [];
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response([
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"A clear\"}\r\n\r\n",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\" answer.\"}\r\n\r\n",
    "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}",
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const result = await openAiReply([{ role: "user", content: "What is this?" }], "test-key", (delta) => deltas.push(delta));
    assert.equal(result, "A clear answer.");
    assert.deepEqual(deltas, ["A clear", " answer."]);
    assert.equal(requestBody.max_output_tokens, 1000);
    assert.deepEqual(requestBody.reasoning, { effort: "low" });
  } finally { globalThis.fetch = originalFetch; }
});

test("completed OpenAI responses without deltas use the final response text", async () => {
  const originalFetch = globalThis.fetch;
  const deltas = [];
  globalThis.fetch = async () => new Response(
    "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output_text\":\"Recovered final text.\"}}",
    { headers: { "Content-Type": "text/event-stream" } },
  );
  try {
    const result = await openAiReply([{ role: "user", content: "What is this?" }], "test-key", (delta) => deltas.push(delta));
    assert.equal(result, "Recovered final text.");
    assert.deepEqual(deltas, ["Recovered final text."]);
  } finally { globalThis.fetch = originalFetch; }
});
