import type { CSSProperties } from "react";
import { matchingGuests, whenLine } from "../../functions/lib/event.js";
import type { Scene } from "../scene/types";
import type { EventPage } from "./types";

export function EventCard({
  event,
  scene,
  photo,
  onOpen,
}: {
  event: EventPage;
  scene: Scene;
  photo: string | null;
  onOpen: () => void;
}) {
  const when = whenLine(event);
  const yes = matchingGuests(event, { status: "yes" }).length;
  return (
    <button
      type="button"
      className="event-card"
      onClick={onOpen}
      style={{ "--base": scene.colors.base, "--glow": scene.colors.glow, "--deep": scene.colors.deep } as CSSProperties}
    >
      <span className="event-card-glow" aria-hidden="true" />
      {photo ? <img src={photo} alt="" /> : <span className="event-card-empty" aria-hidden="true" />}
      <span className="event-copy">
        <span className="event-kicker">{event.artistName || "Demo event"}</span>
        <strong>{event.title}</strong>
        <span>{when || "Date not set"} · {event.venue || "Venue not set"}</span>
        <span>{yes} yes · {event.guests.length} sample guests</span>
        <span className="open-label">Open event</span>
      </span>
    </button>
  );
}
