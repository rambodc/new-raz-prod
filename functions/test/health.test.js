import test from "node:test";
import assert from "node:assert/strict";
import { accountAccessReply, platformHealth } from "../index.js";

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
