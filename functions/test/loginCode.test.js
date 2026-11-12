import test from "node:test";
import assert from "node:assert/strict";
import { acceptLoginCode, codesMatch, emulatorSinkEnabled, hashCode, issueLoginCode, isValidEmail, loginEmail, nextRateState, normalizeEmail, sha256, LoginError, CODE_TTL_MS, MAX_ATTEMPTS, FROM_ADDRESS } from "../lib/loginCode.js";

const LIMITS = { emailMax: 3, ipMax: 4, minIntervalMs: 60_000 };
const ts = (ms) => ({ ms });

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const snapOf = (source, path) => ({ exists: source.has(path), data: () => source.get(path) });
  return {
    store,
    doc(path) {
      return {
        path,
        get: async () => snapOf(store, path),
        delete: async () => { store.delete(path); },
        set: async (data) => { store.set(path, data); },
      };
    },
    async runTransaction(fn) {
      const base = new Map(store);
      const pending = new Map();
      const deleted = new Set();
      const read = (path) => {
        if (deleted.has(path)) return new Map();
        if (pending.has(path)) return pending;
        return base;
      };
      const tx = {
        async get(ref) {
          const source = read(ref.path);
          if (source === pending || source === base) return snapOf(source, ref.path);
          return { exists: false, data: () => undefined };
        },
        set(ref, data) { deleted.delete(ref.path); pending.set(ref.path, data); },
        update(ref, patch) {
          const current = (pending.has(ref.path) ? pending.get(ref.path) : base.get(ref.path)) || {};
          deleted.delete(ref.path);
          pending.set(ref.path, { ...current, ...patch });
        },
        delete(ref) { pending.delete(ref.path); deleted.add(ref.path); },
      };
      await fn(tx);
      for (const path of deleted) store.delete(path);
      for (const [path, data] of pending) store.set(path, data);
    },
  };
}

function fakeAuth(users = []) {
  const byEmail = new Map(users.map((user) => [user.email, { ...user }]));
  let seq = users.length;
  return {
    byEmail,
    async getUserByEmail(email) {
      const user = byEmail.get(email);
      if (!user) {
        const error = new Error("not found");
        error.code = "auth/user-not-found";
        throw error;
      }
      return user;
    },
    async createUser({ email, emailVerified }) {
      if (byEmail.has(email)) {
        const error = new Error("exists");
        error.code = "auth/email-already-exists";
        throw error;
      }
      seq += 1;
      const user = { uid: `uid-${seq}`, email, emailVerified };
      byEmail.set(email, user);
      return user;
    },
    async updateUser(uid, patch) {
      for (const user of byEmail.values()) if (user.uid === uid) Object.assign(user, patch);
    },
    async createCustomToken(uid) {
      return `token-${uid}`;
    },
  };
}

function harness(extra = {}) {
  const db = fakeDb(extra.seed);
  const sent = [];
  const deps = {
    db,
    limits: LIMITS,
    now: extra.now ?? 1_000_000,
    newCode: extra.newCode ?? (() => "482017"),
    newId: () => "code-id",
    sendEmail: async (payload) => {
      sent.push(payload);
      return extra.sendResult ?? { data: { id: "email-1" } };
    },
    ...extra.deps,
  };
  return { db, sent, deps };
}

test("emails are normalized and checked", () => {
  assert.equal(normalizeEmail("  Ada@Example.com "), "ada@example.com");
  assert.equal(isValidEmail("ada@example.com"), true);
  assert.equal(isValidEmail("ada@example"), false);
  assert.equal(isValidEmail("not an email"), false);
  assert.equal(isValidEmail(""), false);
});

test("a code hashes to something that is not the code", () => {
  const hash = hashCode("482017", "salt");
  assert.notEqual(hash, "482017");
  assert.equal(codesMatch("482017", "salt", hash), true);
  assert.equal(codesMatch("482018", "salt", hash), false);
  assert.equal(codesMatch("482017", "other", hash), false);
});

test("the email is a plain sign-in code and does not put the code in the subject", () => {
  const mail = loginEmail("482017");
  assert.equal(mail.subject, "Your Razzberry sign-in code");
  assert.equal(mail.subject.includes("482017"), false);
  assert.equal(mail.html.includes("482017"), true);
  assert.equal(mail.text.includes("482017"), true);
  assert.match(mail.html, /lang="en"/);
  assert.match(mail.html, /dir="ltr"/);
  assert.match(mail.html, /role="presentation"/);
  assert.match(mail.html, /<h1/);
  assert.match(mail.html, /10 minutes/);
  assert.match(mail.text, /10 minutes/);
  assert.equal(mail.html.toLowerCase().includes("password"), false);
  assert.equal(FROM_ADDRESS, "Razzberry <login@irobotx.io>");
});

