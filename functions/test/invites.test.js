import test from "node:test";
import assert from "node:assert/strict";
import { attributeNewUser } from "../lib/loginCode.js";
import { inviteLine, inviteShareMeta, rsvpEmail, createInvite, deactivateInvite, eventDesk, generateInviteCode, inviteCover, isInviteCode, openInvite, rsvpCancel, rsvpGoing } from "../lib/invites.js";
import { FROM_ADDRESS } from "../lib/loginCode.js";
import { zonedInstant } from "../lib/when.js";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const FUTURE = zonedInstant(2026, 12, 1, 21, 0);
const PAST = zonedInstant(2026, 1, 2, 21, 0);
const ts = (ms) => ({ ms });

function memoryDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  function childDocs(collectionPath) {
    const prefix = `${collectionPath}/`;
    return [...store.entries()].filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"));
  }
  function refFor(path) {
    return {
      path,
      id: path.split("/").pop(),
      async get() {
        return snap(path);
      },
      async set(value) {
        store.set(path, value);
      },
      async update(patch) {
        store.set(path, { ...(store.get(path) || {}), ...patch });
      },
      async delete() {
        store.delete(path);
      },
    };
  }
  function snap(path) {
    const data = store.get(path);
    return {
      id: path.split("/").pop(),
      exists: store.has(path),
      data: () => data,
      ref: refFor(path),
    };
  }
  function query(collectionPath) {
    const filters = [];
    const api = {
      where(field, op, value) {
        if (op !== "==") throw new Error(op);
        filters.push([field, value]);
        return api;
      },
      limit() {
        return api;
      },
      async get() {
        const docs = childDocs(collectionPath)
          .filter(([, data]) => filters.every(([field, value]) => data?.[field] === value))
          .map(([path]) => snap(path));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return api;
  }
  return {
    store,
    doc(path) {
      return refFor(path);
    },
    collection(path) {
      return query(path);
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          return ref.get();
        },
        set(ref, value) {
          store.set(ref.path, value);
        },
        update(ref, patch) {
          store.set(ref.path, { ...(store.get(ref.path) || {}), ...patch });
        },
        delete(ref) {
          store.delete(ref.path);
        },
      };
      await fn(tx);
    },
  };
}

function eventRecord(extra = {}) {
  return {
    artistId: "nova",
    title: "Show1",
    slug: "show1",
    visibility: "public",
    showGuestList: false,
    venue: "Commonwealth",
    city: "Calgary",
    description: "A late set",
    imageURL: "https://example.com/show.jpg",
    ticketUrl: "",
    startsAt: FUTURE,
    ...extra,
  };
}

function seedHost() {
  return {
    "users/nova": { firstName: "Nova", lastName: "Vale", email: "nova@example.com", role: "artist" },
    "users/rambod": { firstName: "Rambod", lastName: "Reed", email: "rambod@example.com", role: "fan", photoURL: "https://example.com/r.jpg" },
    "artists/nova": { name: "Nova Vale", slug: "nova", imageURL: "https://example.com/nova.jpg", ownerUid: "nova" },
    "events/show": eventRecord(),
    "events/secret": eventRecord({ title: "Secret Set", slug: "secret-set", visibility: "private", venue: "Loft", city: "Calgary" }),
  };
}

test("invite codes are short and unguessable", () => {
  const code = generateInviteCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.equal(code.length, 10);
  assert.equal(isInviteCode(code), true);
  assert.equal(isInviteCode("short"), false);
  assert.equal(isInviteCode("iiiiiiiiii"), false);
  assert.equal(inviteLine("Rambod", "Show1"), "Rambod invited you to Show1");
  assert.equal(inviteLine("", "Show1"), "Someone invited you to Show1");
});

