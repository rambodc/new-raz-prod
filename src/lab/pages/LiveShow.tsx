import { useEffect, useState } from "react";
import { formatClock } from "../hooks";
import { LIVE } from "../mock";
import "../styles/live.css";

export default function LiveShow() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const scene = LIVE.scenes[Math.floor(t / 9) % LIVE.scenes.length];
  const nextIn = LIVE.dropEverySec - (t % LIVE.dropEverySec);

  // One vote. Tap to choose; the other side drifts on its own.
  const [votes, setVotes] = useState(() => LIVE.options.map((o) => o.votes));
  const [mine, setMine] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setVotes((v) => v.map((n, i) => n + (Math.random() < (i === 1 ? 0.7 : 0.4) ? 1 : 0))), 2200);
    return () => window.clearInterval(id);
  }, []);
  const counts = votes.map((n, i) => n + (mine === i ? 1 : 0));
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="live-page">
      <h1 className="lb-display">
        Live <em>now.</em>
      </h1>

      <section className="screen" style={{ "--hue": scene.hue, "--hue2": scene.hue2 } as React.CSSProperties} aria-label="Venue screen">
        <span className="screen-layer l1" />
        <span className="screen-layer l2" />
        <span className="screen-layer l3" />
        <span className="screen-eq" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms`, animationDuration: `${620 + ((i * 53) % 420)}ms` }} />
          ))}
        </span>
        <div className="screen-center">
          <span className="screen-label">Next drop</span>
          <span className="screen-count">{formatClock(nextIn)}</span>
        </div>
      </section>

      <section className="vote lb-card" aria-label="Vote">
        <h2 className="vote-q">{LIVE.question}</h2>
        <ul className="vote-list">
          {LIVE.options.map((o, i) => {
            const pct = Math.round((counts[i] / total) * 100);
            return (
              <li key={o.id}>
                <button type="button" className={`vote-opt${mine === i ? " mine" : ""}`} onClick={() => setMine(i)} aria-pressed={mine === i}>
                  <span className="vote-fill" style={{ width: `${pct}%` }} />
                  <span className="vote-label">{o.label}</span>
                  <span className="vote-pct">{pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
