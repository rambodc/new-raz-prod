import { useState } from "react";
import { ARTISTS, formatDay, GENRES, SHOWS, type Genre } from "../mock";
import { useTilt } from "../hooks";
import "../styles/discover.css";

const art = (h1: number, h2: number) => ({ "--hue": h1, "--hue2": h2 }) as React.CSSProperties;

export default function Discover() {
  const [genre, setGenre] = useState<Genre | "All">("All");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const { ref } = useTilt<HTMLElement>(6);

  const featured = SHOWS[0];
  const shows = SHOWS.filter((s) => s.id !== featured.id && (genre === "All" || s.genres.includes(genre)));
  const artists = ARTISTS.filter((a) => genre === "All" || a.genres.includes(genre));
  const featuredMatches = genre === "All" || featured.genres.includes(genre);

  return (
    <div className="dc-page">
      <header className="lb-head">
        <p className="lb-eyebrow">Fan · Discover</p>
        <h1 className="lb-display">
          Find your <em>next night.</em>
        </h1>
        <p className="lb-lede">Razzberry runs these shows itself. Tickets are sold by each venue, so this is about what's worth your Saturday.</p>
      </header>

      {featuredMatches && (
        <article ref={ref} className="feat" style={art(featured.hue, featured.hue2)}>
          <div className="feat-art" aria-hidden="true">
            <span className="feat-sun" />
            <span className="feat-grid" />
            <span className="feat-title-ghost">{featured.series}</span>
          </div>
          <div className="feat-body">
            <span className="feat-tag">Featured · {formatDay(featured.date, { weekday: "long", month: "long", day: "numeric" })}</span>
            <h2>{featured.title}</h2>
            <p className="feat-lineup">{featured.lineup.join(" · ")}</p>
            <p className="feat-meta">
              {featured.venue}, {featured.hood} · doors {featured.doors}
            </p>
            <div className="feat-row">
              <span className="feat-going">
                <strong>{featured.going}</strong> verified fans going
              </span>
              <button type="button" className={`lb-btn${saved[featured.id] ? " lb-btn--ghost" : ""}`} aria-pressed={Boolean(saved[featured.id])} onClick={() => setSaved((s) => ({ ...s, [featured.id]: !s[featured.id] }))}>
                {saved[featured.id] ? "On your list" : "Add to my list"}
              </button>
            </div>
          </div>
        </article>
      )}

      <div className="chips" role="group" aria-label="Filter by genre">
        {(["All", ...GENRES] as const).map((g) => (
          <button key={g} type="button" className={`chip${genre === g ? " on" : ""}`} aria-pressed={genre === g} onClick={() => setGenre(g)}>
            {g}
          </button>
        ))}
      </div>

      <section aria-labelledby="dc-shows">
        <div className="lb-section-head">
          <h2 id="dc-shows" className="lb-h2">
            Upcoming shows
          </h2>
          <span className="lb-count">{shows.length + (featuredMatches ? 1 : 0)} nights</span>
        </div>
        {shows.length === 0 && !featuredMatches ? (
          <p className="dc-empty lb-card">Nothing in {genre} yet. Try another genre.</p>
        ) : (
          <ul className="show-grid">
            {shows.map((s) => (
              <li key={s.id} className="show-card lb-card" style={art(s.hue, s.hue2)}>
                <div className="show-art" aria-hidden="true">
                  <span className="show-date">
                    <b>{formatDay(s.date, { day: "numeric" })}</b>
                    {formatDay(s.date, { month: "short" })}
                  </span>
                  <span className="show-glow" />
                </div>
                <div className="show-body">
                  <div className="show-tags">
                    {s.genres.map((g) => (
                      <span key={g}>{g}</span>
                    ))}
                  </div>
                  <h3>{s.title}</h3>
                  <p className="show-lineup">{s.lineup.slice(0, 3).join(", ")}</p>
                  <p className="show-meta">
                    {s.venue} · {s.hood}
                  </p>
                  <div className="show-foot">
                    <span>
                      <strong>{s.going}</strong> going
                    </span>
                    <button type="button" className="link-btn" aria-pressed={Boolean(saved[s.id])} onClick={() => setSaved((v) => ({ ...v, [s.id]: !v[s.id] }))}>
                      {saved[s.id] ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dc-artists">
        <div className="lb-section-head">
          <h2 id="dc-artists" className="lb-h2">
            Artists
          </h2>
          <span className="lb-count">{artists.length} playing soon</span>
        </div>
        <ul className="artist-row">
          {artists.map((a) => (
            <li key={a.id} className="artist lb-card" style={art(a.hue, a.hue2)}>
              <span className="artist-avatar" aria-hidden="true">
                {a.name
                  .split(/[ &]+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <strong>{a.name}</strong>
              <span className="artist-genre">{a.genres.join(" · ")}</span>
              <span className="artist-ver">{a.verified.toLocaleString("en-CA")} verified fans</span>
              <button type="button" className={`lb-btn lb-btn--sm${following[a.id] ? " lb-btn--ghost" : ""}`} aria-pressed={Boolean(following[a.id])} onClick={() => setFollowing((v) => ({ ...v, [a.id]: !v[a.id] }))}>
                {following[a.id] ? "Following" : "Follow"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
