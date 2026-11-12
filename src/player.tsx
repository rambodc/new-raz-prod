import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Track } from "./data";
import { formatDuration } from "./format";

export type PlayQueue = {
  artistId: string;
  artistName: string;
  artistImage: string;
  tracks: Track[];
};

type PlayerApi = {
  currentId: string | null;
  playing: boolean;
  failed: boolean;
  artistId: string | null;
  artistName: string;
  artistImage: string;
  track: Track | null;
  toggle: (track: Track, queue: PlayQueue) => void;
  toggleCurrent: () => void;
  adopt: (queue: PlayQueue) => void;
  next: () => void;
  previous: () => void;
  audioRef: RefObject<HTMLAudioElement | null>;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("Player is only available inside Playback.");
  return value;
}

export function Playback({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const tracksRef = useRef<Track[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const artistIdRef = useRef<string | null>(null);
  const playIndexRef = useRef<(index: number) => void>(() => undefined);
  const nextRef = useRef<() => void>(() => undefined);
  const previousRef = useRef<() => void>(() => undefined);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState("");
  const [artistImage, setArtistImage] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  currentIdRef.current = currentId;
  tracksRef.current = tracks;

  const playIndex = useCallback((index: number) => {
    const list = tracksRef.current;
    const audio = audioRef.current;
    if (!audio || list.length === 0) return;
    const next = ((index % list.length) + list.length) % list.length;
    const track = list[next];
    currentIdRef.current = track.id;
    setCurrentId(track.id);
    setFailed(false);
    if (audio.dataset.id !== track.id) {
      audio.dataset.id = track.id;
      audio.src = track.audioURL;
      try {
        audio.currentTime = 0;
      } catch {
        // Metadata is not ready yet. Playback still starts at the beginning.
      }
    }
    const pending = audio.play();
    if (pending) pending.catch(() => setFailed(true));
  }, []);

  const playNext = useCallback(() => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    const index = list.findIndex((track) => track.id === currentIdRef.current);
    playIndex(index === -1 ? 0 : (index + 1) % list.length);
  }, [playIndex]);

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (audio && currentIdRef.current && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const list = tracksRef.current;
    if (list.length === 0) return;
    const index = list.findIndex((track) => track.id === currentIdRef.current);
    playIndex(index <= 0 ? list.length - 1 : index - 1);
  }, [playIndex]);

  playIndexRef.current = playIndex;
  nextRef.current = playNext;
  previousRef.current = playPrevious;

  const remember = useCallback((queue: PlayQueue) => {
    artistIdRef.current = queue.artistId;
    tracksRef.current = queue.tracks;
    setArtistId(queue.artistId);
    setArtistName(queue.artistName);
    setArtistImage(queue.artistImage);
    setTracks(queue.tracks);
  }, []);

  const toggleCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentIdRef.current) return;
    if (audio.paused) {
      setFailed(false);
      const pending = audio.play();
      if (pending) pending.catch(() => setFailed(true));
    } else audio.pause();
  }, []);

  const toggle = useCallback((track: Track, queue: PlayQueue) => {
    const audio = audioRef.current;
    if (!audio) return;
    const same = currentIdRef.current === track.id && artistIdRef.current === queue.artistId;
    remember(queue);
    if (same) {
      toggleCurrent();
      return;
    }
    const index = queue.tracks.findIndex((item) => item.id === track.id);
    if (index >= 0) playIndex(index);
  }, [playIndex, remember, toggleCurrent]);

  const adopt = useCallback((queue: PlayQueue) => {
    if (artistIdRef.current !== queue.artistId || !currentIdRef.current) return;
    remember(queue);
    if (queue.tracks.some((track) => track.id === currentIdRef.current)) return;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      delete audio.dataset.id;
    }
    currentIdRef.current = null;
    setCurrentId(null);
    setPlaying(false);
    setFailed(false);
  }, [remember]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onPlaying = () => setFailed(false);
    const onEnded = () => {
      const list = tracksRef.current;
      const index = list.findIndex((track) => track.id === currentIdRef.current);
      if (index >= 0 && index < list.length - 1) playIndexRef.current(index + 1);
      else audio.currentTime = 0;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const assign = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // This browser doesn't support the action.
      }
    };
    assign("play", () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!currentIdRef.current) return;
      const pending = audio.play();
      if (pending) pending.catch(() => setFailed(true));
    });
    assign("pause", () => audioRef.current?.pause());
    assign("nexttrack", () => nextRef.current());
    assign("previoustrack", () => previousRef.current());
    assign("seekto", (details) => {
      if (details.seekTime == null || !audioRef.current) return;
      const cap = Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : details.seekTime;
      audioRef.current.currentTime = Math.min(Math.max(0, details.seekTime), cap);
    });
    assign("seekbackward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset ?? 10));
    });
    assign("seekforward", (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      const cap = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime + 30;
      audio.currentTime = Math.min(cap, audio.currentTime + (details.seekOffset ?? 10));
    });
    return () => {
      assign("play", null);
      assign("pause", null);
      assign("nexttrack", null);
      assign("previoustrack", null);
      assign("seekto", null);
      assign("seekbackward", null);
      assign("seekforward", null);
      session.metadata = null;
      session.playbackState = "none";
    };
  }, []);

  const track = tracks.find((item) => item.id === currentId) ?? null;

  useEffect(() => {
    document.documentElement.classList.toggle("has-player", track !== null);
  }, [track]);

  useEffect(() => () => document.documentElement.classList.remove("has-player"), []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!track) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    const artwork = track.coverURL || artistImage;
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: artistName,
      album: artistName,
      artwork: artwork ? [{ src: artwork, sizes: "512x512" }] : [],
    });
    session.playbackState = playing ? "playing" : "paused";
  }, [track, playing, artistName, artistImage]);

  const api = useMemo<PlayerApi>(() => ({
    currentId,
    playing,
    failed,
    artistId,
    artistName,
    artistImage,
    track,
    toggle,
    toggleCurrent,
    adopt,
    next: playNext,
    previous: playPrevious,
    audioRef,
  }), [currentId, playing, failed, artistId, artistName, artistImage, track, toggle, toggleCurrent, adopt, playNext, playPrevious]);

  return (
    <PlayerContext.Provider value={api}>
      <audio ref={audioRef} className="stage-audio" playsInline preload="none" />
      {children}
    </PlayerContext.Provider>
  );
}

