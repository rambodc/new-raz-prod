import { answerGuestQuestion, fieldsFromAsk, proposalFromText } from "../../functions/lib/event.js";
import { asCard, type Card } from "../chat/flow";
import type { EventPage } from "./types";

function browserToday() {
  return new Date().toISOString().slice(0, 10);
}

export function localTurn(event: EventPage, text: string, nonce: number): { reply: string; card: Card | null } | null {
  const id = (name: string) => `${name}-${nonce}`.slice(0, 40);
  if (text === "The event") {
    return {
      reply: "Add the title, description, and details. Accept puts them on this page.",
      card: asCard({
        type: "form",
        id: id("event"),
        prompt: "Event details",
        fields: ["eventTitle", "artistName", "description", "date", "time", "timeZone", "venue"],
      }),
    };
  }
  if (text === "Guests") {
    return {
      reply: answerGuestQuestion(event, "guests") || "Sample list only.",
      card: asCard({ type: "form", id: id("guest"), prompt: "Add a sample guest", fields: ["guestName", "guestGroup", "guestStatus"] }),
    };
  }
  if (text === "The look") {
    return {
      reply: "Pick a look. Motion stays off if your device asks for reduced motion.",
      card: asCard({
        type: "choice",
        id: id("look"),
        prompt: "Which look?",
        options: [
          { id: "calm", label: "Calm glow" },
          { id: "editorial", label: "Editorial shadows" },
          { id: "soft", label: "Soft motion" },
        ],
      }),
    };
  }
  if (text === "Calm glow" || text === "Editorial shadows" || text === "Soft motion") {
    const style = text === "Calm glow" ? "calm" : text === "Editorial shadows" ? "editorial" : "soft";
    return {
      reply: "Accept to change the look of this page.",
      card: asCard({ type: "approval", id: id("look"), prompt: `Use the ${style} look?`, proposal: { event: { style } } }),
    };
  }
  const guest = answerGuestQuestion(event, text);
  if (guest) return { reply: guest, card: null };
  if (text.trim().endsWith("?")) return null;
  const asked = fieldsFromAsk(text, browserToday());
  const named = Boolean(asked.patch.title || asked.patch.venue || asked.patch.description || asked.patch.artistName);
  if (named || (asked.mentioned.invalid && !Object.keys(asked.patch).length)) {
    if (asked.mentioned.invalid && !Object.keys(asked.patch).length) {
      return { reply: "That isn't a real calendar day. Say the month and day again, and include the year if it is in the past.", card: null };
    }
    if (named) {
      return {
        reply: asked.mentioned.invalid
          ? "That date isn't a real calendar day, so it was left off. Accept to apply the other details. Nothing changes until you do."
          : "Accept to update this page. Nothing is sent or booked.",
        card: asCard({ type: "approval", id: id("cmd"), prompt: "Apply this to the event page?", proposal: { event: asked.patch } }),
      };
    }
  }
  const proposal = proposalFromText(text);
  if (proposal) {
    return {
      reply: "Accept to update this page. Nothing is sent or booked.",
      card: asCard({ type: "approval", id: id("cmd"), prompt: "Apply this to the event page?", proposal }),
    };
  }
  if (asked.mentioned.invalid && !Object.keys(asked.patch).length) {
    return { reply: "That isn't a real calendar day. Say the month and day again, and include the year if it is in the past.", card: null };
  }
  if (Object.keys(asked.patch).length) {
    return {
      reply: asked.mentioned.invalid
        ? "That date isn't a real calendar day, so it was left off. Accept to apply the other details. Nothing changes until you do."
        : "Accept to update this page. Nothing is sent or booked.",
      card: asCard({ type: "approval", id: id("cmd"), prompt: "Apply this to the event page?", proposal: { event: asked.patch } }),
    };
  }
  return null;
}