test("a signed-in person can invite to a public event, and a private event only the host or someone going", async () => {
  const db = memoryDb(seedHost());
  await assert.rejects(
    createInvite({ db, uid: "", eventId: "show", guestKey: "a".repeat(32), now: NOW, timestampOf: ts, newCode: () => "abcdefghjk" }),
    (error) => error.reason === "unauthenticated",
  );
  const guest = await createInvite({ db, uid: "rambod", eventId: "show", now: NOW, timestampOf: ts, newCode: () => "abcdefghjk" });
  assert.equal(guest.code, "abcdefghjk");
  assert.equal(guest.message, "Rambod invited you to Show1");
  const again = await createInvite({ db, uid: "rambod", eventId: "show", now: NOW + 1000, timestampOf: ts, newCode: () => "bbbbbbbbbb" });
  assert.equal(again.code, "abcdefghjk");
  assert.equal(again.reused, true);

  const host = await createInvite({ db, uid: "nova", eventId: "secret", now: NOW, timestampOf: ts, newCode: () => "bcdefghjkm" });
  assert.equal(host.message, "Nova invited you to Secret Set");
  await assert.rejects(
    createInvite({ db, uid: "rambod", eventId: "secret", now: NOW, timestampOf: ts, newCode: () => "cdefghjkmn" }),
    (error) => error.reason === "forbidden",
  );
  await assert.rejects(
    createInvite({ db, uid: "", eventId: "secret", guestKey: "b".repeat(32), now: NOW, timestampOf: ts }),
    (error) => error.reason === "unauthenticated",
  );
});

test("a valid invite reveals a private event and a bad code reveals nothing", async () => {
  const db = memoryDb({
    ...seedHost(),
    "invites/bcdefghjkm": {
      code: "bcdefghjkm",
      eventId: "secret",
      artistId: "nova",
      createdBy: "nova",
      inviterName: "Nova",
      active: true,
      opens: 0,
    },
  });
  const hidden = await openInvite({ db, code: "zzzzzzzzzz", deviceKey: "c".repeat(32), ip: "203.0.113.8", now: NOW, timestampOf: ts });
  assert.equal(hidden.state, "inactive");
  assert.equal(hidden.event, undefined);
  assert.equal(JSON.stringify(hidden).includes("Loft"), false);
  assert.equal(JSON.stringify(hidden).includes("Secret"), false);

  const opened = await openInvite({ db, uid: "rambod", code: "bcdefghjkm", deviceKey: "c".repeat(32), ip: "203.0.113.9", now: NOW, timestampOf: ts });
  assert.equal(opened.state, "ok");
  assert.equal(opened.event.title, "Secret Set");
  assert.equal(opened.event.venue, "Loft");
  assert.equal(opened.event.city, "Calgary");
  assert.equal(opened.event.imageURL, "/api/invite-cover?code=bcdefghjkm");
  assert.equal(db.store.get("events/secret/access/rambod").inviteCode, "bcdefghjkm");
  assert.equal(db.store.get("invites/bcdefghjkm").opens, 1);
  const second = await openInvite({ db, uid: "rambod", code: "bcdefghjkm", deviceKey: "c".repeat(32), ip: "203.0.113.9", now: NOW + 10, timestampOf: ts });
  assert.equal(second.event.venue, "Loft");
  assert.equal(db.store.get("invites/bcdefghjkm").opens, 1);

  const desk = await eventDesk({ db, uid: "", eventId: "secret" });
  assert.equal(desk.state, "private");
  assert.equal(JSON.stringify(desk).includes("Loft"), false);
  assert.equal(JSON.stringify(desk).includes("Secret"), false);
  const granted = await eventDesk({ db, uid: "rambod", eventId: "secret" });
  assert.equal(granted.state, "ok");
  assert.equal(granted.event, undefined);
  assert.equal(granted.canInvite, false);
});

test("deactivating a link hides the event again, and going guests keep their RSVP", async () => {
  const db = memoryDb({
    ...seedHost(),
    "invites/bcdefghjkm": { code: "bcdefghjkm", eventId: "secret", artistId: "nova", createdBy: "nova", active: true, opens: 2 },
    "events/secret/access/rambod": { inviteCode: "bcdefghjkm" },
    "events/secret/access/bea": { inviteCode: "bcdefghjkm" },
    "events/secret/rsvps/bea": { status: "going", name: "Bea", inviteCode: "bcdefghjkm" },
  });
  await assert.rejects(deactivateInvite({ db, uid: "rambod", code: "bcdefghjkm", now: NOW }), (error) => error.reason === "forbidden");
  const done = await deactivateInvite({ db, uid: "nova", code: "bcdefghjkm", now: NOW });
  assert.equal(done.active, false);
  assert.equal(db.store.has("events/secret/access/rambod"), false);
  assert.equal(db.store.has("events/secret/access/bea"), true);
  assert.equal(db.store.get("events/secret/rsvps/bea").status, "going");
  const closed = await openInvite({ db, code: "bcdefghjkm", deviceKey: "d".repeat(32), ip: "198.51.100.4", now: NOW, timestampOf: ts });
  assert.equal(closed.state, "inactive");
  assert.equal(closed.event, undefined);

  const fresh = await createInvite({ db, uid: "nova", eventId: "secret", regenerate: true, now: NOW + 5, timestampOf: ts, newCode: () => "defghjkmnp" });
  assert.equal(fresh.code, "defghjkmnp");
  assert.equal(db.store.get("invites/bcdefghjkm").active, false);
});

