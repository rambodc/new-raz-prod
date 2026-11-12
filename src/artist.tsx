import { useEffect, useRef, useState, type FormEvent, type ReactNode, type TransitionEvent } from "react";
import { ownsArtist } from "./access";
import { ARTIST_EVENT_LIMIT, canonicalFor, deleteEvent, deleteTrack, focusFromPage, focusReady, loadArtistPage, renameTrack, resolveRoutePage, saveTrackOrder, type Artist, type EventItem, type ResolvedPage, type Track } from "./data";
import { ArtistForm, EventForm, TrackForm } from "./forms";
import { splitByTime } from "./events";
import { cleanLine, cleanTicketUrl, formatDuration, formatWhen, validLine, validTicketUrl } from "./format";
import { useReducedMotion } from "./motion";
import { PlayIcon, usePlayer } from "./player";
import type { Profile } from "./profile";
import type { Route } from "./routes";
import { currentPath } from "./routes";
import { explain } from "./services";
import { ShareButton } from "./share";
import { artistPath, eventPath, trackPath } from "./slug";
import { Boot, BrandLockup, Chevron, Cover, Empty, Page, SignInButton } from "./ui";

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
  const [blurSrc, setBlurSrc] = useState("");

  useEffect(() => {
    if (!image || wide) return;
    let cancelled = false;
    let url = "";
    void precomputeBlur(image).then((next) => {
      if (cancelled || !next) return;
      url = next;
      setBlurSrc(next);
    });
    return () => {
      cancelled = true;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [image, wide]);

  useEffect(() => {
    const sharp = sharpRef.current;
    const blur = blurRef.current;
    const dim = dimRef.current;
    if (!sharp || !dim) return;
    if (wide || reduced) {
      sharp.style.opacity = "1";
      if (blur) blur.style.opacity = "0";
      dim.style.opacity = wide ? "0" : reduced ? "0.45" : "0.12";
      return;
    }
    const paint = (progress: number) => {
      const t = progress * progress * (3 - 2 * progress);
      sharp.style.opacity = String(1 - t * 0.92);
      if (blur) blur.style.opacity = String(t);
      dim.style.opacity = String(0.12 + t * 0.46);
    };
    let frame = 0;
    let queued = false;
    const apply = () => {
      queued = false;
      paint(Math.min(Math.max(0, window.scrollY) / 420, 1));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced, image, wide, blurSrc]);

  return (
    <div className="stage-bg" aria-hidden="true">
      {image ? (
        <>
          <img ref={sharpRef} className="stage-bg-sharp" src={image} alt="" decoding="async" />
          {blurSrc && !wide ? <img ref={blurRef} className="stage-bg-blur" src={blurSrc} alt="" decoding="async" /> : null}
        </>
      ) : (
        <div className="stage-bg-fallback" />
      )}
      <div className="stage-bg-scrim" />
      <div ref={dimRef} className="stage-bg-dim" />
    </div>
  );
}

function precomputeBlur(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const longest = 72;
        const scale = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          resolve(null);
          return;
        }
        const blur = 8;
        context.filter = `blur(${blur}px)`;
        context.drawImage(img, -blur, -blur, width + blur * 2, height + blur * 2);
        canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/jpeg", 0.72);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
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

function Equalizer() {
  return (
    <span className="eq" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

const EVENT_LIMIT = 2;
const TRACK_LIMIT = 3;

function ShowMore({ count, limit, open, onToggle }: { count: number; limit: number; open: boolean; onToggle: () => void }) {
  if (count <= limit) return null;
  return (
    <button type="button" className="show-more" aria-expanded={open} onClick={onToggle}>
      {open ? "Show less" : "Show more"}
    </button>
  );
}

function previewItems<T extends { id: string }>(items: T[], open: boolean, limit: number, activeId: string | null): T[] {
  if (open) return items;
  const head = items.slice(0, limit);
  if (!activeId || head.some((item) => item.id === activeId)) return head;
  const extra = items.find((item) => item.id === activeId);
  return extra ? [...head, extra] : head;
}

function routeKey(route: Route): string {
  if (route.name === "share") return `share:${route.artistSlug}:${route.eventSlug ?? ""}:${route.trackSlug ?? ""}`;
  if (route.name === "artist" || route.name === "artist-edit") return `${route.name}:${route.id}`;
  if (route.name === "event" || route.name === "event-edit") return `${route.name}:${route.id ?? "new"}`;
  return route.name;
}

export function ArtistStage({
  route,
  uid,
  profile,
  go,
  replace,
  back,
  onHome,
  onSignIn,
}: {
  route: Route;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
  onHome: () => void;
  onSignIn?: () => void;
}) {
  const key = routeKey(route);
  const routeRef = useRef(route);
  routeRef.current = route;
  const [view, setView] = useState<ResolvedPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    let cancelled = false;
    const active = routeRef.current;
    const current = viewRef.current;
    const focus = current ? focusFromPage(active, current.page) : null;
    if (focus && current && focusReady(focus)) {
      const canonical = canonicalFor(active, current.page);
      setStatus("ready");
      setView((existing) => {
        if (!existing) return existing;
        if (existing.openEventId === focus.openEventId && existing.highlightTrackId === focus.highlightTrackId && existing.canonicalPath === canonical) return existing;
        return { ...existing, openEventId: focus.openEventId, highlightTrackId: focus.highlightTrackId, canonicalPath: canonical };
      });
      return () => {
        cancelled = true;
      };
    }
    // A slug that is not on this page is not a public event we already have. Do not
    // block the open animation, and do not read a private share lookup, when the list is complete.
    if (focus?.sameArtist && current && focus.pendingEvent && !focus.pendingTrack && current.page.events.length < ARTIST_EVENT_LIMIT) {
      setStatus("ready");
      setView((existing) => {
        if (!existing || (existing.openEventId === null && existing.canonicalPath === null)) return existing;
        return { ...existing, openEventId: null, canonicalPath: null };
      });
      return () => {
        cancelled = true;
      };
    }
    if (!focus?.sameArtist) {
      setView(null);
      setStatus("loading");
    }
    resolveRoutePage(active, uid)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setView(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce, uid]);

  useEffect(() => {
    const canonical = view?.canonicalPath;
    if (!canonical || canonical === currentPath()) return;
    replace(canonical);
  }, [view?.canonicalPath, replace]);

  async function reload(ensureEventId?: string) {
    const id = viewRef.current?.page.artist?.id;
    if (!id) return;
    const page = await loadArtistPage(id, { ensureEventId, publicOnly: uid !== id });
    setView((current) => (current ? { ...current, page } : current));
  }

  const creatable = route.name === "event-edit" && route.id === null;
  const signIn = onSignIn ? <SignInButton onClick={onSignIn} /> : undefined;
  if (status === "error" && !view?.page.artist) {
    return (
      <Page back={back} onHome={onHome} avatar={signIn}>
        <Empty title="Couldn't load this page" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={() => setNonce((value) => value + 1)}>
          Try again
        </button>
      </Page>
    );
  }
  if (status === "ready" && view && !view.page.artist) {
    return (
      <Page back={back} onHome={onHome} avatar={signIn}>
        <Empty title={creatable ? "Artists publish events" : "This page isn't here"} body={creatable ? "This account can't create an event." : "It may have been removed."} />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }
  if (!view?.page.artist) return <Boot />;

  const artist = view.page.artist;
  const focusNow = focusFromPage(route, view.page);
  const openEventId = focusNow.sameArtist ? (focusNow.pendingEvent ? null : focusNow.openEventId) : view.openEventId;
  const highlightTrackId = focusNow.sameArtist ? (focusNow.pendingTrack ? view.highlightTrackId : focusNow.highlightTrackId) : view.highlightTrackId;
  const owner = ownsArtist(uid, profile.role, artist);
  const editing = route.name === "artist-edit" && owner;
  const creating = creatable && owner;
  const editingEventId = route.name === "event-edit" && route.id && owner ? route.id : null;

  return (
    <StageView
      artist={artist}
      events={view.page.events}
      tracks={view.page.tracks}
      uid={uid}
      owner={owner}
      editing={editing}
      creating={creating}
      editingEventId={editingEventId}
      openEventId={openEventId}
      highlightTrackId={highlightTrackId}
      replace={replace}
      back={back}
      onHome={onHome}
      onSignIn={onSignIn}
      reload={reload}
      setTracks={(tracks) => setView((current) => (current ? { ...current, page: { ...current.page, tracks } } : current))}
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
  highlightTrackId,
  replace,
  back,
  onHome,
  onSignIn,
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
  highlightTrackId: string | null;
  replace: (path: string) => void;
  back: () => void;
  onHome: () => void;
  onSignIn?: () => void;
  reload: (ensureEventId?: string) => Promise<void>;
  setTracks: (tracks: Track[]) => void;
}) {
  const reduced = useReducedMotion();
  const player = usePlayer();
  const adopt = player.adopt;
  const [adding, setAdding] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [trackError, setTrackError] = useState("");
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const focus = editing ? "artist" : creating ? "create" : editingEventId ? "event" : adding ? "add" : editingTrackId ? "track" : null;
  const { upcoming, past } = splitByTime(events);
  const pastFocus = Boolean(editingEventId && past.some((event) => event.id === editingEventId));

  useEffect(() => {
    window.scrollTo(0, 0);
    setUpcomingOpen(false);
    setPastOpen(false);
    setTracksOpen(false);
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
    if (!highlightTrackId) return;
    const index = tracks.findIndex((track) => track.id === highlightTrackId);
    if (index >= TRACK_LIMIT) setTracksOpen(true);
  }, [highlightTrackId, tracks, artist.id]);

  useEffect(() => {
    if (!highlightTrackId) return;
    const behavior = reduced ? "auto" : "smooth";
    const frame = requestAnimationFrame(() => {
      document.getElementById(`track-${highlightTrackId}`)?.scrollIntoView({ behavior, block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightTrackId, tracksOpen, reduced, artist.id]);

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
  const pagePath = artistPath(artist.slug);

  return (
    <div className={focus ? "stage is-focused" : "stage"} data-artist={artist.id}>
      <StageBackdrop image={artist.imageURL} reduced={reduced} />
      <div className="stage-scroll">
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={back} onHome={onHome} />
            {onSignIn ? <SignInButton onClick={onSignIn} /> : null}
          </div>
        </header>
        <div className="stage-spacer" />
        <main className="stage-column">
          <Fold away={focus !== null && focus !== "artist"}>
            <Expand open={editing} id={editing ? "artist-editor" : undefined}>
              <ArtistForm
                key={editing ? "editing" : "idle"}
                artist={artist}
                onClose={() => replace(pagePath)}
                onSaved={async () => {
                  await refresh();
                  replace(pagePath);
                }}
              />
            </Expand>
            <Expand open={!editing}>
              <div className="stage-identity">
                <div className="stage-identity-row">
                  <h1>{artist.name}</h1>
                  <div className="stage-actions">
                    <ShareButton title={artist.name} text={clip(artist.bio, 140) || artist.name} path={pagePath} label={`Share ${artist.name}`} />
                    {owner ? (
                      <button type="button" className="icon-btn" aria-label="Edit page" onClick={() => replace(`/artist/${artist.id}/edit`)}>
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
                <Bio text={artist.bio} />
              </div>
            </Expand>
          </Fold>
          <Fold away={(focus !== null && focus !== "create" && focus !== "event") || pastFocus}>
            <section className="stage-section" aria-labelledby={focus === "create" || (focus === "event" && !pastFocus) ? undefined : "events-heading"}>
              <Fold away={Boolean(creating || editingEventId)}>
                <div className="stage-head">
                  <h2 id="events-heading">Upcoming Events</h2>
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
                    onClose={() => replace(pagePath)}
                    onSaved={async (id) => {
                      await refresh(id);
                      replace(`/event/${id}`);
                    }}
                  />
                </Expand>
              ) : null}
              {upcoming.length === 0 && !creating ? (
                <p className="stage-empty">{owner ? "When you publish a night, it shows up here." : "Nothing is scheduled yet."}</p>
              ) : (
                <ul className="night-list">
                  {previewItems(upcoming, upcomingOpen, EVENT_LIMIT, editingEventId || openEventId).map((event) => {
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
                              artistSlug={artist.slug}
                              replace={replace}
                              onEdit={() => replace(`/event/${event.id}/edit`)}
                              onDelete={async () => {
                                await deleteEvent(event);
                                await refresh();
                                replace(pagePath);
                              }}
                            />
                          </Expand>
                        </Fold>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ShowMore count={upcoming.length} limit={EVENT_LIMIT} open={upcomingOpen} onToggle={() => setUpcomingOpen((value) => !value)} />
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
                  {(tracksOpen || editingTrackId ? tracks : tracks.slice(0, TRACK_LIMIT)).map((track) => {
                    const index = tracks.findIndex((item) => item.id === track.id);
                    const editingThis = editingTrackId === track.id;
                    const resting = adding || (editingTrackId !== null && !editingThis);
                    const current = player.currentId === track.id && player.artistId === artist.id;
                    const cued = highlightTrackId === track.id;
                    return (
                      <li key={track.id} id={resting || editingThis ? undefined : `track-${track.id}`} className={resting ? "track is-rest" : current ? "track is-current" : cued ? "track is-cued" : "track"}>
                        {resting ? (
                          <div className="track-rest">
                            <span className="track-index">{index + 1}</span>
                            <span className="track-title">{track.title}</span>
                          </div>
                        ) : (
                          <>
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
                              playing={current && player.playing}
                              owner={owner}
                              sharePath={trackPath(artist.slug, track.slug)}
                              onPlay={() => player.toggle(track, queue)}
                              onEdit={() => setEditingTrackId(track.id)}
                            />
                          </Expand>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {editingTrackId ? null : <ShowMore count={tracks.length} limit={TRACK_LIMIT} open={tracksOpen} onToggle={() => setTracksOpen((value) => !value)} />}
            </section>
          </Fold>
          {past.length > 0 ? (
            <Fold away={focus !== null && !(focus === "event" && pastFocus)}>
              <section className="stage-section" aria-labelledby="past-events-heading">
                <div className="stage-head">
                  <h2 id="past-events-heading">Past Events</h2>
                </div>
                <ul className="night-list">
                  {previewItems(past, pastOpen, EVENT_LIMIT, editingEventId || openEventId).map((event) => {
                    const editingThis = editingEventId === event.id;
                    return (
                      <li key={event.id}>
                        <Fold away={editingEventId !== null && !editingThis}>
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
                              artistSlug={artist.slug}
                              replace={replace}
                              onEdit={() => replace(`/event/${event.id}/edit`)}
                              onDelete={async () => {
                                await deleteEvent(event);
                                await refresh();
                                replace(pagePath);
                              }}
                            />
                          </Expand>
                        </Fold>
                      </li>
                    );
                  })}
                </ul>
                <ShowMore count={past.length} limit={EVENT_LIMIT} open={pastOpen} onToggle={() => setPastOpen((value) => !value)} />
              </section>
            </Fold>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function EventCard({
  event,
  open,
  owner,
  artistSlug,
  replace,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  open: boolean;
  owner: boolean;
  artistSlug: string;
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

  const artistUrl = artistPath(artistSlug);
  const eventUrl = event.visibility === "public" ? eventPath(artistSlug, event.slug) : `/event/${event.id}`;
  const canShare = event.visibility === "public";

  return (
    <article className={open ? "night is-open" : "night"} id={`event-${event.id}`}>
      {canShare ? <ShareButton title={event.title} text={`${event.venue}, ${event.city}`} path={eventUrl} label={`Share ${event.title}`} /> : null}
      <button
        type="button"
        className="night-summary"
        aria-expanded={open}
        aria-controls={`event-panel-${event.id}`}
        onClick={() => replace(open ? artistUrl : eventUrl)}
      >
        <span className="night-thumb">
          <Cover url={event.imageURL} alt="" />
        </span>
        <span className="night-copy">
          <span className="night-title">
            {event.title}
            {event.visibility === "private" ? <span className="private-mark">Private</span> : null}
          </span>
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
  playing,
  owner,
  sharePath,
  onPlay,
  onEdit,
}: {
  track: Track;
  playing: boolean;
  owner: boolean;
  sharePath: string;
  onPlay: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="track-row">
      <button type="button" className="track-main" aria-pressed={playing} aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`} onClick={onPlay}>
        <span className={playing ? "track-play is-playing" : "track-play"}>
          {playing ? <Equalizer /> : <PlayIcon />}
        </span>
        <span className="track-copy">
          <span className="track-title">{track.title}</span>
          <span className="track-time">{formatDuration(track.duration)}</span>
        </span>
      </button>
      {sharePath ? <ShareButton title={track.title} text={track.title} path={sharePath} label={`Share ${track.title}`} /> : null}
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
