import test from "node:test";
import assert from "node:assert/strict";
import { calendarToday, resolveMentionedDate, zoneForEvent } from "../lib/event.js";

const NOV_8_2026 = Date.parse("2026-11-08T18:00:00Z");

test("the server clock and the event zone choose the calendar day", () => {
  const evening = Date.parse("2026-01-01T06:30:00Z");
  assert.equal(calendarToday(evening, "UTC"), "2026-01-01");
  assert.equal(calendarToday(evening, "America/Edmonton"), "2025-12-31");
  assert.equal(zoneForEvent("America/Edmonton", "use UTC"), "America/Edmonton");
  assert.equal(zoneForEvent("Mountain Time", "in America/Edmonton"), "America/Edmonton");
  assert.equal(zoneForEvent("", "no zone here"), "UTC");
});

test("a month and day with no year uses the next upcoming day", () => {
  const today = calendarToday(NOV_8_2026, "America/Edmonton");
  assert.equal(today, "2026-11-08");
  assert.equal(resolveMentionedDate("Let's do Dec 31", today).date, "2026-12-31");
  assert.equal(resolveMentionedDate("Dec31", today).date, "2026-12-31");
  assert.equal(resolveMentionedDate("January 2", today).date, "2027-01-02");
  assert.equal(resolveMentionedDate("December 31", "2026-12-31").date, "2026-12-31");
  assert.equal(resolveMentionedDate("February 29", today).date, "2028-02-29");
  const newYearEve = calendarToday(Date.parse("2026-01-01T06:30:00Z"), "America/Edmonton");
  assert.equal(resolveMentionedDate("Dec 31", newYearEve).date, "2025-12-31");
  assert.equal(resolveMentionedDate("Dec 31", "2026-01-01").date, "2026-12-31");
});

test("an explicit year is kept and an impossible day is not rewritten", () => {
  const today = "2026-11-08";
  assert.equal(resolveMentionedDate("December 31, 2024", today).date, "2024-12-31");
  assert.equal(resolveMentionedDate("2024-12-31", today).date, "2024-12-31");
  assert.equal(resolveMentionedDate("31 December 2024", today).date, "2024-12-31");
  const impossible = resolveMentionedDate("February 31, 2025", today);
  assert.equal(impossible.invalid, true);
  assert.equal(impossible.date, "");
  assert.equal(resolveMentionedDate("02/03/2024", today).ambiguous, true);
  assert.equal(resolveMentionedDate("What's the weather?", today).mentioned, false);
});
