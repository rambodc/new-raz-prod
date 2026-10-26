import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePrefersReducedMotion } from "../hooks";
import { openChannel, type Message, type ShowChannel } from "../show/channel";
import { applyRep, INITIAL_REMOTE } from "../show/remote";
import { CAPACITY, crowdAt, levels as levelsAt, moodAt, NIGHT_SECONDS, questionById, questionResults, SCENES, sceneAt, type SceneId } from "../show/sim";
import { Skyline } from "../show/Skyline";
import { Wall } from "../show/Wall";
import "../styles/screen.css";

const BrushCanvas = lazy(() => import("../show/Canvases").then((m) => ({ default: m.BrushCanvas })));
const ClosingCanvas = lazy(() => import("../show/Canvases").then((m) => ({ default: m.ClosingCanvas })));

const SPEEDS = [1, 2, 4] as const;
const TICK_MS = 200;
const REP_FRESH_MS = 6000;
const QUESTION_SHOW_MS = 40_000;

const NIGHT_PEAKS = { crowd: crowdAt(1), mood: Math.max(...Array.from({ length: 40 }, (_, i) => moodAt(i / 39))) };

type Action = { msg: Message; now: number };
const reduce = (state: typeof INITIAL_REMOTE, a: Action) => applyRep(state, a.msg, a.now);

const SCENE_KEYS: Record<string, SceneId> = { "1": "brush", "2": "skyline", "3": "wall", "4": "closing" };

