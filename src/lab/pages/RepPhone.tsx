import { useCallback, useEffect, useRef, useState } from "react";
import { openChannel, type Message, type ShowChannel } from "../show/channel";
import { levels as levelsAt, NIGHT_SECONDS, QUESTIONS, questionById, questionResults, SCENES, SUGGESTIONS, type SceneId } from "../show/sim";
import "../styles/rep.css";

/** After a drop the button rests this long, so nobody can fire a second one by accident. */
export const DROP_COOLDOWN_MS = 4000;
const SENT_SHOW_MS = 1800;
const LINK_FRESH_MS = 3000;

type Echo = { count: number; mood: number; scene: SceneId; black: boolean; question: { id: string; a: number; b: number } | null; at: number };

export default function RepPhone() {
  const channel = useRef<ShowChannel | null>(null);
  const [echo, setEcho] = useState<Echo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lock, setLock] = useState<SceneId | null>(null);
  const [black, setBlack] = useState(false);
  const [asked, setAsked] = useState<{ id: string; at: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [tip, setTip] = useState(0);
  const [tipDone, setTipDone] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());

  const send = useCallback((msg: Message) => channel.current?.post(msg), []);

  useEffect(() => {
    const ch = openChannel((msg) => {
      if (msg.type === "state") setEcho({ count: msg.count, mood: msg.mood, scene: msg.scene, black: msg.black, question: msg.question, at: Date.now() });
    });
    channel.current = ch;
    ch.post({ type: "hello", from: "rep" });
    const beat = window.setInterval(() => ch.post({ type: "ping" }), 2000);
    return () => {
      window.clearInterval(beat);
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const linked = echo !== null && now - echo.at < LINK_FRESH_MS;
  // With no screen open, the phone shows its own made-up night so it never looks empty.
  const local = levelsAt(Math.min(1, (now - startedAt) / 1000 / NIGHT_SECONDS), null, null);
  const count = linked && echo ? echo.count : local.count;
  const mood = linked && echo ? echo.mood : local.mood;
  const blackOn = linked && echo ? echo.black : black;
  const scene = linked && echo ? echo.scene : (lock ?? "brush");

  const cooling = dropAt !== null && now - dropAt < DROP_COOLDOWN_MS;
  const sent = dropAt !== null && now - dropAt < SENT_SHOW_MS;
  const cool = cooling && dropAt !== null ? (now - dropAt) / DROP_COOLDOWN_MS : 1;

  const drop = () => {
    if (cooling) return;
    setDropAt(Date.now());
    send({ type: "drop" });
  };
  const choose = (id: SceneId | null) => {
    setLock(id);
    send({ type: "scene", scene: id });
  };
  const nextScene = () => {
    const i = SCENES.findIndex((s) => s.id === scene);
    choose(SCENES[(i + 1) % SCENES.length].id);
  };
  const ask = (id: string | null) => {
    setAsked(id ? { id, at: Date.now() } : null);
    send({ type: "question", id });
  };
  const toggleBlack = () => {
    setBlack(!blackOn);
    send({ type: "black", on: !blackOn });
  };

  const q = asked ? questionById(asked.id) : null;
  let qa = 0;
  let qb = 0;
  if (q && asked) {
    if (linked && echo?.question?.id === q.id) [qa, qb] = [echo.question.a, echo.question.b];
    else [qa, qb] = questionResults(q.id, count, mood, now - asked.at);
  }
  const qTotal = Math.max(1, qa + qb);

  const suggestion = SUGGESTIONS[tip % SUGGESTIONS.length];
  const accept = () => {
    if (suggestion.scene) choose(suggestion.scene);
    if (suggestion.question) ask(suggestion.question);
    setTipDone(suggestion.id);
    setTip((n) => n + 1);
  };

  return (
    <div className="rep" data-linked={linked ? "yes" : "no"}>
      <h1 className="sr-only">Rep phone</h1>

      <div className="rep-read" role="status" aria-label="Room now">
        <div>
          <strong>{count}</strong>
          <span>in</span>
        </div>
        <div className="rep-meter" role="meter" aria-label="Room mood, light to heavy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mood * 100)}>
          <i style={{ left: `${mood * 100}%` }} />
        </div>
        <span className={`rep-link${linked ? " is-on" : ""}`}>{linked ? "Screen linked" : "No screen yet"}</span>
      </div>

      <button type="button" className="rep-big rep-drop" onClick={drop} disabled={cooling} style={{ "--cool": cool } as React.CSSProperties} data-state={sent ? "sent" : cooling ? "cool" : "ready"}>
        <span className="rep-big-main">{sent ? "Drop sent" : "DROP"}</span>
        {cooling && !sent && <span className="rep-big-sub">Wait a moment</span>}
      </button>

      <div className="rep-pair">
        <button type="button" className="rep-big rep-scene" onClick={nextScene}>
          <span className="rep-big-sub">SCENE</span>
          <span className="rep-big-main">{SCENES.find((s) => s.id === scene)?.short}</span>
        </button>
        <button type="button" className="rep-big rep-black" aria-pressed={blackOn} onClick={toggleBlack}>
          <span className="rep-big-main">{blackOn ? "Back on" : "Black screen"}</span>
        </button>
      </div>

      <div className="rep-dots" role="group" aria-label="Pick a scene">
        {SCENES.map((s) => (
          <button key={s.id} type="button" aria-label={s.name} aria-pressed={scene === s.id} onClick={() => choose(s.id)} />
        ))}
        <button type="button" className="rep-auto" aria-pressed={lock === null && !linked} onClick={() => choose(null)}>
          Auto
        </button>
      </div>

      <section className="rep-ask" aria-label="Ask the room">
        <h2>ASK THE ROOM</h2>
        <div className="rep-qs">
          {QUESTIONS.map((x) => (
            <button key={x.id} type="button" className="rep-q" aria-pressed={asked?.id === x.id} onClick={() => ask(asked?.id === x.id ? null : x.id)}>
              {x.text}
            </button>
          ))}
        </div>
        {q && (
          <div className="rep-result" role="status" aria-label={`${q.a} ${qa}, ${q.b} ${qb}`}>
            <div className="rep-bar">
              <span style={{ width: `${(qa / qTotal) * 100}%` }} />
            </div>
            <p>
              <b>{q.a}</b> {qa} <span>·</span> <b>{q.b}</b> {qb}
            </p>
          </div>
        )}
      </section>

      <section className="rep-tip" aria-label="Suggestion">
        <span className="rep-tag">AI idea · demo</span>
        <p>{suggestion.text}</p>
        <div>
          <button type="button" className="lb-btn" onClick={accept}>
            Accept
          </button>
          <button type="button" className="lb-btn lb-btn--ghost" onClick={() => setTip((n) => n + 1)}>
            Skip
          </button>
        </div>
        {tipDone && <span className="sr-only" role="status">Done</span>}
      </section>

      <p className="rep-hint">Open the Venue screen in another tab to see it respond.</p>
    </div>
  );
}
