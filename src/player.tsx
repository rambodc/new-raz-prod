import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Track } from "./data";
import { formatDuration } from "./format";

type PlayerApi = {
  currentId: string | null;
  playing: boolean;
  failed: boolean;
  artistName: string;
  artistImage: string;
  track: Track | null;
  toggle: (track: Track) => void;
  next: () => void;
  previous: () => void;
  audioRef: RefObject<HTMLAudioElement | null>;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("Player is only available on an artist page.");
  return value;
}

export function Player({
  tracks,
  artistName,
  artistImage,
  children,
}: {
  tracks: Track[];
  artistName: string;
  artistImage: string;
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const tracksRef = useRef(tracks);
  const currentIdRef = useRef<string | null>(null);
  const playIndexRef = useRef<(index: number) => void>(() => undefined);
  const nextRef = useRef<() => void>(() => undefined);
  const previousRef = useRef<() => void>(() => undefined);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  tracksRef.current = tracks;
  currentIdRef.current = currentId;

  function playIndex(index: number) {
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
  }

  function playNext() {
    const list = tracksRef.current;
    if (list.length === 0) return;
    const index = list.findIndex((track) => track.id === currentIdRef.current);
    playIndex(index === -1 ? 0 : (index + 1) % list.length);
  }

  function playPrevious() {
    const audio = audioRef.current;
    if (audio && currentIdRef.current && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const list = tracksRef.current;
    if (list.length === 0) return;
    const index = list.findIndex((track) => track.id === currentIdRef.current);
    playIndex(index <= 0 ? list.length - 1 : index - 1);
  }

  playIndexRef.current = playIndex;
  nextRef.current = playNext;
  previousRef.current = playPrevious;

  function toggle(track: Track) {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIdRef.current === track.id) {
      if (audio.paused) {
        setFailed(false);
        const pending = audio.play();
        if (pending) pending.catch(() => setFailed(true));
      } else audio.pause();
      return;
    }
    const index = tracksRef.current.findIndex((item) => item.id === track.id);
    if (index >= 0) playIndex(index);
  }

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
    if (!currentId || tracks.some((track) => track.id === currentId)) return;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      delete audio.dataset.id;
    }
    currentIdRef.current = null;
    setCurrentId(null);
    setPlaying(false);
  }, [tracks, currentId]);

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
      if (!currentIdRef.current) {
        playIndexRef.current(0);
        return;
      }
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

  return (
    <PlayerContext.Provider value={{ currentId, playing, failed, artistName, artistImage, track, toggle, next: playNext, previous: playPrevious, audioRef }}>
      <audio ref={audioRef} className="stage-audio" playsInline preload="none" />
      {children}
    </PlayerContext.Provider>
  );
}

export function MiniPlayer() {
  const { track, failed, artistName, artistImage, next, previous, audioRef } = usePlayer();
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
      // A late timeupdate from the previous track can report a high position just after src changes.
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
              const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById(`track-${track.id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
            }}
          >
            {cover ? <img src={cover} alt="" /> : <span aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</span>}
            <span className="mini-copy">
              <strong>{track.title}</strong>
              <span>{artistName}</span>
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
  const { track, playing, toggle } = usePlayer();
  if (!track) return null;
  return (
    <button type="button" className="mini-play" aria-label={playing ? "Pause" : "Play"} onClick={() => toggle(track)}>
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h3.2v14H7V5Zm6.8 0H17v14h-3.2V5Z" />
    </svg>
  );
}

function SkipIcon({ direction }: { direction: "previous" | "next" }) {
  const flip = direction === "previous";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 5h2.2v14H6V5Zm3.2 7 8.8 6.2V5.8L9.2 12Z" />
    </svg>
  );
}
