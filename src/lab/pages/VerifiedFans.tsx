import { useEffect, useRef, useState } from "react";
import { useCountUp } from "../hooks";
import { ARTIST } from "../mock";
import "../styles/artist.css";

/** Width of an element in px, kept in sync with its size (falls back to `initial` where ResizeObserver is missing). */
function useWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width) || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w] as const;
}

function ShowsChart() {
  const [active, setActive] = useState<number | null>(null);
  const [box, width] = useWidth<HTMLDivElement>(640);
  const W = Math.max(260, Math.min(900, width));
  const H = W < 480 ? 180 : 230;
  const data = ARTIST.shows;
  const max = 350;
  const step = W / data.length;
  const bw = step * 0.6;
  const y = (v: number) => H - 6 - (v / max) * (H - 12);

  return (
    <div className="chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Verified fans at each of the last ten shows, rising from 168 to 312.">
        <defs>
          <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bar-1)" />
            <stop offset="1" stopColor="var(--bar-2)" />
          </linearGradient>
        </defs>
        {data.map((v, i) => (
          <rect
            key={i}
            x={step * i + (step - bw) / 2}
            y={y(v)}
            width={bw}
            height={y(0) - y(v)}
            rx={Math.min(8, bw / 2)}
            fill="url(#barg)"
            className={`bar${active === i ? " on" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
            tabIndex={0}
            aria-label={`Show ${i + 1}: ${v} verified fans`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      <p className="chart-readout" aria-live="polite">
        {active !== null ? `${data[active]} verified fans` : "Last 10 shows"}
      </p>
    </div>
  );
}

export default function VerifiedFans() {
  const verified = useCountUp(ARTIST.verified, 1600);
  const followers = useCountUp(ARTIST.followers, 1600);
  return (
    <div className="ar-page">
      <h1 className="lb-display">
        Your <em>fans.</em>
      </h1>
      <section className="proof lb-card" aria-label="Verified fans compared with followers">
        <div className="proof-main">
          <p className="proof-num">{verified.toLocaleString("en-CA")}</p>
          <p className="proof-cap">were in the room</p>
        </div>
        <div className="proof-side">
          <p className="proof-num dim">{followers.toLocaleString("en-CA")}</p>
          <p className="proof-cap">followers</p>
        </div>
      </section>
      <section className="lb-card panel" aria-label="Verified fans per show">
        <ShowsChart />
      </section>
    </div>
  );
}
