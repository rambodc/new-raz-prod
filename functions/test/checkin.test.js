import test from "node:test";
import assert from "node:assert/strict";
import { CheckInError, MAX_IMAGE_BYTES, checkRules, distanceMeters, isLive, parseInput, performCheckIn, sniffImageType, validArtistId } from "../lib/checkin.js";
import { FUNCTIONS_VERSION } from "../index.js";

const T0 = Date.UTC(2026, 9, 28, 2, 0, 0);
const MIN = 60_000;
const ts = (ms) => ({ toMillis: () => ms, ms });

// A point in Calgary, and points a known distance north of it (1 degree of latitude is about 111.2 km).
const VENUE = { lat: 51.0447, lng: -114.0719 };
const north = (metres) => ({ lat: VENUE.lat + metres / 111_195, lng: VENUE.lng });

const show = (extra = {}) => ({ ...VENUE, startsAt: ts(T0), endsAt: ts(T0 + 180 * MIN), artistIds: ["a1", "a2"], artistNames: ["Alpha", "Beta"], ...extra });
const here = (extra = {}) => ({ ...VENUE, accuracy: 20, ...extra });

test("distance is close to the known value and zero for the same point", () => {
  assert.equal(distanceMeters(VENUE.lat, VENUE.lng, VENUE.lat, VENUE.lng), 0);
  const p = north(1000);
  assert.ok(Math.abs(distanceMeters(VENUE.lat, VENUE.lng, p.lat, p.lng) - 1000) < 5);
});

test("a show is live from 15 minutes before it starts to 15 minutes after it ends", () => {
  const s = show();
  assert.equal(isLive(s, T0 - 16 * MIN), false);
  assert.equal(isLive(s, T0 - 14 * MIN), true);
  assert.equal(isLive(s, T0 + 100 * MIN), true);
  assert.equal(isLive(s, T0 + 194 * MIN), true);
  assert.equal(isLive(s, T0 + 196 * MIN), false);
});

test("the rules run in order: live, accuracy, distance", () => {
  const now = T0 + 30 * MIN;
  assert.ok(checkRules(show(), here(), now) < 1);
  assert.throws(() => checkRules(show(), here(), T0 + 400 * MIN), { reason: "not-live" });
  assert.throws(() => checkRules(show(), here({ accuracy: 250 }), now), { reason: "poor-accuracy" });
  assert.throws(() => checkRules(show(), { ...north(400), accuracy: 10 }, now), { reason: "too-far" });
  assert.ok(checkRules(show(), { ...north(140), accuracy: 10 }, now) < 150);
  assert.throws(() => checkRules(show(), { ...north(151), accuracy: 0 }, now), { reason: "too-far" });
});

test("a small reported error is forgiven, but only a little", () => {
  const now = T0 + 30 * MIN;
  assert.doesNotThrow(() => checkRules(show(), { ...north(190), accuracy: 60 }, now));
  assert.throws(() => checkRules(show(), { ...north(210), accuracy: 200 }, now), { reason: "too-far" });
});

test("input must be a show id, a real position and an accuracy", () => {
  assert.deepEqual(parseInput({ showId: "abc123", lat: 51, lng: -114, accuracy: 30 }), { showId: "abc123", lat: 51, lng: -114, accuracy: 30 });
  for (const bad of [null, {}, { showId: "a/b", lat: 1, lng: 1, accuracy: 1 }, { showId: "x", lat: 91, lng: 1, accuracy: 1 }, { showId: "x", lat: 1, lng: 181, accuracy: 1 }, { showId: "x", lat: "1", lng: 1, accuracy: 1 }, { showId: "x", lat: 1, lng: 1 }, { showId: "x", lat: NaN, lng: 1, accuracy: 1 }]) {
    assert.throws(() => parseInput(bad), CheckInError);
  }
});

/* ----- A tiny in-memory Firestore, just enough for the transaction ----- */

function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const snap = (path) => ({ exists: store.has(path), data: () => store.get(path) });
  return {
    store,
    doc: (path) => ({ path }),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, data) => writes.push(() => store.set(ref.path, data)),
        update: (ref, data) => writes.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
}

const seed = () => ({
  "shows/s1": show(),
  "shows/s2": show({ artistIds: ["a1"], artistNames: ["Alpha"] }),
  "artists/a1": { name: "Alpha", fanCount: 0 },
  "artists/a2": { name: "Beta", fanCount: 0 },
});
const input = (showId = "s1") => ({ showId, ...here() });
const now = T0 + 10 * MIN;

test("a check-in counts once for every artist on the bill and stores no coordinates", async () => {
  const db = fakeDb(seed());
  const res = await performCheckIn(db, "u1", input(), now, ts);
  assert.equal(res.status, "checked-in");
  assert.deepEqual(res.artists.map((a) => [a.name, a.count]), [["Alpha", 1], ["Beta", 1]]);
  assert.equal(db.store.get("users/u1/artistCounts/a1").count, 1);
  assert.equal(db.store.get("artists/a1").fanCount, 1);
  assert.equal(db.store.get("artists/a2").fanCount, 1);
  assert.deepEqual(Object.keys(db.store.get("checkins/s1_u1")).sort(), ["at", "showId", "uid"]);
  for (const path of ["users/u1/artistCounts/a1", "artists/a1/fans/u1"]) {
    assert.equal(/lat|lng|accuracy/.test(JSON.stringify(db.store.get(path))), false);
  }
});

test("checking in twice at one show changes nothing the second time", async () => {
  const db = fakeDb(seed());
  await performCheckIn(db, "u1", input(), now, ts);
  const again = await performCheckIn(db, "u1", input(), now + MIN, ts);
  assert.equal(again.status, "already");
  assert.equal(db.store.get("users/u1/artistCounts/a1").count, 1);
  assert.equal(db.store.get("artists/a1").fanCount, 1);
});

test("a second show raises the fan's number but not the artist's fan total", async () => {
  const db = fakeDb(seed());
  await performCheckIn(db, "u1", input("s1"), now, ts);
  await performCheckIn(db, "u1", input("s2"), now, ts);
  assert.equal(db.store.get("users/u1/artistCounts/a1").count, 2);
  assert.equal(db.store.get("users/u1/artistCounts/a2").count, 1);
  assert.equal(db.store.get("artists/a1").fanCount, 1);
  await performCheckIn(db, "u2", input("s2"), now, ts);
  assert.equal(db.store.get("artists/a1").fanCount, 2);
  assert.equal(db.store.get("artists/a2").fanCount, 1);
});

test("a failed check-in writes nothing", async () => {
  const db = fakeDb(seed());
  const before = new Map(db.store);
  await assert.rejects(performCheckIn(db, "u1", { showId: "s1", ...north(900), accuracy: 10 }, now, ts), { reason: "too-far" });
  await assert.rejects(performCheckIn(db, "u1", input(), T0 + 600 * MIN, ts), { reason: "not-live" });
  await assert.rejects(performCheckIn(db, "u1", input("nope"), now, ts), { reason: "no-show" });
  assert.deepEqual([...db.store], [...before]);
});

test("artist images are recognised by their first bytes, not their name", () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")])), "image/webp");
  assert.equal(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffImageType(Buffer.from("GIF89a......")), null);
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  assert.ok(validArtistId("the-band-2"));
  assert.ok(!validArtistId("../x") && !validArtistId("A") && !validArtistId(""));
});

test("the functions report a version", () => {
  assert.match(FUNCTIONS_VERSION, /fan-counter/);
});