test("rate limits reset every hour and enforce a gap between emails", () => {
  const first = nextRateState(null, 0, { max: 2, minIntervalMs: 1000 });
  assert.equal(first.ok, true);
  const soon = nextRateState(first.state, 500, { max: 2, minIntervalMs: 1000 });
  assert.equal(soon.ok, false);
  assert.equal(soon.reason, "too-soon");
  const second = nextRateState(first.state, 1000, { max: 2, minIntervalMs: 1000 });
  assert.equal(second.ok, true);
  assert.equal(second.state.count, 2);
  const capped = nextRateState(second.state, 2000, { max: 2, minIntervalMs: 0 });
  assert.equal(capped.reason, "rate-limited");
  const later = nextRateState(second.state, 60 * 60 * 1000, { max: 2, minIntervalMs: 0 });
  assert.equal(later.ok, true);
  assert.equal(later.state.count, 1);
});

test("issuing a code stores only a hash and emails the code once", async () => {
  const { db, sent, deps } = harness();
  const result = await issueLoginCode({ ...deps, email: "Ada@Example.com", ip: "203.0.113.4" });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ada@example.com");
  assert.equal(sent[0].code, "482017");
  assert.equal(sent[0].idempotencyKey, `login-code/${sha256("ada@example.com")}/code-id`);
  const stored = db.store.get(`loginCodes/${sha256("ada@example.com")}`);
  assert.equal(JSON.stringify(stored).includes("482017"), false);
  assert.equal(codesMatch("482017", stored.salt, stored.codeHash), true);
  assert.equal(stored.attempts, 0);
  assert.equal(stored.expiresAt, deps.now + CODE_TTL_MS);
});

test("the same email cannot request another code inside the gap, and a failed send removes the hash", async () => {
  const { db, deps } = harness();
  await issueLoginCode({ ...deps, email: "ada@example.com", ip: "203.0.113.4" });
  await assert.rejects(
    issueLoginCode({ ...deps, email: "ada@example.com", ip: "203.0.113.9", now: deps.now + 1000 }),
    (error) => error instanceof LoginError && error.reason === "too-soon" && error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= 60,
  );
  const failing = harness({ sendResult: { error: { message: "nope" } }, newCode: () => "111111" });
  await assert.rejects(issueLoginCode({ ...failing.deps, email: "bea@example.com", ip: "203.0.113.8" }), (error) => error.reason === "send-failed");
  assert.equal(failing.db.store.has(`loginCodes/${sha256("bea@example.com")}`), false);
  const retried = await issueLoginCode({
    ...failing.deps,
    email: "bea@example.com",
    ip: "203.0.113.8",
    now: failing.deps.now + 1000,
    sendEmail: async () => ({ data: { id: "email-2" } }),
    newCode: () => "222222",
    newId: () => "retry",
  });
  assert.equal(retried.ok, true);
  assert.equal(db.store.has(`loginCodes/${sha256("ada@example.com")}`), true);
});

test("an IP can only request a few codes an hour, even for different emails", async () => {
  const { deps } = harness();
  const limits = { emailMax: 5, ipMax: 2, minIntervalMs: 0 };
  await issueLoginCode({ ...deps, limits, email: "a@example.com", ip: "198.51.100.10", newCode: () => "100001", newId: () => "1" });
  await issueLoginCode({ ...deps, limits, email: "b@example.com", ip: "198.51.100.10", newCode: () => "100002", newId: () => "2" });
  await assert.rejects(
    issueLoginCode({ ...deps, limits, email: "c@example.com", ip: "198.51.100.10", newCode: () => "100003", newId: () => "3" }),
    (error) => error.reason === "rate-limited",
  );
});

async function issue(deps, email = "ada@example.com") {
  await issueLoginCode({ ...deps, email, ip: "203.0.113.4" });
}

test("the right code signs a new fan in and a wrong code spends an attempt", async () => {
  const { db, deps } = harness();
  const auth = fakeAuth();
  await issue(deps);
  await assert.rejects(
    acceptLoginCode({ db, auth, email: "ada@example.com", code: "000000", now: deps.now + 1000, timestampOf: ts }),
    (error) => error.reason === "wrong-code",
  );
  const key = `loginCodes/${sha256("ada@example.com")}`;
  assert.equal(db.store.get(key).attempts, 1);
  const result = await acceptLoginCode({ db, auth, email: "Ada@Example.com", code: "482017", now: deps.now + 2000, timestampOf: ts });
  assert.equal(result.needsProfile, true);
  assert.equal(result.token, "token-uid-1");
  assert.equal(db.store.has(key), false);
  const profile = db.store.get("users/uid-1");
  assert.equal(profile.role, "fan");
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.firstName, "");
  assert.equal(auth.byEmail.get("ada@example.com").emailVerified, true);
});

