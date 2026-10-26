import { useAuth } from "../../auth/AuthProvider";
import { greetingName } from "../../auth/validation";
import { formatDay, PASSPORT } from "../mock";
import "../styles/passport.css";

function BadgeShape({ shape }: { shape: string }) {
  const pts: Record<string, string> = {
    hex: "50,6 90,28 90,72 50,94 10,72 10,28",
    diamond: "50,4 94,50 50,96 6,50",
    tri: "50,8 94,86 6,86",
    star: "50,4 61,36 95,38 68,59 78,92 50,73 22,92 32,59 5,38 39,36",
  };
  return (
    <svg viewBox="0 0 100 100" className="badge-shape" aria-hidden="true">
      {shape === "ring" ? (
        <>
          <circle cx="50" cy="50" r="42" />
          <circle cx="50" cy="50" r="24" className="inner" />
        </>
      ) : (
        <polygon points={pts[shape] ?? pts.hex} />
      )}
    </svg>
  );
}

export default function Passport() {
  const { user } = useAuth();
  const name = user?.displayName?.trim() || greetingName(user?.displayName, user?.email);
  const earned = PASSPORT.badges.filter((b) => b.earned).length;

  return (
    <div className="pp-page">
      <header className="lb-head">
        <p className="lb-eyebrow">Fan · Passport</p>
        <h1 className="lb-display">
          Where you <em>actually were.</em>
        </h1>
        <p className="lb-lede">Every stamp below is a night a Razzberry rep verified you in the room. Likes can be faked. This can't.</p>
      </header>

      <section className="pp-id lb-card">
        <div className="pp-id-main">
          <span className="pp-avatar" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="pp-name">{name}</p>
            <p className="pp-level">
              Level {PASSPORT.levelNo} · {PASSPORT.level}
            </p>
          </div>
        </div>
        <dl className="pp-stats">
          {PASSPORT.stats.map((s) => (
            <div key={s.label}>
              <dd>{s.value}</dd>
              <dt>{s.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="pp-stamps">
        <div className="lb-section-head">
          <h2 id="pp-stamps" className="lb-h2">
            Stamps
          </h2>
          <span className="lb-count">
            {PASSPORT.stamps.length} collected · 1 waiting
          </span>
        </div>
        <ul className="stamps">
          {PASSPORT.stamps.map((s, i) => (
            <li key={s.id} className="stamp" style={{ "--hue": s.hue, "--tilt": `${((i * 37) % 9) - 4}deg` } as React.CSSProperties}>
              <div className="stamp-ink" aria-hidden="true">
                <span>{s.show.split(/[: ]/)[0].slice(0, 3).toUpperCase()}</span>
                <small>{formatDay(s.date, { month: "short", day: "numeric" })}</small>
              </div>
              <div className="stamp-text">
                <strong>{s.show}</strong>
                <span>
                  {s.venue} · {formatDay(s.date, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>
            </li>
          ))}
          <li className="stamp stamp--next">
            <div className="stamp-ink" aria-hidden="true">
              <span>?</span>
              <small>Nov 14</small>
            </div>
            <div className="stamp-text">
              <strong>Nightshift: Low Frequency</strong>
              <span>Your next stamp is one check-in away</span>
            </div>
          </li>
        </ul>
      </section>

      <section aria-labelledby="pp-badges">
        <div className="lb-section-head">
          <h2 id="pp-badges" className="lb-h2">
            Badges
          </h2>
          <span className="lb-count">
            {earned} of {PASSPORT.badges.length} earned
          </span>
        </div>
        <ul className="badges">
          {PASSPORT.badges.map((b) => (
            <li key={b.id} className={`badge-card lb-card${b.earned ? " earned" : " locked"}`}>
              <div className="badge-art">
                <BadgeShape shape={b.shape} />
                {!b.earned && (
                  <svg className="badge-lock" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                )}
              </div>
              <strong>{b.name}</strong>
              <span>{b.hint}</span>
              {!b.earned && (
                <span className="badge-progress" aria-label={`${Math.round(b.progress * 100)} percent`}>
                  <i style={{ width: `${b.progress * 100}%` }} />
                </span>
              )}
              <span className="sr-only">{b.earned ? "Earned" : "Locked"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pp-time">
        <div className="lb-section-head">
          <h2 id="pp-time" className="lb-h2">
            Timeline
          </h2>
        </div>
        <ol className="timeline">
          {PASSPORT.timeline.map((t) => (
            <li key={t.date + t.text}>
              <time>{formatDay(t.date, { month: "short", day: "numeric" })}</time>
              <div>
                <strong>{t.text}</strong>
                <span>{t.sub}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
