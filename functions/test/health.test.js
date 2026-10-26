import test from "node:test";
import assert from "node:assert/strict";
import { FUNCTIONS_VERSION, platformHealth } from "../index.js";

test("platform health reports the service identity, version and an ISO timestamp", () => {
  const result = platformHealth();
  assert.equal(result.status, "ok");
  assert.equal(result.service, "razzberry");
  assert.equal(result.version, FUNCTIONS_VERSION);
  assert.equal(Number.isNaN(Date.parse(result.checkedAt)), false);
});
