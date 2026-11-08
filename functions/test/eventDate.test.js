import test from "node:test";
import assert from "node:assert/strict";
import { calendarToday, cleanCommandValue, fieldsFromAsk, labeledEventFields, proposalFromText, resolveMentionedDate, zoneForEvent } from "../lib/event.js";

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

test("one sentence keeps title, venue, time, and the resolved date together", () => {
  const today = "2026-11-08";
  const mixed = fieldsFromAsk("Midnight Drop at Sample Lounge on Dec31 at 21:00", today);
  assert.deepEqual(mixed.patch, { title: "Midnight Drop", venue: "Sample Lounge", date: "2026-12-31", time: "21:00" });
  const historic = fieldsFromAsk("Midnight Drop at Sample Lounge on December 31, 2024 at 21:00", today);
  assert.equal(historic.patch.date, "2024-12-31");
  assert.equal(historic.patch.title, "Midnight Drop");
  assert.equal(historic.patch.venue, "Sample Lounge");
  assert.equal(historic.patch.time, "21:00");
  const dateOnly = fieldsFromAsk("Dec 31", today);
  assert.deepEqual(dateOnly.patch, { date: "2026-12-31" });
  const impossible = fieldsFromAsk("Midnight Drop at Sample Lounge on February 31 at 21:00", today);
  assert.equal(impossible.mentioned.invalid, true);
  assert.equal(impossible.patch.date, undefined);
  assert.equal(impossible.patch.title, "Midnight Drop");
  assert.equal(impossible.patch.time, "21:00");
});

test("a venue instruction is not the venue, and a quoted value stays whole", () => {
  assert.equal(cleanCommandValue("The Blue Room, but let me approve it first."), "The Blue Room");
  assert.equal(cleanCommandValue("Late Friday."), "Late Friday");
  assert.equal(cleanCommandValue("St. Louis"), "St. Louis");
  assert.equal(cleanCommandValue('"Late Friday."'), "Late Friday.");
  assert.equal(cleanCommandValue('"The Blue Room, but let me approve it first."'), "The Blue Room, but let me approve it first.");
  assert.equal(cleanCommandValue("The Blue Room or The Hall"), "");
  assert.equal(proposalFromText("Set the venue to The Blue Room, but let me approve it first.").event.venue, "The Blue Room");
  assert.equal(proposalFromText("Set the title to Late Friday.").event.title, "Late Friday");
  assert.equal(proposalFromText('Set the title to "Late Friday."').event.title, "Late Friday.");
  assert.equal(proposalFromText('Set the venue to "The Blue Room, but let me approve it first."').event.venue, "The Blue Room, but let me approve it first.");
  assert.equal(proposalFromText("Set the venue to The Blue Room, East Hall").event.venue, "The Blue Room, East Hall");
  assert.equal(proposalFromText("Set the venue to The Blue Room or The Hall"), null);
});

test("labeled title, venue, and description stay with the date and time", () => {
  const today = "2026-11-08";
  const sentence = "Set the title to Midnight Drop, the venue to Sample Lounge, on Dec 31 at 21:00, and the description to A quiet late set.";
  assert.deepEqual(fieldsFromAsk(sentence, today).patch, {
    title: "Midnight Drop",
    venue: "Sample Lounge",
    description: "A quiet late set",
    date: "2026-12-31",
    time: "21:00",
  });
  const compact = fieldsFromAsk("title Midnight Drop, venue Sample Lounge, Dec31 at 21:00, description A quiet late set", today);
  assert.equal(compact.patch.title, "Midnight Drop");
  assert.equal(compact.patch.venue, "Sample Lounge");
  assert.equal(compact.patch.description, "A quiet late set");
  assert.equal(compact.patch.date, "2026-12-31");
  assert.equal(compact.patch.time, "21:00");
  assert.equal(labeledEventFields("Set the venue to The Blue Room, East Hall").venue, "The Blue Room, East Hall");
  assert.deepEqual(fieldsFromAsk("Dec 31", today).patch, { date: "2026-12-31" });
});