test("a document that is not the current profile shape is left unchanged", async () => {
  const { db, deps } = harness({
    seed: { "users/old": { displayName: "Old Name", email: "ada@example.com", createdAt: { ms: 1 } } },
  });
  const auth = fakeAuth([{ uid: "old", email: "ada@example.com", emailVerified: true }]);
  await issue(deps);
  const result = await acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts });
  assert.equal(result.needsProfile, false);
  const profile = db.store.get("users/old");
  assert.equal(profile.displayName, "Old Name");
  assert.equal(Object.hasOwn(profile, "firstName"), false);
  assert.equal(Object.hasOwn(profile, "role"), false);
});

test("an unfinished profile still needs a name and is not rewritten", async () => {
  const { db, deps } = harness({
    seed: {
      "users/ada": {
        firstName: "",
        lastName: "",
        email: "ada@example.com",
        photoURL: "",
        role: "fan",
        createdAt: { ms: 1 },
      },
    },
  });
  const auth = fakeAuth([{ uid: "ada", email: "ada@example.com", emailVerified: true }]);
  await issue(deps);
  const result = await acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts });
  assert.equal(result.needsProfile, true);
  assert.equal(db.store.get("users/ada").createdAt.ms, 1);
  assert.equal(db.store.get("users/ada").firstName, "");
});

test("a returning fan with a name does not need the name step, and a code cannot be reused", async () => {
  const emailKey = sha256("ada@example.com");
  const auth = fakeAuth([{ uid: "ada", email: "ada@example.com", emailVerified: true }]);
  const { db, deps } = harness({
    seed: { "users/ada": { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role: "fan" } },
  });
  await issue(deps);
  const result = await acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts });
  assert.equal(result.needsProfile, false);
  assert.equal(result.token, "token-ada");
  assert.equal(db.store.get("users/ada").firstName, "Ada");
  await assert.rejects(
    acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts }),
    (error) => error.reason === "wrong-code",
  );
  assert.equal(emailKey.length, 64);
});

test("an artist profile is kept on the next sign-in", async () => {
  const auth = fakeAuth([{ uid: "nova", email: "nova@example.com", emailVerified: true }]);
  const { db, deps } = harness({
    seed: {
      "users/nova": {
        firstName: "Nova",
        lastName: "Vale",
        email: "nova@example.com",
        photoURL: "https://example.com/nova.jpg",
        role: "artist",
      },
    },
  });
  await issue(deps, "nova@example.com");
  const result = await acceptLoginCode({ db, auth, email: "nova@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts });
  assert.equal(result.needsProfile, false);
  assert.equal(db.store.get("users/nova").role, "artist");
  assert.equal(db.store.get("users/nova").firstName, "Nova");
  assert.equal(db.store.get("users/nova").photoURL, "https://example.com/nova.jpg");
});

test("expired codes and too many attempts are rejected", async () => {
  const { db, deps } = harness();
  const auth = fakeAuth();
  await issue(deps);
  await assert.rejects(
    acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + CODE_TTL_MS, timestampOf: ts }),
    (error) => error.reason === "expired",
  );
  await issue({ ...deps, now: deps.now + CODE_TTL_MS + 60_000, newId: () => "next" });
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    await assert.rejects(
      acceptLoginCode({ db, auth, email: "ada@example.com", code: "000000", now: deps.now + CODE_TTL_MS + 61_000, timestampOf: ts }),
      (error) => error.reason === "wrong-code",
    );
  }
  await assert.rejects(
    acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + CODE_TTL_MS + 62_000, timestampOf: ts }),
    (error) => error.reason === "too-many-attempts",
  );
});

test("a missing signBlob permission is reported as a token failure and does not grant access", async () => {
  const { db, deps } = harness();
  const auth = fakeAuth();
  auth.createCustomToken = async () => {
    const error = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource");
    error.code = "auth/insufficient-permission";
    throw error;
  };
  await issue(deps);
  await assert.rejects(
    acceptLoginCode({ db, auth, email: "ada@example.com", code: "482017", now: deps.now + 1000, timestampOf: ts }),
    (error) => error instanceof LoginError && error.reason === "token-failed",
  );
  assert.equal(db.store.has(`loginCodes/${sha256("ada@example.com")}`), true);
});

test("the emulator file sink stays off unless the functions emulator set the flag", () => {
  assert.equal(emulatorSinkEnabled({}), false);
  assert.equal(emulatorSinkEnabled({ FUNCTIONS_EMULATOR: "false" }), false);
  assert.equal(emulatorSinkEnabled({ FUNCTIONS_EMULATOR: "true" }), true);
});
