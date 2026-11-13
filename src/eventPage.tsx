import type { Artist, EventItem } from "./data";
import { cleanTicketUrl, formatWhen, validTicketUrl } from "./format";
import { ShareButton } from "./share";
import { artistPath, eventPath } from "./slug";
import { BrandLockup, EventPhoto, SignInButton } from "./ui";

export function EventActions({
  ticketUrl,
  sharePath,
  shareTitle,
  onEdit,
}: {
  ticketUrl: string;
  sharePath: string;
  shareTitle: string;
  onEdit?: () => void;
}) {
  const tickets = cleanTicketUrl(ticketUrl);
  const showTickets = tickets.length > 0 && validTicketUrl(tickets);
  return (
    <div className="social">
      <div className="event-actions">
        {showTickets ? (
          <a className="primary" href={tickets} target="_blank" rel="noopener noreferrer">
            Get tickets
          </a>
        ) : null}
        <div className="event-tools">
          {sharePath ? <ShareButton title={shareTitle} text={shareTitle} path={sharePath} label={`Share ${shareTitle}`} /> : null}
          {onEdit ? (
            <button type="button" className="text-action" onClick={onEdit}>
              Edit
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
  const sharePath = event.slug ? eventPath(artist.slug, event.slug) : "";
  return (
    <div className="stage">
      <div className="stage-scroll">
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={onBack} onHome={onHome} />
            {onSignIn ? <SignInButton onClick={onSignIn} /> : null}
          </div>
        </header>
        <main className="stage-column event-column">
          <article className="night is-open event-solo">
            <div className="night-photo-wrap">
              <EventPhoto url={event.imageURL} alt="" priority />
            </div>
            <div className="night-detail">
              <h1 className="event-title">{event.title}</h1>
              <p className="night-detail-when">{formatWhen(event.startsAt, "detail")}</p>
              <p className="night-detail-place">
                {event.venue}
                <span>{event.city}</span>
              </p>
              <button type="button" className="artist-jump" onClick={() => go(artistPath(artist.slug))}>
                {artist.name}
              </button>
              {event.description ? <p className="stage-prose">{event.description}</p> : null}
              <EventActions
                ticketUrl={event.ticketUrl}
                sharePath={sharePath}
                shareTitle={event.title}
                onEdit={owner ? () => go(`/event/${event.id}/edit`) : undefined}
              />
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
