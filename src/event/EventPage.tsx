import type { CSSProperties } from "react";
import { invitationPreview, matchingGuests, whenLine } from "../../functions/lib/event.js";
import type { Scene } from "../scene/types";
import type { EventPage, GuestStatus } from "./types";

const BLOBS = [
  { x: "18%", y: "22%" },
  { x: "74%", y: "28%" },
  { x: "42%", y: "70%" },
  { x: "80%", y: "78%" },
];

const STATUS_LABEL: Record<GuestStatus, string> = { yes: "Yes", no: "No", maybe: "Maybe", invited: "Invited" };

export function EventPageView({ event, scene, portrait }: { event: EventPage; scene: Scene; portrait: string | null }) {
  const when = whenLine(event);
  const counts = (["yes", "maybe", "no", "invited"] as GuestStatus[]).map((status) => `${STATUS_LABEL[status]} ${matchingGuests(event, { status }).length}`);
  return (
    <section
      className={`event-page style-${event.style}`}
      data-style={event.style}
      aria-label="Event page"
      style={{ "--base": scene.colors.base, "--glow": scene.colors.glow, "--deep": scene.colors.deep, "--warmth": String(scene.light.warmth), "--intensity": String(scene.light.intensity) } as CSSProperties}
    >
      <div className="event-atmosphere" aria-hidden="true">
        <div className="event-glow" />
        {BLOBS.slice(0, Math.min(scene.shapes.count, BLOBS.length)).map((blob) => (
          <span key={`${blob.x}-${blob.y}`} className="event-blob" style={{ left: blob.x, top: blob.y }} />
        ))}
      </div>
      <div className="event-stage">
        <figure className="event-cutout">
          {portrait ? <img src={portrait} alt="" /> : <figcaption>Add a photo when you want a person here. It stays in this browser and is cleared on refresh.</figcaption>}
        </figure>
      </div>
      <div className="event-sheet">
        <p className="event-kicker">{event.artistName || "Demo event"}</p>
        <h2>{event.title}</h2>
        {when ? <p className="event-when">{when}</p> : null}
        <p className="event-venue">{event.venue || "Venue not set"}</p>
        <p className="event-description">{event.description}</p>
        <p className="event-note">Refresh keeps this text, look, and sample list in this tab. Closing the tab clears them. The photo is not kept.</p>
        <section className="event-guests" aria-label="Sample guests">
          <h3>Sample guests</h3>
          <p className="event-counts">{counts.join(" · ")}</p>
          <ul>
            {event.guests.map((guest) => (
              <li key={guest.id}>
                <span>{guest.name}</span>
                <span>{guest.group}</span>
                <span>{STATUS_LABEL[guest.status]}</span>
              </li>
            ))}
          </ul>
          <p className="event-note">Fictional sample names on this page. Not real people, and not stored on a server.</p>
        </section>
        <section className="event-invite" aria-label="Invitation preview">
          <h3>
            Invitation <span className="not-sent">NOT SENT</span>
          </h3>
          <pre>{invitationPreview(event)}</pre>
        </section>
      </div>
    </section>
  );
}
