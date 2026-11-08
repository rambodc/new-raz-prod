import { answerGuestQuestion, proposalFromText } from "../../functions/lib/event.js";
import { asCard, type Card } from "../chat/flow";
import type { EventPage } from "./types";

export function localTurn(event: EventPage, text: string, nonce: number): { reply: string; card: Card | null } | null {
  const id = (name: string) => `${name}-${nonce}`.slice(0, 40);
  if (text === "The event") {
    return {
      reply: "Add the details you want on the page. Accept applies them here.",
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
  const proposal = proposalFromText(text);
  if (proposal) {
    return {
      reply: "Accept to update this page. Nothing is sent or booked.",
      card: asCard({ type: "approval", id: id("cmd"), prompt: "Apply this to the event page?", proposal }),
    };
  }
  const guest = answerGuestQuestion(event, text);
  if (guest) return { reply: guest, card: null };
  return null;
}