export default function VenueScreen() {
  const calm = usePrefersReducedMotion();
  const [remote, dispatch] = useReducer(reduce, INITIAL_REMOTE);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [p, setP] = useState(0);
  const [crowdOv, setCrowdOv] = useState<number | null>(null);
  const [moodOv, setMoodOv] = useState<number | null>(null);
  const [panel, setPanel] = useState(false);
  const [idle, setIdle] = useState(false);
  const [repAt, setRepAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const channel = useRef<ShowChannel | null>(null);

  const lv = levelsAt(p, crowdOv, moodOv);
  const scene: SceneId = remote.sceneLock ?? sceneAt(p);
  const live = useRef({ crowd: lv.crowd, mood: lv.mood, black: remote.black });
  live.current = { crowd: lv.crowd, mood: lv.mood, black: remote.black };

  // The night the screen has shown so far (used by the closing picture).
  const peaks = useRef(NIGHT_PEAKS);
  peaks.current = { crowd: Math.max(peaks.current.crowd, lv.crowd), mood: Math.max(peaks.current.mood, lv.mood) };

  /* The simulated night. */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setP((x) => Math.min(1, x + (TICK_MS / 1000 / NIGHT_SECONDS) * speed));
      setNow(Date.now());
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed]);
  useEffect(() => {
    if (playing && p >= 1) setPlaying(false);
  }, [playing, p]);
  useEffect(() => {
    if (playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  /* Talking to the rep phone. */
  const latest = useRef({ count: lv.count, mood: lv.mood, scene, black: remote.black, question: remote.question });
  latest.current = { count: lv.count, mood: lv.mood, scene, black: remote.black, question: remote.question };
  useEffect(() => {
    const ch = openChannel((msg) => {
      const t = Date.now();
      if (msg.type === "hello" && msg.from === "rep") {
        setRepAt(t);
        return;
      }
      if (msg.type === "ping") {
        setRepAt(t);
        return;
      }
      if (msg.type === "scene" || msg.type === "drop" || msg.type === "question" || msg.type === "black") {
        setRepAt(t);
        dispatch({ msg, now: t });
      }
    });
    channel.current = ch;
    ch.post({ type: "hello", from: "screen" });
    const echo = window.setInterval(() => {
      const s = latest.current;
      const q = s.question ? questionById(s.question.id) : null;
      const [a, b] = q && s.question ? questionResults(q.id, s.count, s.mood, Date.now() - s.question.at) : [0, 0];
      ch.post({ type: "state", count: s.count, mood: s.mood, scene: s.scene, black: s.black, question: q ? { id: q.id, a, b } : null });
    }, 500);
    return () => {
      window.clearInterval(echo);
      ch.close();
      channel.current = null;
    };
  }, []);

  /* Controls fade away when nobody is touching the screen. */
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 4500);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const pick = useCallback((id: SceneId | null) => dispatch({ msg: { type: "scene", scene: id }, now: Date.now() }), []);
  const toggleBlack = useCallback(() => dispatch({ msg: { type: "black", on: !live.current.black }, now: Date.now() }), []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.current?.requestFullscreen?.().catch(() => {});
  }, []);
  const togglePlay = useCallback(() => {
    setPlaying((on) => {
      if (!on && p >= 1) setP(0);
      return !on;
    });
  }, [p]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (SCENE_KEYS[e.key]) pick(SCENE_KEYS[e.key]);
      else if (e.key === "b" || e.key === "B") toggleBlack();
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, toggleBlack, toggleFullscreen, togglePlay]);

  const repHere = repAt !== null && now - repAt < REP_FRESH_MS;
  const q = remote.question && now - remote.question.at < QUESTION_SHOW_MS ? questionById(remote.question.id) : null;
  const [qa, qb] = q && remote.question ? questionResults(q.id, lv.count, lv.mood, now - remote.question.at) : [0, 0];
  const qTotal = Math.max(1, qa + qb);
  const clock = useMemo(() => {
    const mins = Math.round(p * 150);
    return `${Math.floor(mins / 60) + 8}:${String(mins % 60).padStart(2, "0")} pm`;
  }, [p]);

  return (
    <div ref={root} className={`vs${idle && !panel ? " is-idle" : ""}${calm ? " is-calm" : ""}`} data-scene={scene} data-black={remote.black ? "on" : "off"}>
      <h1 className="sr-only">Venue screen</h1>

      <div className="vs-stage" aria-hidden={remote.black ? "true" : undefined}>
        {scene === "brush" && (
          <Suspense fallback={null}>
            <BrushCanvas live={live} calm={calm} />
          </Suspense>
        )}
        {scene === "skyline" && <Skyline crowd={lv.crowd} count={lv.count} />}
        {scene === "wall" && <Wall count={lv.count} />}
        {scene === "closing" && (
          <div className="vs-closing">
            <Suspense fallback={null}>
              <ClosingCanvas peakCrowd={peaks.current.crowd} peakMood={peaks.current.mood} calm={calm} />
            </Suspense>
            <p className="vs-thanks">Thank you, Calgary</p>
            <p className="vs-thanks-sub">{lv.count} of us, one night.</p>
          </div>
        )}
        {scene === "brush" && (
          <p className="vs-count vs-count--quiet" aria-hidden="true">
            <strong>{lv.count}</strong> here
          </p>
        )}
        {remote.dropN > 0 && <div key={remote.dropN} className="vs-drop" data-testid="drop-burst" aria-hidden="true" />}
        {q && (
          <div className="vs-ask" role="status" aria-live="polite">
            <p>{q.text}</p>
            <div className="vs-ask-bars">
              <span style={{ width: `${(qa / qTotal) * 100}%` }}>{qa > 0 ? q.a : ""}</span>
              <span style={{ width: `${(qb / qTotal) * 100}%` }}>{qb > 0 ? q.b : ""}</span>
            </div>
          </div>
        )}
      </div>

      <div className="vs-black" data-testid="black-layer" hidden={!remote.black} />

      <div className="vs-chrome">
        <div className="vs-top">
          <Link to="/app" className="vs-btn vs-btn--icon" aria-label="Exit to the lab" title="Exit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          {repHere && (
            <span className="vs-rep" role="status">
              <i aria-hidden="true" /> Rep connected
            </span>
          )}
          <span className="vs-spacer" />
          <button type="button" className="vs-btn" onClick={() => setPanel((o) => !o)} aria-expanded={panel} aria-controls="vs-panel">
            Controls
          </button>
          <button type="button" className="vs-btn vs-btn--icon" onClick={toggleFullscreen} aria-label={fullscreen ? "Leave full screen" : "Full screen"} title="Full screen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={fullscreen ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
            </svg>
          </button>
        </div>

        <div className="vs-panel" id="vs-panel" hidden={!panel}>
          <div className="vs-scenes" role="group" aria-label="Scene">
            {SCENES.map((s) => (
              <button key={s.id} type="button" className="vs-btn" aria-pressed={scene === s.id} onClick={() => pick(s.id)}>
                {s.name}
              </button>
            ))}
            <button type="button" className="vs-btn vs-btn--ghost" aria-pressed={remote.sceneLock === null} onClick={() => pick(null)}>
              Auto
            </button>
          </div>
          <div className="vs-row">
            <button type="button" className="vs-btn" onClick={togglePlay}>
              {playing ? "Pause" : p >= 1 ? "Replay" : "Play"}
            </button>
            <div className="vs-speed" role="group" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className="vs-btn vs-btn--ghost" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                  {s}x
                </button>
              ))}
            </div>
            <span className="vs-clock">{clock}</span>
            <button type="button" className="vs-btn" aria-pressed={remote.black} onClick={toggleBlack}>
              Black screen
            </button>
          </div>
          <div className="vs-sliders">
            <label>
              <span>Crowd</span>
              <input type="range" min={0} max={CAPACITY} step={5} value={lv.count} onChange={(e) => setCrowdOv(Number(e.target.value) / CAPACITY)} aria-label="Crowd size" />
              <output>{lv.count}</output>
            </label>
            <label>
              <span>Mood</span>
              <input type="range" min={0} max={100} step={1} value={Math.round(lv.mood * 100)} onChange={(e) => setMoodOv(Number(e.target.value) / 100)} aria-label="Mood, light to heavy" />
              <output>{lv.mood < 0.34 ? "Light" : lv.mood < 0.67 ? "Mixed" : "Heavy"}</output>
            </label>
            <button
              type="button"
              className="vs-btn vs-btn--ghost"
              disabled={crowdOv === null && moodOv === null}
              onClick={() => {
                setCrowdOv(null);
                setMoodOv(null);
              }}
            >
              Follow the night
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
