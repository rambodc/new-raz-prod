import type { Artist, EventItem } from "./data";
import { EventSocial } from "./invite";
import { formatWhen } from "./format";
import { artistPath, eventPath } from "./slug";
import { BrandLockup, EventPhoto, SignInButton } from "./ui";

export function EventPage({
  event,
  artist,
  uid,
  onSignIn,
  onBack,
  onHome,
  go,
}: {
  event: EventItem;
  artist: Artist;
  uid: string;
  onSignIn?: () => void;
  onBack: () => void;
  onHome: () => void;
  go: (path: string) => void;
}) {
  const owner = uid !== "" && uid === event.artistId;
  const sharePath = event.visibility === "public" ? eventPath(artist.slug, event.slug) : "";
  return (
    <div className="stage">
      <div className="stage-scroll">
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={onBack} onHome={onHome} />
            {onSignIn ? <SignInButton onClick={onSignIn} /> : null}
          </div>
        </header>
        <main className="stage-column invite-column">
          <article className="night is-open event-solo">
            <div className="night-photo-wrap">
              <EventPhoto url={event.imageURL} alt="" priority />
            </div>
            <div className="night-detail">
              <h1 className="invite-title">{event.title}</h1>
              <p className="night-detail-when">{formatWhen(event.startsAt, "detail")}</p>
              <p className="night-detail-place">
                {event.venue}
                <span>{event.city}</span>
              </p>
              <button type="button" className="artist-jump" onClick={() => go(artistPath(artist.slug))}>
                {artist.name}
              </button>
              {event.description ? <p className="stage-prose">{event.description}</p> : null}
              <EventSocial
                event={event}
                owner={owner}
                uid={uid}
                onSignIn={onSignIn}
                sharePath={sharePath}
                onEdit={owner ? () => go(`/event/${event.id}/edit`) : undefined}
              />
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
