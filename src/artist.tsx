import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ownsArtist } from "./access";
import { deleteEvent, deleteTrack, loadArtistPage, loadLinkedArtist, renameTrack, saveTrackOrder, type Artist, type ArtistPageData, type EventItem, type Track } from "./data";
import { ArtistForm, EventForm, TrackForm } from "./forms";
import { cleanLine, cleanTicketUrl, formatDuration, formatWhen, validLine, validTicketUrl } from "./format";
import { useReducedMotion } from "./motion";
import { MiniPlayer, Player, usePlayer } from "./player";
import type { Profile, Role } from "./profile";
import type { Route } from "./routes";
import { explain } from "./services";
import { Boot, BrandLockup, Chevron, Cover, Empty, Page } from "./ui";

function requestedIds(route: Route, uid: string, role: Role): { artistId: string | null; eventId: string | null } {
  if (route.name === "artist" || route.name === "artist-edit") return { artistId: route.id, eventId: null };
  if (route.name === "event") return { artistId: null, eventId: route.id };
  if (route.name === "event-edit") {
    return route.id ? { artistId: null, eventId: route.id } : { artistId: role === "artist" ? uid : null, eventId: null };
  }
  return { artistId: null, eventId: null };
}

function matchesPage(page: ArtistPageData | null, artistId: string | null, eventId: string | null): boolean {
  if (!page?.artist) return false;
  if (artistId) return page.artist.id === artistId;
  if (eventId) return page.events.some((event) => event.id === eventId);
  return false;
}

function Expand({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={open ? "reveal is-open" : "reveal"}>
      <div className="reveal-inner" inert={open ? undefined : true}>
        {children}
      </div>
    </div>
  );
}

