import { Link, useParams } from "react-router-dom";
import { getArtist, listPastShows } from "../data/api";
import { formatDay } from "../data/shows";
import type { Artist, Show } from "../data/types";
import { useLoad } from "../lib/hooks";

async function loadArtist(id: string): Promise<{ artist: Artist | null; shows: Show[] }> {
  const [artist, shows] = await Promise.all([getArtist(id), listPastShows(id, new Date())]);
  return { artist, shows };
}

export default function ArtistPage() {
  const { id = "" } = useParams();
  const { data, loading, error } = useLoad(() => loadArtist(id), id);

  return (
    <div className="artist">
      <Link to="/" className="back-link">
        ← Back
      </Link>
      {loading && !data && <p className="muted">Loading…</p>}
      {error && !data && <p className="muted">Couldn't load this artist.</p>}
      {data && !data.artist && <p className="muted">That artist isn't here.</p>}
      {data?.artist && (
        <>
          {data.artist.imageUrl ? (
            <img className="artist-image" src={data.artist.imageUrl} alt={data.artist.name} />
          ) : (
            <div className="artist-image artist-image--blank" aria-hidden="true">
              {data.artist.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="lb-display artist-name">{data.artist.name}</h1>
          <p className="artist-fans">
            <strong>{data.artist.fanCount}</strong> {data.artist.fanCount === 1 ? "fan" : "fans"}
          </p>
          <h2 className="lb-label">Past shows</h2>
          {data.shows.length === 0 && <p className="muted">No past shows yet.</p>}
          <ul className="stack">
            {data.shows.map((s) => (
              <li key={s.id} className="lb-card past-row">
                <span>{s.venue}</span>
                <span className="muted">{formatDay(s.startsAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
