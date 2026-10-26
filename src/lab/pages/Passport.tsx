import { formatDay, PASSPORT } from "../mock";
import "../styles/passport.css";

export default function Passport() {
  const count = PASSPORT.stamps.length;
  return (
    <div className="pp-page">
      <header className="pp-head">
        <h1 className="lb-display">
          Your <em>passport.</em>
        </h1>
        <p className="pp-count">
          <strong>{count}</strong> nights
        </p>
      </header>
      <ul className="stamps">
        {PASSPORT.stamps.map((s, i) => (
          <li key={s.id} className="stamp" style={{ "--hue": s.hue, "--tilt": `${((i * 37) % 9) - 4}deg` } as React.CSSProperties}>
            <span className="stamp-ink" role="img" aria-label={`${s.show}, ${formatDay(s.date, { month: "long", day: "numeric", year: "numeric" })}`}>
              <b aria-hidden="true">{s.show.slice(0, 3).toUpperCase()}</b>
              <small aria-hidden="true">{formatDay(s.date, { month: "short", day: "numeric" })}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
