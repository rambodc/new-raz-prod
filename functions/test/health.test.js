import test from "node:test";
import assert from "node:assert/strict";
import { platformHealth } from "../index.js";

test("platform health reports the service identity and an ISO timestamp", () => {
  const result = platformHealth();
  assert.equal(result.status, "ok");
  assert.equal(result.service, "razzberry");
  assert.equal(Number.isNaN(Date.parse(result.checkedAt)), false);
});