export function ArtistStage({
  route,
  uid,
  profile,
  go,
  replace,
  back,
}: {
  route: Route;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
}) {
  const requested = requestedIds(route, uid, profile.role);
  const [snapshot, setSnapshot] = useState<ArtistPageData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (!requested.artistId && !requested.eventId) return;
    if (matchesPage(snapshotRef.current, requested.artistId, requested.eventId)) return;
    let cancelled = false;
    setStatus("loading");
    const load = requested.artistId
      ? loadArtistPage(requested.artistId, requested.eventId ?? undefined)
      : loadLinkedArtist(requested.eventId as string);
    load
      .then((page) => {
        if (cancelled) return;
        setSnapshot(page);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshot(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [requested.artistId, requested.eventId, nonce]);

  const reload = useCallback(async (ensureEventId?: string) => {
    const id = snapshotRef.current?.artist?.id;
    if (!id) return;
    setSnapshot(await loadArtistPage(id, ensureEventId));
  }, []);

  if (!requested.artistId && !requested.eventId) {
    return (
      <Page back={back}>
        <Empty title="Artists publish events" body="This account can't create an event." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }

  const matches = matchesPage(snapshot, requested.artistId, requested.eventId);
  if (status === "error" && !snapshot?.artist) {
    return (
      <Page back={back}>
        <Empty title="Couldn't load this page" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={() => setNonce((value) => value + 1)}>
          Try again
        </button>
      </Page>
    );
  }
  if (status === "ready" && snapshot && !snapshot.artist) {
    const missingEvent = Boolean(requested.eventId) && !requested.artistId;
    return (
      <Page back={back}>
        <Empty title={missingEvent ? "This event isn't here" : "This artist page isn't here"} body="It may have been removed." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }
  if (!matches || !snapshot?.artist) return <Boot />;

  const artist = snapshot.artist;
  const owner = ownsArtist(uid, profile.role, artist);
  const editing = route.name === "artist-edit" && owner;
  const creating = route.name === "event-edit" && route.id === null && owner;
  const editingEventId = route.name === "event-edit" && route.id && owner ? route.id : null;
  const openEventId = route.name === "event" || (route.name === "event-edit" && route.id) ? route.id : null;

  return (
    <Player tracks={snapshot.tracks} artistName={artist.name} artistImage={artist.imageURL}>
      <StageView
        artist={artist}
        events={snapshot.events}
        tracks={snapshot.tracks}
        uid={uid}
        owner={owner}
        editing={editing}
        creating={creating}
        editingEventId={editingEventId}
        openEventId={openEventId}
        replace={replace}
        back={back}
        reload={reload}
        setTracks={(tracks) => setSnapshot((current) => (current ? { ...current, tracks } : current))}
      />
    </Player>
  );
}

function StageView({
  artist,
  events,
  tracks,
  uid,
  owner,
  editing,
  creating,
  editingEventId,
  openEventId,
  replace,
  back,
  reload,
  setTracks,
}: {
  artist: Artist;
  events: EventItem[];
  tracks: Track[];
  uid: string;
  owner: boolean;
  editing: boolean;
  creating: boolean;
  editingEventId: string | null;
  openEventId: string | null;
  replace: (path: string) => void;
  back: () => void;
  reload: (ensureEventId?: string) => Promise<void>;
  setTracks: (tracks: Track[]) => void;
}) {
  const reduced = useReducedMotion();
  const player = usePlayer();
  const mediaRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLImageElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [trackError, setTrackError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [artist.id]);

  useEffect(() => {
    const behavior = reduced ? "auto" : "smooth";
    if (openEventId) document.getElementById(`event-${openEventId}`)?.scrollIntoView({ behavior, block: "nearest" });
    else if (editing) document.getElementById("artist-editor")?.scrollIntoView({ behavior, block: "nearest" });
    else if (creating) document.getElementById("event-editor")?.scrollIntoView({ behavior, block: "nearest" });
  }, [artist.id, openEventId, editing, creating, reduced]);

  useEffect(() => {
    const media = mediaRef.current;
    const blur = blurRef.current;
    const dim = dimRef.current;
    const copy = copyRef.current;
    if (!media) return;
    if (reduced) {
      media.style.transform = "";
      if (blur) blur.style.opacity = "";
      if (dim) dim.style.opacity = "";
      if (copy) {
        copy.style.opacity = "";
        copy.style.transform = "";
      }
      return;
    }
    let frame = 0;
    const apply = () => {
      const y = Math.max(0, window.scrollY);
      const progress = Math.min(y / 560, 1);
      media.style.transform = `translate3d(0, ${y * 0.12}px, 0) scale(${1.04 + progress * 0.04})`;
      if (blur) blur.style.opacity = String(0.55 + progress * 0.45);
      if (dim) dim.style.opacity = String(progress * 0.5);
      if (copy) {
        copy.style.opacity = String(1 - progress * 0.28);
        copy.style.transform = `translate3d(0, ${-Math.min(y, 160) * 0.05}px, 0)`;
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced, artist.imageURL, artist.id]);

  async function refresh(ensureEventId?: string) {
    await reload(ensureEventId);
  }

  const nextOrder = tracks.reduce((max, track) => Math.max(max, track.order), -1) + 1;

  return (
    <div className={player.currentId ? "stage has-player" : "stage"}>
      <section className="stage-hero" aria-label={artist.name}>
        <div className="stage-hero-media" ref={mediaRef}>
          {artist.imageURL ? (
            <>
              <img className="stage-hero-image" src={artist.imageURL} alt="" />
              <img className="stage-hero-blur" ref={blurRef} src={artist.imageURL} alt="" />
            </>
          ) : (
            <div className="stage-hero-fallback" aria-hidden="true" />
          )}
          <div className="stage-hero-shade" />
          <div className="stage-hero-dim" ref={dimRef} />
        </div>
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={back} />
          </div>
        </header>
        <div className="stage-hero-copy" ref={copyRef}>
          <h1>{artist.name}</h1>
          {artist.bio ? <p className="stage-bio">{artist.bio}</p> : null}
          {owner ? (
            <button
              type="button"
              className={editing ? "stage-edit is-on" : "stage-edit"}
              aria-expanded={editing}
              onClick={() => replace(editing ? `/artist/${artist.id}` : `/artist/${artist.id}/edit`)}
            >
              Edit
            </button>
          ) : null}
        </div>
      </section>
      <main className="stage-sheet">
        <div className="stage-handle" aria-hidden="true" />
        <div className="stage-column">
          {owner ? (
          <Expand open={editing} id="artist-editor">
            <ArtistForm
              key={editing ? "editing" : "idle"}
              artist={artist}
              onClose={() => replace(`/artist/${artist.id}`)}
              onSaved={async () => {
                await refresh();
                replace(`/artist/${artist.id}`);
              }}
            />
          </Expand>
          ) : null}
          <section className="stage-section" aria-labelledby="events-heading">
            <div className="stage-head">
              <h2 id="events-heading">Events</h2>
              {owner ? (
                <button
                  type="button"
                  className="stage-quiet"
                  aria-expanded={creating}
                  onClick={() => replace(creating ? `/artist/${artist.id}` : "/events/new")}
                >
                  Create event
                </button>
              ) : null}
            </div>
            {owner ? (
            <Expand open={creating} id="event-editor">
              <EventForm
                key={creating ? "create" : "idle"}
                uid={uid}
                event={null}
                onClose={() => replace(`/artist/${artist.id}`)}
                onSaved={async (id) => {
                  await refresh(id);
                  replace(`/event/${id}`);
                }}
              />
            </Expand>
            ) : null}
            {events.length === 0 ? (
              <p className="stage-empty">{owner ? "When you publish a night, it shows up here." : "Nothing is scheduled yet."}</p>
            ) : (
              <ul className="night-list">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    open={openEventId === event.id}
                    editing={editingEventId === event.id}
                    owner={owner}
                    uid={uid}
                    artistId={artist.id}
                    replace={replace}
                    onDelete={async () => {
                      await deleteEvent(event.id);
                      await refresh();
                      replace(`/artist/${artist.id}`);
                    }}
                    onSaved={async (id) => {
                      await refresh(id);
                      replace(`/event/${id}`);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="stage-section" aria-labelledby="tracks-heading">
            <div className="stage-head">
              <h2 id="tracks-heading">Tracks</h2>
              {owner ? (
                <button type="button" className="stage-quiet" aria-expanded={adding} onClick={() => setAdding((value) => !value)}>
                  Add track
                </button>
              ) : null}
            </div>
            {owner ? (
            <Expand open={adding} id="track-editor">
              <TrackForm
                key={adding ? "add" : "idle"}
                artistId={artist.id}
                order={nextOrder}
                onClose={() => setAdding(false)}
                onSaved={async () => {
                  await refresh(openEventId ?? undefined);
                  setAdding(false);
                }}
              />
            </Expand>
            ) : null}
            {trackError ? <p className="form-error" role="alert">{trackError}</p> : null}
            {tracks.length === 0 ? (
              <p className="stage-empty">{owner ? "Add a song and it will play here." : "No tracks yet."}</p>
            ) : (
              <ol className="track-list">
                {tracks.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index}
                    total={tracks.length}
                    artistImage={artist.imageURL}
                    current={player.currentId === track.id}
                    playing={player.currentId === track.id && player.playing}
                    owner={owner}
                    onPlay={() => player.toggle(track)}
                    onRename={async (title) => {
                      await renameTrack(artist.id, track.id, title);
                      setTracks(tracks.map((item) => (item.id === track.id ? { ...item, title } : item)));
                    }}
                    onMove={async (direction) => {
                      const nextIndex = index + direction;
                      if (nextIndex < 0 || nextIndex >= tracks.length) return;
                      const next = tracks.slice();
                      const [item] = next.splice(index, 1);
                      if (!item) return;
                      next.splice(nextIndex, 0, item);
                      const reordered = next.map((itemTrack, order) => ({ ...itemTrack, order }));
                      setTracks(reordered);
                      try {
                        await saveTrackOrder(artist.id, reordered.map((itemTrack) => itemTrack.id));
                      } catch (caught) {
                        setTrackError(explain(caught));
                        await refresh(openEventId ?? undefined);
                      }
                    }}
                    onDelete={async () => {
                      await deleteTrack(artist.id, track);
                      setTracks(tracks.filter((item) => item.id !== track.id));
                    }}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      </main>
      <MiniPlayer />
    </div>
  );
}

function EventCard({
  event,
  open,
  editing,
  owner,
  uid,
  artistId,
  replace,
  onDelete,
  onSaved,
}: {
  event: EventItem;
  open: boolean;
  editing: boolean;
  owner: boolean;
  uid: string;
  artistId: string;
  replace: (path: string) => void;
  onDelete: () => Promise<void>;
  onSaved: (id: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tickets = cleanTicketUrl(event.ticketUrl);
  const showTickets = tickets.length > 0 && validTicketUrl(tickets);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <li>
      <article className={open ? "night is-open" : "night"} id={`event-${event.id}`}>
        <button
          type="button"
          className="night-summary"
          aria-expanded={open}
          aria-controls={`event-panel-${event.id}`}
          onClick={() => replace(open ? `/artist/${artistId}` : `/event/${event.id}`)}
        >
          <Cover url={event.imageURL} alt="" />
          <span className="night-copy">
            <span className="night-title">{event.title}</span>
            <span className="night-meta">{formatWhen(event.startsAt, "card")}</span>
            <span className="night-meta">
              {event.venue}, {event.city}
            </span>
          </span>
          <Chevron />
        </button>
        <Expand open={open} id={`event-panel-${event.id}`}>
          <div className="night-detail">
            {event.imageURL ? <img className="night-photo" src={event.imageURL} alt="" /> : null}
            <h3 className="night-detail-title">{event.title}</h3>
            <p className="night-detail-when">{formatWhen(event.startsAt, "detail")}</p>
            <p className="night-detail-place">
              {event.venue}
              <span>{event.city}</span>
            </p>
            {event.description ? <p className="stage-prose">{event.description}</p> : null}
            {showTickets ? (
              <a className="primary stage-tickets" href={tickets} target="_blank" rel="noopener noreferrer">
                Get tickets
              </a>
            ) : null}
            {owner ? (
              <div className="stage-inline">
                <button
                  type="button"
                  className="stage-quiet"
                  aria-expanded={editing}
                  onClick={() => replace(editing ? `/event/${event.id}` : `/event/${event.id}/edit`)}
                >
                  Edit event
                </button>
                <button type="button" className="stage-text is-danger" onClick={() => void remove()} disabled={busy}>
                  {confirming ? "Delete this event" : "Delete event"}
                </button>
                {confirming ? (
                  <button type="button" className="stage-text" onClick={() => setConfirming(false)} disabled={busy}>
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {owner ? (
              <Expand open={editing}>
                <EventForm key={editing ? "edit" : "idle"} uid={uid} event={event} onClose={() => replace(`/event/${event.id}`)} onSaved={onSaved} />
              </Expand>
            ) : null}
          </div>
        </Expand>
      </article>
    </li>
  );
}

function TrackRow({
  track,
  index,
  total,
  artistImage,
  current,
  playing,
  owner,
  onPlay,
  onRename,
  onMove,
  onDelete,
}: {
  track: Track;
  index: number;
  total: number;
  artistImage: string;
  current: boolean;
  playing: boolean;
  owner: boolean;
  onPlay: () => void;
  onRename: (title: string) => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(track.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cover = track.coverURL || artistImage;

  useEffect(() => {
    setTitle(track.title);
  }, [track.title]);

  async function save(submit: FormEvent) {
    submit.preventDefault();
    const next = cleanLine(title);
    if (!validLine(next, 120)) {
      setError("Enter a title up to 120 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRename(next);
      setOpen(false);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  const className = `track${current ? " is-current" : ""}${playing ? " is-playing" : ""}`;

  return (
    <li className={className} id={`track-${track.id}`}>
      <div className="track-row">
        <button type="button" className="track-main" aria-pressed={playing} onClick={onPlay}>
          {cover ? <img src={cover} alt="" /> : <span className="track-letter" aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</span>}
          <span className="track-copy">
            <span className="track-title">
              {playing ? <Bars /> : null}
              {track.title}
            </span>
            <span className="track-time">{formatDuration(track.duration)}</span>
          </span>
        </button>
        {owner ? (
          <button type="button" className="stage-text" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            Edit
          </button>
        ) : null}
      </div>
      {owner ? (
        <Expand open={open}>
          <form className="track-edit" onSubmit={(submit) => void save(submit)}>
            <label className="field">
              <span>Title</span>
              <input value={title} maxLength={120} disabled={busy} autoComplete="off" onChange={(change) => setTitle(change.target.value)} />
            </label>
            <div className="stage-inline">
              <button className="stage-quiet" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Rename"}
              </button>
              <button type="button" className="stage-quiet" disabled={busy || index === 0} onClick={() => void onMove(-1)}>
                Move up
              </button>
              <button type="button" className="stage-quiet" disabled={busy || index === total - 1} onClick={() => void onMove(1)}>
                Move down
              </button>
              <button type="button" className="stage-text is-danger" disabled={busy} onClick={() => void remove()}>
                {confirming ? "Delete track" : "Delete"}
              </button>
              {confirming ? (
                <button type="button" className="stage-text" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </form>
        </Expand>
      ) : null}
    </li>
  );
}

function Bars() {
  return (
    <span className="eq" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
