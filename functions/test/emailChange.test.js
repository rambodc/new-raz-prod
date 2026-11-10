import test from "node:test";
import assert from "node:assert/strict";
import { confirmEmailChange, emailChangedNotice, EmailChangeError, changeEmailMessage, requestEmailChange } from "../lib/emailChange.js";
import { codesMatch, FROM_ADDRESS, sha256 } from "../lib/loginCode.js";

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
        update: async (patch) => { store.set(path, { ...(store.get(path) || {}), ...patch }); },
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

function fakeAuth(users) {
  const byEmail = new Map(users.map((user) => [user.email, { ...user }]));
  return {
    byEmail,
    async getUser(uid) {
      for (const user of byEmail.values()) if (user.uid === uid) return user;
      const error = new Error("missing");
      error.code = "auth/user-not-found";
      throw error;
    },
    async getUserByEmail(email) {
      const user = byEmail.get(email);
      if (!user) {
        const error = new Error("not found");
        error.code = "auth/user-not-found";
        throw error;
      }
      return user;
    },
    async updateUser(uid, patch) {
      for (const [email, user] of byEmail) {
        if (user.uid !== uid) continue;
        if (patch.email && patch.email !== email) {
          if (byEmail.has(patch.email)) {
            const error = new Error("exists");
            error.code = "auth/email-already-exists";
            throw error;
          }
          byEmail.delete(email);
          user.email = patch.email;
          byEmail.set(patch.email, user);
        }
        Object.assign(user, patch);
        return user;
      }
      const error = new Error("missing");
      error.code = "auth/user-not-found";
      throw error;
    },
  };
}

function harness(extra = {}) {
  const db = fakeDb(extra.seed);
  const sent = [];
  const auth = fakeAuth(extra.users ?? [{ uid: "ada", email: "ada@example.com", emailVerified: true }]);
  const deps = {
    db,
    auth,
    uid: "ada",
    limits: LIMITS,
    now: extra.now ?? 1_000_000,
    newCode: () => "482017",
    newId: () => "code-id",
    timestampOf: ts,
    sendEmail: async (payload) => {
      sent.push(payload);
      return extra.sendResult ?? { data: { id: "email-1" } };
    },
  };
  return { db, auth, sent, deps };
}

test("the change-email message matches the sign-in template and keeps the code out of the subject", () => {
  const mail = changeEmailMessage("482017");
  assert.equal(mail.subject.includes("482017"), false);
  assert.equal(mail.html.includes("482017"), true);
  assert.match(mail.html, /#D81E5B/);
  assert.match(mail.html, /Razzberry/);
  assert.match(mail.html, /lang="en"/);
  assert.match(mail.html, /role="presentation"/);
  assert.match(mail.html, /10 minutes/);
  assert.equal(mail.html.toLowerCase().includes("password"), false);
  assert.equal(FROM_ADDRESS, "Razzberry <login@irobotx.io>");
  const note = emailChangedNotice("ada@example.com", "bea@example.com");
  assert.equal(note.subject.includes("482017"), false);
  assert.equal(note.html.includes("ada@example.com"), true);
  assert.equal(note.html.includes("bea@example.com"), true);
  assert.equal(note.text.toLowerCase().includes("password"), false);
});

test("a code goes to the new address and only a hash is stored", async () => {
  const { db, sent, deps } = harness({
    seed: {
      "users/ada": { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role: "artist" },
      "artists/ada": { name: "Ada", ownerUid: "ada" },
    },
  });
  const result = await requestEmailChange({ ...deps, email: "Bea@Example.com" });
  assert.deepEqual(result, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "bea@example.com");
  assert.equal(sent[0].kind, "email-change");
  assert.equal(sent[0].mail.subject, "Confirm your new Razzberry email");
  assert.equal(JSON.stringify(db.store.get("emailChanges/ada")).includes("482017"), false);
  const stored = db.store.get("emailChanges/ada");
  assert.equal(codesMatch("482017", stored.salt, stored.codeHash), true);
  assert.equal(stored.previousEmail, "ada@example.com");
  assert.equal(db.store.get("artists/ada").name, "Ada");
});

test("an email that already belongs to someone else is rejected before a code is sent", async () => {
  const { db, sent, deps } = harness({
    users: [
      { uid: "ada", email: "ada@example.com", emailVerified: true },
      { uid: "bea", email: "bea@example.com", emailVerified: true },
    ],
  });
  await assert.rejects(requestEmailChange({ ...deps, email: "bea@example.com" }), (error) => error instanceof EmailChangeError && error.reason === "email-taken");
  await assert.rejects(requestEmailChange({ ...deps, email: "ada@example.com" }), (error) => error.reason === "same-email");
  assert.equal(sent.length, 0);
  assert.equal(db.store.has("emailChanges/ada"), false);
});

test("the right code updates the same user and tells the old address", async () => {
  const { db, auth, sent, deps } = harness({
    seed: {
      "users/ada": { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", photoURL: "pic", role: "artist" },
      "artists/ada": { name: "Ada", ownerUid: "ada" },
      "events/night": { artistId: "ada", title: "Night" },
    },
  });
  await requestEmailChange({ ...deps, email: "bea@example.com" });
  const wrong = await assert.rejects(
    confirmEmailChange({ ...deps, code: "000000", now: deps.now + 1000 }),
    (error) => error.reason === "wrong-code",
  );
  assert.equal(wrong, undefined);
  assert.equal(db.store.get("emailChanges/ada").attempts, 1);
  const result = await confirmEmailChange({ ...deps, code: "482017", now: deps.now + 2000 });
  assert.equal(result.email, "bea@example.com");
  assert.equal(auth.byEmail.has("ada@example.com"), false);
  assert.equal(auth.byEmail.get("bea@example.com").uid, "ada");
  assert.equal(auth.byEmail.get("bea@example.com").emailVerified, true);
  const profile = db.store.get("users/ada");
  assert.equal(profile.email, "bea@example.com");
  assert.equal(profile.role, "artist");
  assert.equal(profile.firstName, "Ada");
  assert.equal(profile.photoURL, "pic");
  assert.equal(db.store.get("artists/ada").ownerUid, "ada");
  assert.equal(db.store.get("events/night").artistId, "ada");
  assert.equal(db.store.has("emailChanges/ada"), false);
  const notice = sent.find((item) => item.kind === "email-changed");
  assert.equal(notice.to, "ada@example.com");
  assert.equal(notice.mail.subject, "Your Razzberry email was changed");
  assert.equal(sha256("ada").length, 64);
});

test("a failed send removes the hash and a taken address still loses at confirm time", async () => {
  const failing = harness({ sendResult: { error: { message: "nope" } } });
  await assert.rejects(requestEmailChange({ ...failing.deps, email: "bea@example.com" }), (error) => error.reason === "send-failed");
  assert.equal(failing.db.store.has("emailChanges/ada"), false);

  const { db, auth, deps } = harness();
  await requestEmailChange({ ...deps, email: "bea@example.com" });
  auth.byEmail.set("bea@example.com", { uid: "other", email: "bea@example.com", emailVerified: true });
  await assert.rejects(confirmEmailChange({ ...deps, code: "482017", now: deps.now + 1000 }), (error) => error.reason === "email-taken");
  assert.equal(auth.byEmail.get("ada@example.com").uid, "ada");
  assert.equal(db.store.has("emailChanges/ada"), false);
});
