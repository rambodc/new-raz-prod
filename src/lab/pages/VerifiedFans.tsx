import { useEffect, useRef, useState } from "react";
import { useCountUp } from "../hooks";
import { ARTIST } from "../mock";
import "../styles/artist.css";

const PAD = { l: 34, r: 10, t: 14, b: 30 };

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

function AttendanceChart() {
  const [active, setActive] = useState<number | null>(null);
  const [box, width] = useWidth<HTMLDivElement>(640);
  const W = Math.max(280, Math.min(900, width));
  const H = W < 480 ? 220 : 260;
  const data = ARTIST.shows;
  const max = 350;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const step = iw / data.length;
  const bw = step * (W < 480 ? 0.62 : 0.56);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const cx = (i: number) => PAD.l + step * i + step / 2;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)} ${y(d.returning).toFixed(1)}`).join(" ");
  const area = `${line} L${cx(data.length - 1).toFixed(1)} ${y(0)} L${cx(0).toFixed(1)} ${y(0)} Z`;
  const a = active !== null ? data[active] : null;

  return (
    <div className="chart" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Verified fans per show for the last ten shows, with returning fans as a line. Both trend upward.">
        <defs>
          <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bar-1)" />
            <stop offset="1" stopColor="var(--bar-2)" />
          </linearGradient>
          <linearGradient id="areag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--line-c)" stopOpacity="0.38" />
            <stop offset="1" stopColor="var(--line-c)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 100, 200, 300].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={PAD.l - 8} y={y(t) + 4} className="axis" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.name} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0} aria-label={`${d.name}: ${d.verified} verified, ${d.returning} returning`}>
            <rect x={cx(i) - step / 2} y={PAD.t} width={step} height={ih} fill="transparent" />
            <rect x={cx(i) - bw / 2} y={y(d.verified)} width={bw} height={y(0) - y(d.verified)} rx={Math.min(8, bw / 2)} fill="url(#barg)" className={`bar${active === i ? " on" : ""}`} style={{ animationDelay: `${i * 60}ms` }} />
            <text x={cx(i)} y={H - 12} className="axis" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#areag)" />
        <path d={line} className="trend" fill="none" />
        {data.map((d, i) => (
          <circle key={d.name} cx={cx(i)} cy={y(d.returning)} r={active === i ? 5.5 : 3.5} className="dot" />
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {a ? (
          <>
            <strong>{a.name}</strong>
            <span>{a.verified} verified</span>
            <span>{a.returning} returning</span>
            <span>{Math.round(a.capacity * 100)}% of room</span>
          </>
        ) : (
          <span className="muted">Hover or tab through the bars. Bars: verified fans. Line: returning fans.</span>
        )}
      </div>
    </div>
  );
}

export default function VerifiedFans() {
  const verified = useCountUp(ARTIST.verified, 1600);
  const followers = useCountUp(ARTIST.followers, 1600);
  const ratio = ((ARTIST.verified / ARTIST.followers) * 100).toFixed(1);
  const maxHood = Math.max(...ARTIST.hoods.map((h) => h.pct));

  return (
    <div className="ar-page">
      <header className="lb-head">
        <p className="lb-eyebrow">
          Artist · {ARTIST.name} · {ARTIST.period}
        </p>
        <h1 className="lb-display">
          Fans who were <em>in the room.</em>
        </h1>
        <p className="lb-lede">Followers tell you who clicked. Verified fans tell you who showed up, who came back, and where they live.</p>
      </header>

      <section className="proof lb-card" aria-label="Verified fans versus followers">
        <div className="proof-main">
          <p className="lb-label">Verified fans</p>
          <p className="proof-num">{verified.toLocaleString("en-CA")}</p>
          <p className="proof-sub">Each one physically checked in at a Razzberry show</p>
        </div>
        <div className="proof-vs" aria-hidden="true">
          <span className="proof-orb big" />
          <span className="proof-orb small" style={{ "--s": Math.sqrt(ARTIST.verified / ARTIST.followers) } as React.CSSProperties} />
        </div>
        <div className="proof-side">
          <p className="lb-label">Followers</p>
          <p className="proof-num dim">{followers.toLocaleString("en-CA")}</p>
          <p className="proof-sub">Anyone can follow. Some are bots.</p>
          <p className="proof-ratio">
            <strong>{ratio}%</strong> of followers have been to a show
          </p>
        </div>
      </section>

      <section className="kpis" aria-label="Headline numbers">
        <div className="kpi lb-card">
          <p className="lb-label">Returning fans</p>
          <p className="kpi-num">{ARTIST.returningRate}%</p>
          <p className="kpi-delta up">+{ARTIST.returningDelta} pts vs previous 90 days</p>
          <div className="kpi-meter" aria-hidden="true">
            <i style={{ width: `${ARTIST.returningRate}%` }} />
          </div>
        </div>
        <div className="kpi lb-card">
          <p className="lb-label">Shows per fan</p>
          <p className="kpi-num">{ARTIST.avgShows}</p>
          <p className="kpi-delta">Across verified fans</p>
        </div>
        <div className="kpi lb-card">
          <p className="lb-label">New verified this month</p>
          <p className="kpi-num">{ARTIST.monthVerified}</p>
          <p className="kpi-delta up">+18% vs last month</p>
        </div>
      </section>

      <section className="lb-card panel" aria-labelledby="ar-att">
        <div className="lb-section-head">
          <h2 id="ar-att" className="lb-h2">
            Attendance over your last ten shows
          </h2>
          <span className="legend">
            <i className="lg-bar" /> Verified <i className="lg-line" /> Returning
          </span>
        </div>
        <AttendanceChart />
      </section>

      <div className="two">
        <section className="lb-card panel" aria-labelledby="ar-heat">
          <div className="lb-section-head">
            <h2 id="ar-heat" className="lb-h2">
              Where your fans live
            </h2>
            <span className="lb-count">Calgary heat</span>
          </div>
          <ul className="heat">
            {ARTIST.hoods.map((h) => (
              <li key={h.name} className="heat-tile" style={{ flexGrow: h.pct, flexBasis: `${h.pct * 4 + 70}px`, "--heat": h.pct / maxHood } as React.CSSProperties}>
                <strong>{h.pct}%</strong>
                <span>{h.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lb-card panel" aria-labelledby="ar-tiers">
          <div className="lb-section-head">
            <h2 id="ar-tiers" className="lb-h2">
              Fan loyalty
            </h2>
          </div>
          <div className="tierbar" role="img" aria-label={ARTIST.tiers.map((t) => `${t.name} ${t.pct} percent`).join(", ")}>
            {ARTIST.tiers.map((t) => (
              <i key={t.name} style={{ width: `${t.pct}%`, background: t.color }} />
            ))}
          </div>
          <ul className="tierlist">
            {ARTIST.tiers.map((t) => (
              <li key={t.name}>
                <span className="swatch" style={{ background: t.color }} />
                <span>{t.name}</span>
                <strong>{t.pct}%</strong>
                <em>{Math.round((ARTIST.verified * t.pct) / 100).toLocaleString("en-CA")} fans</em>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="lb-card panel" aria-labelledby="ar-shows">
        <div className="lb-section-head">
          <h2 id="ar-shows" className="lb-h2">
            Verified fans per show
          </h2>
        </div>
        <div className="table-wrap">
          <table className="shows-table">
            <thead>
              <tr>
                <th scope="col">Show</th>
                <th scope="col">Verified</th>
                <th scope="col" className="hide-sm">
                  Returning
                </th>
                <th scope="col">Room</th>
              </tr>
            </thead>
            <tbody>
              {[...ARTIST.shows].reverse().map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  <td>{s.verified}</td>
                  <td className="hide-sm">{s.returning}</td>
                  <td>
                    <span className="cap">
                      <i style={{ width: `${s.capacity * 100}%` }} />
                    </span>
                    <span className="cap-n">{Math.round(s.capacity * 100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="insight" aria-label="Suggested next move">
        <div className="insight-head">
          <span className="insight-badge">Razzberry AI · demo text</span>
          <span className="insight-conf">{ARTIST.insight.confidence}</span>
        </div>
        <h2>{ARTIST.insight.title}</h2>
        <p>{ARTIST.insight.body}</p>
        <p className="insight-foot">Written by hand for this preview. No model is called.</p>
      </section>
    </div>
  );
}