export function MiniPlayer({ onOpen }: { onOpen?: (artistId: string, trackId: string) => void }) {
  const { track, failed, artistId, artistName, artistImage, next, previous, audioRef } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const seeking = useRef(false);
  const switchedAt = useRef(0);

  useEffect(() => {
    switchedAt.current = performance.now();
    setProgress(0);
    setDuration(track?.duration ?? 0);
  }, [track?.id, track?.duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const publish = () => {
      if (audio.dataset.id !== track.id) return;
      const time = audio.currentTime || 0;
      if (performance.now() - switchedAt.current < 500 && time > 0.8) return;
      const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : track.duration;
      setDuration(length);
      if (!seeking.current) setProgress(time);
      if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(Math.max(audio.currentTime, 0), audio.duration),
          });
        } catch {
          // Ignore browsers that reject the position.
        }
      }
    };
    publish();
    audio.addEventListener("timeupdate", publish);
    audio.addEventListener("durationchange", publish);
    return () => {
      audio.removeEventListener("timeupdate", publish);
      audio.removeEventListener("durationchange", publish);
    };
  }, [audioRef, track]);

  if (!track) return null;
  const cover = track.coverURL || artistImage;
  const shown = duration > 0 ? duration : track.duration;

  function seek(value: number) {
    const audio = audioRef.current;
    setProgress(value);
    if (audio) audio.currentTime = value;
  }

  return (
    <div className="mini" role="region" aria-label="Player">
      <div className="mini-inner">
        <div className="mini-row">
          <button
            type="button"
            className="mini-id"
            onClick={() => {
              if (onOpen && artistId) {
                onOpen(artistId, track.id);
                return;
              }
              const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById(`track-${track.id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
            }}
          >
            {cover ? <img className="mini-art" src={cover} alt="" width={42} height={42} decoding="async" loading="lazy" /> : <span className="mini-art" aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</span>}
            <span className="mini-copy">
              <strong>{track.title}</strong>
              <span className="mini-artist">{artistName}</span>
            </span>
          </button>
          <div className="mini-controls">
            <button type="button" className="mini-skip" aria-label="Previous track" onClick={previous}>
              <SkipIcon direction="previous" />
            </button>
            <PlayButton />
            <button type="button" className="mini-skip" aria-label="Next track" onClick={next}>
              <SkipIcon direction="next" />
            </button>
          </div>
        </div>
        <div className="mini-seek">
          <span className="mini-time">{formatDuration(progress)}</span>
          <input
            className="mini-scrub"
            type="range"
            min={0}
            max={Math.max(shown, 0.1)}
            step={0.1}
            value={Math.min(progress, Math.max(shown, 0.1))}
            aria-label="Seek"
            aria-valuetext={`${formatDuration(progress)} of ${formatDuration(shown)}`}
            onPointerDown={() => {
              seeking.current = true;
            }}
            onPointerUp={() => {
              seeking.current = false;
            }}
            onKeyDown={() => {
              seeking.current = true;
            }}
            onKeyUp={() => {
              seeking.current = false;
            }}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span className="mini-time is-end">{formatDuration(shown)}</span>
        </div>
        {failed ? <p className="mini-error">Couldn't play this track.</p> : null}
      </div>
    </div>
  );
}

function PlayButton() {
  const { track, playing, toggleCurrent } = usePlayer();
  if (!track) return null;
  return (
    <button type="button" className="mini-play" aria-label={playing ? "Pause" : "Play"} onClick={toggleCurrent}>
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h3.2v14H7V5Zm6.8 0H17v14h-3.2V5Z" />
    </svg>
  );
}

function SkipIcon({ direction }: { direction: "previous" | "next" }) {
  const previous = direction === "previous";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {previous ? <path d="M5 6h2.2v12H5V6Zm13.6 1.1L8.4 12l10.2 4.9V7.1Z" /> : <path d="M16.8 6H19v12h-2.2V6ZM5.4 7.1 15.6 12 5.4 16.9V7.1Z" />}
    </svg>
  );
}
