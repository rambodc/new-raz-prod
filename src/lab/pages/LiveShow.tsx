import { useEffect, useRef, useState } from "react";
import { formatClock, usePrefersReducedMotion } from "../hooks";
import { LIVE } from "../mock";
import "../styles/live.css";

const START_ELAPSED = 4300; // the demo "show clock" begins 1h11m in

function useShowClock() {
  const [t, setT] = useState(START_ELAPSED);
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

export default function LiveShow() {
  const clock = useShowClock();
  const reduced = usePrefersReducedMotion();

  // Scene + track rotation on the mock venue screen.
  const scene = LIVE.scenes[Math.floor(clock / 9) % LIVE.scenes.length];
  const trackIdx = Math.floor(clock / 90) % LIVE.tracks.length;
  const track = LIVE.tracks[trackIdx];
  const trackPos = (clock % 90) * (track.length / 90);

  // Drops loop through a countdown so the demo always has something about to happen.
  const dropCycle = 36;
  const nextIn = dropCycle - (clock % dropCycle);
  const dropIdx = Math.floor(clock / dropCycle) % LIVE.drops.length;
  const drop = LIVE.drops[dropIdx];
  const upcoming = [1, 2].map((n) => LIVE.drops[(dropIdx + n) % LIVE.drops.length]);

  // Crowd vote: tap to choose, others' votes drift on their own.
  const [votes, setVotes] = useState(() => LIVE.poll.options.map((o) => o.votes));
  const [mine, setMine] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      setVotes((v) => v.map((n, i) => n + (Math.random() < (i === 1 ? 0.7 : 0.4) ? 1 : 0)));
    }, 2200);
    return () => window.clearInterval(id);
  }, []);
  const total = votes.reduce((a, b) => a + b, 0) + (mine !== null ? 1 : 0);
  function vote(i: number) {
    setMine(i);
  }

  // Feed of moments: a new line every few seconds.
  const [feed, setFeed] = useState(() => [LIVE.moments[0], LIVE.moments[1], LIVE.moments[2]].map((text, i) => ({ id: i, text, ago: `${(3 - i) * 4}m` })));
  const nextFeed = useRef(3);
  useEffect(() => {
    const id = window.setInterval(() => {
      const n = nextFeed.current++;
      setFeed((f) => [{ id: n, text: LIVE.moments[n % LIVE.moments.length], ago: "now" }, ...f.map((x) => ({ ...x, ago: x.ago === "now" ? "1m" : x.ago }))].slice(0, 6));
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="live-page">
      <header className="lb-head live-head">
        <p className="lb-eyebrow">
          <span className="live-pulse" aria-hidden="true" /> Fan · Live now
        </p>
        <h1 className="lb-display">
          {LIVE.show.split(":")[0]}: <em>{LIVE.show.split(":")[1]?.trim()}</em>
        </h1>
        <p className="lb-lede">
          {LIVE.venue} · {LIVE.inRoom} verified in the room · show clock {formatClock(clock)}
        </p>
      </header>

      <div className="live-grid">
        <section className="live-screen lb-card" aria-label="Venue screen sync">
          <div className="screen" style={{ "--hue": scene.hue, "--hue2": scene.hue2 } as React.CSSProperties} data-reduced={reduced || undefined}>
            <span className="screen-layer l1" />
            <span className="screen-layer l2" />
            <span className="screen-layer l3" />
            <span className="screen-scan" />
            <div className="screen-hud">
              <span className="chip-live">Synced</span>
              <span className="screen-scene">{scene.name}</span>
            </div>
            <div className="screen-eq" aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms`, animationDuration: `${620 + ((i * 53) % 420)}ms` }} />
              ))}
            </div>
          </div>
          <div className="np">
            <div>
              <p className="np-label">Now playing on the venue screen</p>
              <p className="np-title">{track.title}</p>
              <p className="np-artist">{track.artist}</p>
            </div>
            <div className="np-sync">
              <span>Rep</span>
              <strong>{LIVE.rep}</strong>
            </div>
          </div>
          <div className="np-bar" role="progressbar" aria-label="Track position" aria-valuemin={0} aria-valuemax={track.length} aria-valuenow={Math.round(trackPos)}>
            <i style={{ width: `${(trackPos / track.length) * 100}%` }} />
          </div>
          <div className="np-time">
            <span>{formatClock(trackPos)}</span>
            <span>{formatClock(track.length)}</span>
          </div>
        </section>

        <section className="live-drop lb-card" aria-label="Next drop">
          <p className="lb-label">Next drop</p>
          <div className="drop-count" aria-live="off">
            <span className="drop-num">{formatClock(nextIn)}</span>
            <span className="drop-name">{drop.name}</span>
          </div>
          <p className="drop-note">{drop.note}. The rep fires it, not the app.</p>
          <ul className="drop-queue">
            {upcoming.map((d) => (
              <li key={d.id}>
                <span>Then</span>
                <strong>{d.name}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="live-vote lb-card" aria-label="Crowd vote">
          <p className="lb-label">Crowd vote</p>
          <h2 className="vote-q">{LIVE.poll.question}</h2>
          <ul className="vote-list">
            {LIVE.poll.options.map((o, i) => {
              const n = votes[i] + (mine === i ? 1 : 0);
              const pct = Math.round((n / total) * 100);
              return (
                <li key={o.id}>
                  <button type="button" className={`vote-opt${mine === i ? " mine" : ""}`} onClick={() => vote(i)} aria-pressed={mine === i}>
                    <span className="vote-fill" style={{ width: `${pct}%` }} />
                    <span className="vote-label">{o.label}</span>
                    <span className="vote-pct">{pct}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="vote-foot">{mine === null ? "Tap to vote. This is a local demo, no one else sees it." : "Voted. Tap another option to change your mind."}</p>
        </section>

        <section className="live-feed lb-card" aria-label="Live moments">
          <p className="lb-label">Moments</p>
          <ul className="feed" aria-live="polite">
            {feed.map((f) => (
              <li key={f.id} className="feed-item">
                <span className="feed-dot" aria-hidden="true" />
                <p>{f.text}</p>
                <time>{f.ago}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
