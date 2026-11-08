import { describe, expect, it } from "vitest";
import { answerGuestQuestion, applyEventPatch, applyGuestOps, EMPTY_EVENT, invitationPreview, matchingGuests, proposalFromText, restoreEvent } from "../../functions/lib/event.js";

describe("one demo event", () => {
  it("counts sample guests without inventing people", () => {
    expect(matchingGuests(EMPTY_EVENT, { status: "yes" })).toHaveLength(1);
    expect(answerGuestQuestion(EMPTY_EVENT, "How many friends said yes?")).toContain("1");
    expect(answerGuestQuestion(EMPTY_EVENT, "How many friends said yes?")).toContain("Sample Ada");
    expect(answerGuestQuestion(EMPTY_EVENT, "Who is invited?")).toBe("Sample Mina. Sample guests only.");
    expect(answerGuestQuestion(EMPTY_EVENT, "What's the weather?")).toBeNull();
    expect(answerGuestQuestion(EMPTY_EVENT, "What is Sample Ada's phone?")).toMatch(/sample names only/i);
    expect(EMPTY_EVENT.venue).toBe("");
  });

  it("applies an event change and a guest only through the given operations", () => {
    const next = applyEventPatch(EMPTY_EVENT, { title: "Late Friday", venue: "The Hall", time: "21:00", timeZone: "America/Edmonton", date: "not-a-date", style: "editorial" });
    expect(next.title).toBe("Late Friday");
    expect(next.venue).toBe("The Hall");
    expect(next.time).toBe("21:00");
    expect(next.timeZone).toBe("America/Edmonton");
    expect(next.date).toBe("");
    expect(next.style).toBe("editorial");
    const withGuest = applyGuestOps(next, { add: [{ name: "Sample Jo", group: "Friends", status: "yes" }], set: [{ name: "Sample Leo", status: "no" }] });
    expect(withGuest.guests.some((guest) => guest.name === "Sample Jo" && guest.status === "yes")).toBe(true);
    expect(withGuest.guests.find((guest) => guest.name === "Sample Leo")?.status).toBe("no");
    expect(answerGuestQuestion(withGuest, "How many friends said yes?")).toContain("2");
    expect(invitationPreview(withGuest)).toContain("NOT SENT");
    expect(invitationPreview(withGuest)).toContain("The Hall");
    expect(invitationPreview(withGuest)).toContain("21:00 · America/Edmonton");
    expect(proposalFromText("Set the title to Late Friday")?.event?.title).toBe("Late Friday");
    expect(proposalFromText("Set the date to 2026-02-31")).toBeNull();
    expect(proposalFromText("Set Sample Leo to no")?.guests?.set?.[0]).toMatchObject({ name: "Sample Leo", status: "no" });
    const restored = restoreEvent({ title: "Kept", guests: [{ name: "Sample Ada", group: "Friends", status: "yes" }] });
    expect(restored.title).toBe("Kept");
    expect(restored.guests.map((guest) => guest.name)).toEqual(["Sample Ada"]);
  });
});
