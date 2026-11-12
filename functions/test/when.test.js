import test from "node:test";
import assert from "node:assert/strict";
import { eventEndsAt, eventHasEnded, formatEventWhen, formatWhen, zonedInstant, zoneParts } from "../lib/when.js";

test("a wall clock in Edmonton round-trips and is not the server zone", () => {
  const january = zonedInstant(2026, 1, 15, 22, 0);
  assert.equal(january.toISOString(), "2026-01-16T05:00:00.000Z");
  assert.equal(formatWhen(january, "detail"), "Thu, Jan 15 • 10:00 PM");
  const show = zonedInstant(2026, 11, 21, 22, 0);
  assert.equal(formatWhen(show, "card"), "Sat, Nov 21 • 10 PM");
  assert.equal(formatWhen(show, "detail"), "Sat, Nov 21 • 10:00 PM");
  assert.deepEqual(
    { year: zoneParts(show).year, month: zoneParts(show).month, day: zoneParts(show).day, hour: zoneParts(show).hour, minute: zoneParts(show).minute },
    { year: 2026, month: 11, day: 21, hour: 22, minute: 0 },
  );
  const summer = zonedInstant(2026, 7, 15, 22, 30);
  assert.equal(summer.toISOString(), "2026-07-16T04:30:00.000Z");
  assert.equal(formatWhen(summer, "card"), "Wed, Jul 15 • 10:30 PM");
  assert.equal(zonedInstant(2026, 2, 31, 10, 0), null);
});

test("an invite stays open through the night and ends at 8 the next morning", () => {
  const start = zonedInstant(2026, 11, 21, 22, 0);
  const ends = eventEndsAt(start);
  assert.deepEqual(
    { year: zoneParts(ends).year, month: zoneParts(ends).month, day: zoneParts(ends).day, hour: zoneParts(ends).hour, minute: zoneParts(ends).minute },
    { year: 2026, month: 11, day: 22, hour: 8, minute: 0 },
  );
  assert.equal(eventHasEnded(start, ends.getTime() - 1), false);
  assert.equal(eventHasEnded(start, ends.getTime()), true);
  assert.equal(formatEventWhen(start), "Sat, Nov 21 • 10:00 PM");
});
