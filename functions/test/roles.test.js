import test from "node:test";
import assert from "node:assert/strict";
import { applyUserRole, artistNameFromProfile, RoleError } from "../lib/roles.js";

const ts = (ms) => ({ ms });

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    doc(path) {
      return { path };
    },
    async runTransaction(fn) {
      const pending = new Map();
      const tx = {
        async get(ref) {
          const data = pending.has(ref.path) ? pending.get(ref.path) : store.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        update(ref, patch) {
          const current = (pending.has(ref.path) ? pending.get(ref.path) : store.get(ref.path));
          if (!current) throw new Error(`missing ${ref.path}`);
          pending.set(ref.path, { ...current, ...patch });
        },
        set(ref, data) {
          pending.set(ref.path, data);
        },
      };
      await fn(tx);
      for (const [path, data] of pending) store.set(path, data);
    },
  };
}

function fakeAuth(users) {
  const byEmail = new Map(users.map((user) => [user.email, { customClaims: {}, ...user }]));
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
    async setCustomUserClaims(uid, claims) {
      for (const user of byEmail.values()) if (user.uid === uid) user.customClaims = claims;
    },
  };
}

const profile = {
  firstName: "Nova",
  lastName: "Vale",
  email: "nova@example.com",
  photoURL: "https://firebasestorage.googleapis.com/v0/b/new-raz-prod.firebasestorage.app/o/users%2Fnova%2Favatar?alt=media",
  role: "fan",
};

function harness(extra = {}) {
  const db = fakeDb({ "users/nova": { ...profile }, ...extra.seed });
  const auth = fakeAuth([{ uid: "nova", email: "nova@example.com", emailVerified: true, customClaims: extra.claims }]);
  return { db, auth };
}

const admin = { token: { admin: true } };

test("a caller without the admin claim cannot set a role", async () => {
  const { db, auth } = harness();
  await assert.rejects(
    applyUserRole({ db, auth, caller: { token: {} }, email: "nova@example.com", role: "artist", now: 10, timestampOf: ts }),
    (error) => error instanceof RoleError && error.reason === "forbidden",
  );
  await assert.rejects(
    applyUserRole({ db, auth, caller: null, email: "nova@example.com", role: "artist", now: 10, timestampOf: ts }),
    (error) => error.reason === "unauthenticated",
  );
  await assert.rejects(
    applyUserRole({ db, auth, caller: { token: { admin: "true" } }, email: "nova@example.com", role: "artist", now: 10, timestampOf: ts }),
    (error) => error.reason === "forbidden",
  );
  assert.equal(db.store.get("users/nova").role, "fan");
  assert.equal(db.store.has("artists/nova"), false);
});

test("promoting a fan creates the artist page from their name and photo, once", async () => {
  const { db, auth } = harness();
  const result = await applyUserRole({ db, auth, caller: admin, email: " Nova@Example.com ", role: "artist", now: 50, timestampOf: ts });
  assert.equal(result.uid, "nova");
  assert.equal(result.role, "artist");
  assert.equal(result.admin, false);
  assert.equal(db.store.get("users/nova").role, "artist");
  assert.deepEqual(db.store.get("artists/nova"), {
    name: "Nova Vale",
    bio: "",
    imageURL: profile.photoURL,
    ownerUid: "nova",
    createdAt: { ms: 50 },
    updatedAt: { ms: 50 },
  });
  db.store.get("artists/nova").bio = "kept";
  db.store.get("artists/nova").name = "DJ Nova";
  await applyUserRole({ db, auth, caller: admin, email: "nova@example.com", role: "artist", now: 80, timestampOf: ts });
  assert.equal(db.store.get("artists/nova").bio, "kept");
  assert.equal(db.store.get("artists/nova").name, "DJ Nova");
  assert.equal(db.store.get("artists/nova").createdAt.ms, 50);
});

test("demoting an artist leaves the page in place and a missing signup is rejected", async () => {
  const { db, auth } = harness();
  await applyUserRole({ db, auth, caller: admin, email: "nova@example.com", role: "artist", now: 1, timestampOf: ts });
  await applyUserRole({ db, auth, caller: admin, email: "nova@example.com", role: "fan", now: 2, timestampOf: ts });
  assert.equal(db.store.get("users/nova").role, "fan");
  assert.equal(db.store.get("artists/nova").name, "Nova Vale");
  const empty = fakeDb();
  await assert.rejects(
    applyUserRole({ db: empty, auth, caller: admin, email: "nova@example.com", role: "artist", now: 3, timestampOf: ts }),
    (error) => error.reason === "not-found",
  );
  await assert.rejects(
    applyUserRole({ db, auth, caller: admin, email: "missing@example.com", role: "fan", now: 3, timestampOf: ts }),
    (error) => error.reason === "not-found",
  );
  await assert.rejects(
    applyUserRole({ db, auth, caller: admin, email: "nova@example.com", role: "owner", now: 3, timestampOf: ts }),
    (error) => error.reason === "bad-role",
  );
});

test("the admin claim is separate from the role and keeps other claims", async () => {
  const { db, auth } = harness({ claims: { beta: true } });
  const result = await applyUserRole({
    db,
    auth,
    email: "nova@example.com",
    grantAdmin: true,
    now: 9,
    timestampOf: ts,
    trustCaller: true,
  });
  assert.equal(result.admin, true);
  assert.equal(result.role, null);
  assert.equal(db.store.get("users/nova").role, "fan");
  assert.equal(db.store.has("artists/nova"), false);
  assert.deepEqual(auth.byEmail.get("nova@example.com").customClaims, { beta: true, admin: true });
  assert.equal(artistNameFromProfile({ firstName: "Ada" }), "Ada");
  assert.equal(artistNameFromProfile({}), "Artist");
});