test("an invite link expires after the night ends", async () => {
  const db = memoryDb({
    "events/old": eventRecord({ startsAt: PAST, title: "Old Night", venue: "Loft" }),
    "invites/efghjkmnpq": { code: "efghjkmnpq", eventId: "old", artistId: "nova", createdBy: "nova", active: true },
  });
  const ended = await openInvite({ db, code: "efghjkmnpq", deviceKey: "e".repeat(32), ip: "198.51.100.5", now: NOW, timestampOf: ts });
  assert.equal(ended.state, "ended");
  assert.equal(JSON.stringify(ended).includes("Loft"), false);
  assert.equal(JSON.stringify(ended).includes("Old Night"), false);
});

test("going attributes the inviter, counts a new signup once, and emails the host", async () => {
  const db = memoryDb({
    ...seedHost(),
    "users/rambod": {
      firstName: "Rambod",
      lastName: "Reed",
      email: "rambod@example.com",
      photoURL: "https://example.com/r.jpg",
      invitedBy: "nova",
      inviteCode: "bcdefghjkm",
      createdAt: { ms: NOW - 1000 },
    },
    "invites/bcdefghjkm": {
      code: "bcdefghjkm",
      eventId: "secret",
      artistId: "nova",
      createdBy: "nova",
      inviterName: "Nova",
      active: true,
      opens: 1,
      rsvpCount: 0,
      signupCount: 0,
    },
  });
  const sent = [];
  const result = await rsvpGoing({
    db,
    auth: { async getUser() { return { email: "nova@example.com" }; } },
    uid: "rambod",
    eventId: "secret",
    inviteCode: "bcdefghjkm",
    now: NOW,
    timestampOf: ts,
    sendEmail: async (payload) => {
      sent.push(payload);
      return { error: null };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.newSignup, true);
  assert.equal(result.emailed, true);
  const rsvp = db.store.get("events/secret/rsvps/rambod");
  assert.equal(rsvp.status, "going");
  assert.equal(rsvp.name, "Rambod Reed");
  assert.equal(rsvp.invitedBy, "nova");
  assert.equal(rsvp.inviteCode, "bcdefghjkm");
  assert.equal(rsvp.newSignup, true);
  assert.equal(db.store.get("events/secret/stats/public").goingCount, 1);
  assert.equal(db.store.get("events/secret/stats/host").signupCount, 1);
  assert.equal(db.store.get("invites/bcdefghjkm").rsvpCount, 1);
  assert.equal(db.store.get("invites/bcdefghjkm").signupCount, 1);
  assert.equal(db.store.get("users/rambod").signupCounted, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "nova@example.com");
  assert.equal(sent[0].kind, "rsvp");
  assert.equal(sent[0].mail.subject, "Rambod Reed is going to Secret Set");
  assert.match(sent[0].mail.html, /Rambod Reed is going to Secret Set/);
  assert.match(sent[0].mail.html, /#D81E5B/);
  assert.match(sent[0].mail.text, /https:\/\/new-raz-prod\.web\.app\/event\/secret/);
  assert.equal(sent[0].mail.from, FROM_ADDRESS);
  assert.equal(JSON.stringify(sent[0]).includes("re_"), false);

  const again = await rsvpGoing({
    db,
    uid: "rambod",
    eventId: "secret",
    inviteCode: "bcdefghjkm",
    now: NOW + 50,
    timestampOf: ts,
    sendEmail: async (payload) => {
      sent.push(payload);
      return { error: null };
    },
  });
  assert.equal(again.already, true);
  assert.equal(sent.length, 1);

  const desk = await eventDesk({ db, uid: "nova", eventId: "secret" });
  assert.equal(desk.host.goingCount, 1);
  assert.equal(desk.host.signupCount, 1);
  assert.equal(desk.host.guests[0].name, "Rambod Reed");
  assert.equal(desk.host.guests[0].inviteCode, "bcdefghjkm");
  assert.equal(desk.host.guests[0].newSignup, true);
  assert.equal(desk.guests, null);

  await db.doc("events/secret").update({ showGuestList: true });
  const listed = await eventDesk({ db, uid: "rambod", eventId: "secret" });
  assert.equal(listed.guests.length, 1);
  assert.equal(listed.guests[0].name, "Rambod Reed");
  assert.equal(listed.guests[0].inviteCode, undefined);
  assert.equal(listed.host, null);

  await rsvpCancel({ db, uid: "rambod", eventId: "secret" });
  assert.equal(db.store.has("events/secret/rsvps/rambod"), false);
  assert.equal(db.store.get("events/secret/stats/public").goingCount, 0);
  assert.equal(db.store.get("events/secret/stats/host").signupCount, 1);
});

test("a new signup stores the inviter, and an existing account does not get overwritten", async () => {
  const db = memoryDb({
    "events/show": eventRecord(),
    "invites/bcdefghjkm": { code: "bcdefghjkm", eventId: "show", createdBy: "nova", active: true },
    "users/old": { firstName: "Ada", invitedBy: "", inviteCode: "" },
  });
  db.store.set("users/new", { firstName: "", email: "new@example.com" });
  await attributeNewUser(db, "new", "bcdefghjkm", NOW);
  assert.equal(db.store.get("users/new").invitedBy, "nova");
  assert.equal(db.store.get("users/new").inviteCode, "bcdefghjkm");
  await attributeNewUser(db, "old", "bcdefghjkm", NOW);
  assert.equal(db.store.get("users/old").invitedBy, "");
});

test("the rsvp email is the branded Razzberry card and the cover stays behind the code", async () => {
  const mail = rsvpEmail({ guestName: "Rambod", eventName: "Show1", eventUrl: "https://new-raz-prod.web.app/event/show" });
  assert.match(mail.html, /Razzberry/);
  assert.match(mail.html, /Rambod is going to Show1/);
  assert.equal(mail.from, FROM_ADDRESS);
  const db = memoryDb({
    "events/secret": eventRecord({ visibility: "private" }),
    "invites/bcdefghjkm": { code: "bcdefghjkm", eventId: "secret", active: true },
  });
  const bucket = {
    file() {
      return {
        async download() {
          return [Buffer.from([0xff, 0xd8])];
        },
        async getMetadata() {
          return [{ contentType: "image/jpeg" }];
        },
      };
    },
  };
  const ok = await inviteCover({ db, bucket, code: "bcdefghjkm", now: NOW, ip: "203.0.113.10" });
  assert.equal(ok.contentType, "image/jpeg");
  assert.equal(ok.buffer[0], 0xff);
  const missing = await inviteCover({ db, bucket, code: "zzzzzzzzzz", now: NOW, ip: "203.0.113.11" });
  assert.equal(missing, null);
});

test("invite previews show a public card and a private card without the location", async () => {
  const db = memoryDb({
    ...seedHost(),
    "invites/bcdefghjkm": { code: "bcdefghjkm", eventId: "secret", active: true },
    "invites/cdefghjkmn": { code: "cdefghjkmn", eventId: "show", active: true },
  });
  const priv = await inviteShareMeta({ db, origin: "https://new-raz-prod.web.app", code: "bcdefghjkm", now: NOW });
  assert.equal(priv.cardTitle, "Secret Set");
  assert.equal(priv.cardSubtitle, "You're invited");
  assert.equal(priv.imageSource, "");
  assert.equal(JSON.stringify(priv).includes("Loft"), false);
  assert.equal(JSON.stringify(priv).includes("Calgary"), false);
  assert.equal(priv.cache, "private, no-store");

  const pub = await inviteShareMeta({ db, origin: "https://new-raz-prod.web.app", code: "cdefghjkmn", now: NOW });
  assert.equal(pub.cardTitle, "Show1");
  assert.match(pub.cardSubtitle, /Dec 1/);
  assert.equal(pub.imageSource, "https://example.com/show.jpg");
  assert.equal(JSON.stringify(pub).includes("Commonwealth"), false);

  const ended = await inviteShareMeta({
    db: memoryDb({
      "events/old": eventRecord({ startsAt: PAST, venue: "Loft", title: "Old Night" }),
      "invites/efghjkmnpq": { code: "efghjkmnpq", eventId: "old", active: true },
    }),
    origin: "https://new-raz-prod.web.app",
    code: "efghjkmnpq",
    now: NOW,
  });
  assert.equal(ended.title, "This event has ended");
  assert.equal(JSON.stringify(ended).includes("Loft"), false);
  assert.equal(JSON.stringify(ended).includes("Old Night"), false);
});
