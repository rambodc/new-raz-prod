import { Link } from "react-router-dom";
import CheckInButton from "../app/CheckInButton";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../auth/AuthProvider";
import { getArtists, listMyCheckIns, listMyNumbers, listTonight } from "../data/api";
import { isLiveNow, lineup, whenLabel } from "../data/shows";
import type { Artist, FanNumber, Show } from "../data/types";
import { useLoad } from "../lib/hooks";

type Data = { shows: Show[]; checkedIn: Set<string>; numbers: FanNumber[]; artists: Map<string, Artist> };

async function loadHome(uid: string): Promise<Data> {
  const [shows, checkedIn, numbers] = await Promise.all([listTonight(new Date()), listMyCheckIns(uid), listMyNumbers(uid)]);
  const artists = await getArtists(numbers.map((n) => n.artistId));
  return { shows, checkedIn, numbers, artists };
}

export default function Home() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const { data, loading, error, reload } = useLoad(() => loadHome(uid), uid);
  const now = new Date();

  return (
    <div className="home">
      <section aria-labelledby="tonight-title">
        <h1 id="tonight-title" className="lb-display">
          Tonight
        </h1>
        {loading && !data && <p className="muted">Loading…</p>}
        {error && !data && (
          <p className="muted">
            Couldn't load. <button type="button" className="link-btn" onClick={reload}>Try again</button>
          </p>
        )}
        {data && data.shows.length === 0 && <p className="muted">No shows today.</p>}
        <ul className="stack">
          {data?.shows.map((show) => {
            const done = data.checkedIn.has(show.id);
            const live = isLiveNow(show, now);
            return (
              <li key={show.id} className="lb-card show-card">
                <p className="show-when">{whenLabel(show, now)}</p>
                <h2 className="show-venue">{show.venue}</h2>
                <p className="show-lineup">{lineup(show)}</p>
                {done ? (
                  <p className="checked-line" role="status">
                    <span aria-hidden="true">✓</span> Checked in
                  </p>
                ) : live ? (
                  <CheckInButton showId={show.id} onChecked={reload} />
                ) : (
                  <button type="button" className="lb-btn lb-btn--big" disabled>
                    I'm here
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="numbers-title" className="numbers">
        <h2 id="numbers-title" className="lb-label">
          Your numbers
        </h2>
        {data && data.numbers.length === 0 && <p className="muted">Check in at a show to get your first number.</p>}
        <ul className="stack">
          {data?.numbers.map((n) => (
            <li key={n.artistId}>
              <Link to={`/artist/${n.artistId}`} className="lb-card num-row">
                <Avatar name={n.artistName} url={data.artists.get(n.artistId)?.imageUrl ?? null} />
                <span className="num-name">{n.artistName}</span>
                <strong className="num-count" aria-label={`${n.count} ${n.count === 1 ? "show" : "shows"}`}>
                  {n.count}
                </strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
