import type { CSSProperties, Ref } from "react";
import { invitationPreview, matchingGuests, whenLine } from "../../functions/lib/event.js";
import type { Scene } from "../scene/types";
import type { HeldImage } from "../image/held";
import type { EventPage, GuestStatus } from "./types";

const BLOBS = [
  { x: "18%", y: "22%" },
  { x: "74%", y: "28%" },
  { x: "42%", y: "70%" },
  { x: "80%", y: "78%" },
];

const STATUS_LABEL: Record<GuestStatus, string> = { yes: "Yes", no: "No", maybe: "Maybe", invited: "Invited" };

function badge(kind: HeldImage["kind"]) {
  if (kind === "ai-edited") return "AI-edited";
  if (kind === "ai-generated") return "AI-generated";
  if (kind === "cutout") return "On this device";
  return "Your photo";
}

export function EventPageView({
  event,
  scene,
  foreground,
  background,
  scrollerRef,
  onScroll,
  onBack,
  onChat,
  onClearForeground,
  onClearBackground,
}: {
  event: EventPage;
  scene: Scene;
  foreground: HeldImage | null;
  background: HeldImage | null;
  scrollerRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  onBack: () => void;
  onChat: () => void;
  onClearForeground: () => void;
  onClearBackground: () => void;
}) {
  const when = whenLine(event);
  const counts = (["yes", "maybe", "no", "invited"] as GuestStatus[]).map((status) => `${STATUS_LABEL[status]} ${matchingGuests(event, { status }).length}`);
  return (
    <section
      className={`event-page style-${event.style}`}
      data-style={event.style}
      aria-label="Event page"
      style={{ "--base": scene.colors.base, "--glow": scene.colors.glow, "--deep": scene.colors.deep, "--warmth": String(scene.light.warmth), "--intensity": String(scene.light.intensity) } as CSSProperties}
    >
      <header className="bar">
        <button type="button" onClick={onBack} autoFocus aria-label="Back to the conversation">
          Back
        </button>
        <p>Event</p>
      </header>
      <div className="event-scroll" ref={scrollerRef} onScroll={onScroll}>
      <div className="event-hero">
        <div className="event-atmosphere" aria-hidden="true">
          <div className="event-glow" />
          {BLOBS.slice(0, Math.min(scene.shapes.count, BLOBS.length)).map((blob) => (
            <span key={`${blob.x}-${blob.y}`} className="event-blob" style={{ left: blob.x, top: blob.y }} />
          ))}
        </div>
        {background ? <img className="event-bg" alt="" src={background.url} /> : null}
        <div className="event-scrim" aria-hidden="true" />
        <figure className="event-figure" data-image-kind={foreground?.kind ?? ""}>
          {foreground ? <img src={foreground.url} alt="" /> : <figcaption>Add a photo from the page chat. It stays in this tab.</figcaption>}
        </figure>
        <div className="event-hero-copy">
          <p className="event-kicker">{event.artistName || "Demo event"}</p>
          <h2>{event.title}</h2>
          {foreground ? <p className="badge">{badge(foreground.kind)}</p> : null}
          {background ? <p className="badge">{badge(background.kind)} background</p> : null}
          {when ? <p className="event-when">{when}</p> : <p className="event-when">Date not set</p>}
          <p className="event-venue">{event.venue || "Venue not set"}</p>
        </div>
      </div>
      <div className="event-sheet">
        <p className="event-description">{event.description}</p>
        <dl className="event-facts">
          <div>
            <dt>Date</dt>
            <dd>{event.date || "Not set"}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{event.time || "Not set"}</dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{event.timeZone || "Not set"}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{event.venue || "Not set"}</dd>
          </div>
        </dl>
        {(foreground || background) ? (
          <div className="inline-actions">
            {foreground ? (
              <button type="button" onClick={onClearForeground}>
                Clear foreground
              </button>
            ) : null}
            {background ? (
              <button type="button" onClick={onClearBackground}>
                Clear background
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="event-note">Refresh keeps this text, look, and sample list in this tab. Closing the tab clears them. Photos stay until you refresh or close the tab. They are not saved to an account.</p>
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
      </div>
      <div className="page-dock">
        <button type="button" className="primary" onClick={onChat}>
          Page chat
        </button>
      </div>
    </section>
  );
}
