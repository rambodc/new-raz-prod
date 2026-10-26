import { useState } from "react";
import { formatDay, GENRES, SHOWS, type Genre } from "../mock";
import "../styles/discover.css";

export default function Discover() {
  const [genre, setGenre] = useState<Genre | "All">("All");
  const shows = SHOWS.filter((s) => genre === "All" || s.genre === genre);

  return (
    <div className="dc-page">
      <h1 className="lb-display">
        Coming <em>up.</em>
      </h1>
      <div className="chips" role="group" aria-label="Filter by genre">
        {(["All", ...GENRES] as const).map((g) => (
          <button key={g} type="button" className={`chip${genre === g ? " on" : ""}`} aria-pressed={genre === g} onClick={() => setGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      <ul className="show-grid">
        {shows.map((s) => (
          <li key={s.id} className="show-card" style={{ "--hue": s.hue, "--hue2": s.hue2 } as React.CSSProperties}>
            <span className="show-glow" aria-hidden="true" />
            <span className="show-date">
              <b>{formatDay(s.date, { day: "numeric" })}</b>
              {formatDay(s.date, { month: "short" })}
            </span>
            <div className="show-body">
              <h2>{s.title}</h2>
              <p>{s.venue}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
