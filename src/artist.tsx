import { useEffect, useRef, useState, type FormEvent, type ReactNode, type TransitionEvent } from "react";
import { ownsArtist } from "./access";
import { deleteEvent, deleteTrack, loadArtistPage, loadLinkedArtist, renameTrack, saveTrackOrder, type Artist, type ArtistPageData, type EventItem, type Track } from "./data";
import { ArtistForm, EventForm, TrackForm } from "./forms";
import { cleanLine, cleanTicketUrl, formatDuration, formatWhen, validLine, validTicketUrl } from "./format";
import { useReducedMotion } from "./motion";
import { Logo } from "./logo";
import { PauseIcon, PlayIcon, usePlayer } from "./player";
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

function Fold({ away, children }: { away: boolean; children: ReactNode }) {
  return (
    <div className={away ? "fold is-away" : "fold"} aria-hidden={away || undefined}>
      <div className="fold-inner">{children}</div>
    </div>
  );
}

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join("").trimEnd()}…`;
}

function Bio({ text }: { text: string }) {
  const trimmed = text.trim();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const fromHeight = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const long = Array.from(trimmed).length > 30;
  const shown = !trimmed || open || !long ? trimmed : clip(trimmed, 30);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.height = "auto";
      return;
    }
    const from = fromHeight.current;
    if (from == null) return;
    const to = el.scrollHeight;
    el.style.height = `${from}px`;
    const frame = requestAnimationFrame(() => {
      el.style.height = `${to}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, reduced, shown]);

  if (!trimmed) return null;

  function toggle() {
    const el = ref.current;
    fromHeight.current = el ? el.getBoundingClientRect().height : null;
    setOpen((value) => !value);
  }

  function onTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName !== "height" || !ref.current) return;
    ref.current.style.height = "auto";
  }

  return (
    <div className={open ? "bio is-open" : "bio"}>
      <div className="bio-clip" ref={ref} onTransitionEnd={onTransitionEnd}>
        <p className="bio-line">
          <span>{shown}</span>
          {long ? (
            <button type="button" className="bio-more" aria-expanded={open} aria-label={open ? "Show less" : "Read more"} onClick={toggle}>
              <svg className={open ? "more-icon is-open" : "more-icon"} viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function useWideStage(): boolean {
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 960px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return wide;
}

function StageBackdrop({ image, reduced }: { image: string; reduced: boolean }) {
  const sharpRef = useRef<HTMLImageElement>(null);
  const blurRef = useRef<HTMLImageElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const wide = useWideStage();

  useEffect(() => {
    const sharp = sharpRef.current;
    const blur = blurRef.current;
    const dim = dimRef.current;
    if (!sharp || !blur || !dim) return;
    const paint = (progress: number) => {
      const t = progress * progress * (3 - 2 * progress);
      sharp.style.opacity = String(1 - t * (wide ? 0.55 : 0.92));
      blur.style.opacity = String(t * (wide ? 0.72 : 1));
      dim.style.opacity = String((wide ? 0.08 : 0.12) + t * (wide ? 0.28 : 0.46));
    };
    if (reduced) {
      paint(wide ? 0.2 : 0.85);
      return;
    }
    let frame = 0;
    const apply = () => paint(Math.min(Math.max(0, window.scrollY) / (wide ? 520 : 420), 1));
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
  }, [reduced, image, wide]);

  return (
    <>
      {wide && image ? (
        <div className="stage-wash" aria-hidden="true">
          <img src={image} alt="" />
        </div>
      ) : null}
      <div className="stage-bg" aria-hidden="true">
        {image ? (
          <>
            <img ref={sharpRef} className="stage-bg-sharp" src={image} alt="" />
            <img ref={blurRef} className="stage-bg-blur" src={image} alt="" />
          </>
        ) : (
          <div className="stage-bg-fallback" />
        )}
        <div className="stage-bg-scrim" />
        <div ref={dimRef} className="stage-bg-dim" />
      </div>
    </>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z" />
      <path d="m13.2 6.6 4.2 4.2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function NowMark({ paused }: { paused?: boolean }) {
  return (
    <span className={paused ? "now is-paused" : "now"} aria-hidden="true">
      <Logo className="now-logo" />
      {paused ? <PauseIcon /> : (
        <span className="eq">
          <span />
          <span />
          <span />
        </span>
      )}
    </span>
  );
}

export function ArtistStage({
  route,
  uid,
  profile,
  go,
  replace,
  back,
  onHome,
}: {
  route: Route;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  onHome: () => void;
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

  async function reload(ensureEventId?: string) {
    const id = snapshotRef.current?.artist?.id;
    if (!id) return;
    setSnapshot(await loadArtistPage(id, ensureEventId));
  }

  if (!requested.artistId && !requested.eventId) {
    return (
      <Page back={back} onHome={onHome}>
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
      <Page back={back} onHome={onHome}>
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
      <Page back={back} onHome={onHome}>
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
      onHome={onHome}
      reload={reload}
      setTracks={(tracks) => setSnapshot((current) => (current ? { ...current, tracks } : current))}
    />
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
  onHome,
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
  onHome: () => void;
  reload: (ensureEventId?: string) => Promise<void>;
  setTracks: (tracks: Track[]) => void;
}) {
  const reduced = useReducedMotion();
  const player = usePlayer();
  const adopt = player.adopt;
  const [adding, setAdding] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [trackError, setTrackError] = useState("");
  const focus = editing ? "artist" : creating ? "create" : editingEventId ? "event" : adding ? "add" : editingTrackId ? "track" : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [artist.id]);

  useEffect(() => {
    if (editing || creating || editingEventId) {
      setAdding(false);
      setEditingTrackId(null);
    }
  }, [editing, creating, editingEventId]);

  useEffect(() => {
    adopt({ artistId: artist.id, artistName: artist.name, artistImage: artist.imageURL, tracks });
  }, [adopt, artist.id, artist.name, artist.imageURL, tracks]);

  useEffect(() => {
    const behavior = reduced ? "auto" : "smooth";
    const id = editing
      ? "artist-editor"
      : creating || editingEventId
        ? "event-editor"
        : adding
          ? "track-editor"
          : editingTrackId
            ? `track-editor-${editingTrackId}`
            : openEventId
              ? `event-${openEventId}`
              : null;
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior, block: "nearest" });
  }, [artist.id, openEventId, editing, creating, editingEventId, adding, editingTrackId, reduced]);

  async function refresh(ensureEventId?: string) {
    await reload(ensureEventId);
  }

  const nextOrder = tracks.reduce((max, track) => Math.max(max, track.order), -1) + 1;
  const queue = { artistId: artist.id, artistName: artist.name, artistImage: artist.imageURL, tracks };

  return (
    <div className={focus ? "stage is-focused" : "stage"}>
      <StageBackdrop image={artist.imageURL} reduced={reduced} />
      <div className="stage-scroll">
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={back} onHome={onHome} />
          </div>
        </header>
        <div className="stage-spacer" />
        <main className="stage-column">
          <Fold away={focus !== null && focus !== "artist"}>
            <Expand open={editing} id={editing ? "artist-editor" : undefined}>
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
            <Expand open={!editing}>
              <div className="stage-identity">
                <div className="stage-identity-row">
                  <h1>{artist.name}</h1>
                  {owner ? (
                    <button type="button" className="icon-btn" aria-label="Edit page" onClick={() => replace(`/artist/${artist.id}/edit`)}>
                      <PencilIcon />
                    </button>
                  ) : null}
                </div>
                <Bio text={artist.bio} />
              </div>
            </Expand>
          </Fold>
          <Fold away={focus !== null && focus !== "create" && focus !== "event"}>
            <section className="stage-section" aria-labelledby={focus === "create" || focus === "event" ? undefined : "events-heading"}>
              <Fold away={Boolean(creating || editingEventId)}>
                <div className="stage-head">
                  <h2 id="events-heading">Events</h2>
                  {owner ? (
                    <button type="button" className="icon-btn" aria-label="Create event" onClick={() => replace("/events/new")}>
                      <PlusIcon />
                    </button>
                  ) : null}
                </div>
              </Fold>
              {owner ? (
                <Expand open={creating} id={creating ? "event-editor" : undefined}>
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
              {events.length === 0 && !creating ? (
                <p className="stage-empty">{owner ? "When you publish a night, it shows up here." : "Nothing is scheduled yet."}</p>
              ) : (
                <ul className="night-list">
                  {events.map((event) => {
                    const editingThis = editingEventId === event.id;
                    return (
                      <li key={event.id}>
                        <Fold away={creating || (editingEventId !== null && !editingThis)}>
                          <Expand open={editingThis} id={editingThis ? "event-editor" : undefined}>
                            <EventForm
                              key={editingThis ? "edit" : "idle"}
                              uid={uid}
                              event={event}
                              onClose={() => replace(`/event/${event.id}`)}
                              onSaved={async (id) => {
                                await refresh(id);
                                replace(`/event/${id}`);
                              }}
                            />
                          </Expand>
                          <Expand open={!editingThis}>
                            <EventCard
                              event={event}
                              open={openEventId === event.id}
                              owner={owner}
                              artistId={artist.id}
                              replace={replace}
                              onEdit={() => replace(`/event/${event.id}/edit`)}
                              onDelete={async () => {
                                await deleteEvent(event.id);
                                await refresh();
                                replace(`/artist/${artist.id}`);
                              }}
                            />
                          </Expand>
                        </Fold>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </Fold>
          <Fold away={focus !== null && focus !== "add" && focus !== "track"}>
            <section className="stage-section" aria-labelledby={focus === "add" || focus === "track" ? undefined : "tracks-heading"}>
              <Fold away={adding || editingTrackId !== null}>
                <div className="stage-head">
                  <h2 id="tracks-heading">Tracks</h2>
                  {owner ? (
                    <button type="button" className="icon-btn" aria-label="Add track" aria-expanded={adding} onClick={() => setAdding(true)}>
                      <PlusIcon />
                    </button>
                  ) : null}
                </div>
              </Fold>
              {owner ? (
                <Expand open={adding} id={adding ? "track-editor" : undefined}>
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
              {tracks.length === 0 && !adding ? (
                <p className="stage-empty">{owner ? "Add a song and it will play here." : "No tracks yet."}</p>
              ) : (
                <ol className="track-list">
                  {tracks.map((track, index) => {
                    const editingThis = editingTrackId === track.id;
                    return (
                      <li key={track.id} id={editingThis ? undefined : `track-${track.id}`} className={player.currentId === track.id && player.artistId === artist.id ? "track is-current" : "track"}>
                        <Fold away={adding || (editingTrackId !== null && !editingThis)}>
                          <Expand open={editingThis} id={editingThis ? `track-editor-${track.id}` : undefined}>
                            <TrackEditor
                              track={track}
                              index={index}
                              total={tracks.length}
                              onClose={() => setEditingTrackId(null)}
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
                                setEditingTrackId(null);
                              }}
                            />
                          </Expand>
                          <Expand open={!editingThis}>
                            <TrackRow
                              track={track}
                              current={player.currentId === track.id && player.artistId === artist.id}
                              playing={player.currentId === track.id && player.artistId === artist.id && player.playing}
                              owner={owner}
                              onPlay={() => player.toggle(track, queue)}
                              onEdit={() => setEditingTrackId(track.id)}
                            />
                          </Expand>
                        </Fold>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </Fold>
        </main>
      </div>
    </div>
  );
}

function EventCard({
  event,
  open,
  owner,
  artistId,
  replace,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  open: boolean;
  owner: boolean;
  artistId: string;
  replace: (path: string) => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
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
    <article className={open ? "night is-open" : "night"} id={`event-${event.id}`}>
      <button
        type="button"
        className="night-summary"
        aria-expanded={open}
        aria-controls={`event-panel-${event.id}`}
        onClick={() => replace(open ? `/artist/${artistId}` : `/event/${event.id}`)}
      >
        <span className="night-thumb">
          <Cover url={event.imageURL} alt="" />
        </span>
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
          {event.imageURL ? (
            <div className="night-photo-wrap">
              <img className="night-photo" src={event.imageURL} alt="" />
            </div>
          ) : null}
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
              <button type="button" className="icon-btn" aria-label="Edit event" onClick={onEdit}>
                <PencilIcon />
              </button>
              <button type="button" className="stage-text is-danger" onClick={() => void remove()} disabled={busy}>
                {confirming ? "Delete this event" : "Delete"}
              </button>
              {confirming ? (
                <button type="button" className="stage-text" onClick={() => setConfirming(false)} disabled={busy}>
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      </Expand>
    </article>
  );
}

function TrackRow({
  track,
  current,
  playing,
  owner,
  onPlay,
  onEdit,
}: {
  track: Track;
  current: boolean;
  playing: boolean;
  owner: boolean;
  onPlay: () => void;
  onEdit: () => void;
}) {
  const state = playing ? "is-playing" : current ? "is-paused" : "";
  return (
    <div className="track-row">
      <button type="button" className="track-main" aria-pressed={playing} aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`} onClick={onPlay}>
        <span className={`track-play ${state}`}>
          {playing ? <NowMark /> : current ? <NowMark paused /> : <PlayIcon />}
        </span>
        <span className="track-copy">
          <span className="track-title">{track.title}</span>
          <span className="track-time">{formatDuration(track.duration)}</span>
        </span>
      </button>
      {owner ? (
        <button type="button" className="icon-btn" aria-label={`Edit ${track.title}`} onClick={onEdit}>
          <PencilIcon />
        </button>
      ) : null}
    </div>
  );
}

function TrackEditor({
  track,
  index,
  total,
  onClose,
  onRename,
  onMove,
  onDelete,
}: {
  track: Track;
  index: number;
  total: number;
  onClose: () => void;
  onRename: (title: string) => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(track.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      onClose();
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

  return (
    <form className="stage-form track-edit" onSubmit={(submit) => void save(submit)}>
      <div className="stage-form-head">
        <h3>Edit track</h3>
        <button type="button" className="stage-text" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <label className="field">
        <span>Title</span>
        <input value={title} maxLength={120} disabled={busy} autoComplete="off" onChange={(change) => setTitle(change.target.value)} />
      </label>
      <div className="stage-inline">
        <button className="stage-quiet" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
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
  );
}
