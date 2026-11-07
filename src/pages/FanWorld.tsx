import { useState } from "react";
import { Link } from "react-router-dom";
import CheckInButton from "../app/CheckInButton";
import { useIsAdmin } from "../app/useIsAdmin";
import { useAuth } from "../auth/AuthProvider";
import { greetingName } from "../auth/validation";
import { ThemeToggle } from "../components/Layout";
import { RaspberryMark, Wordmark } from "../components/RaspberryMark";
import { getArtists, listMyCheckIns, listMyNumbers, listTonight } from "../data/api";
import { isLiveNow, whenLabel } from "../data/shows";
import type { Artist, FanNumber, Show } from "../data/types";
import { useLoad } from "../lib/hooks";
import { fanNote, THEMES, weekdayName } from "../world/theme";
import WorldStage, { Anchored, PortalButton, WorldHeader } from "../world/WorldStage";

type FanData = { shows: Show[]; checkedIn: Set<string>; numbers: FanNumber[]; artists: Map<string, Artist> };

async function loadFan(uid: string): Promise<FanData> {
  const [shows, checkedIn, numbers] = await Promise.all([listTonight(new Date()), listMyCheckIns(uid), listMyNumbers(uid)]);
  const ids = [...new Set([...numbers.map((n) => n.artistId), ...shows.flatMap((s) => s.artistIds)])];
  const artists = await getArtists(ids);
  return { shows, checkedIn, numbers, artists };
}

/** Signed-in room. Labels come from the fan's real shows. Check-in still uses the existing location flow. */
export default function FanWorld() {
  const { user } = useAuth();
  const { admin } = useIsAdmin();
  const uid = user?.uid ?? "";
  const name = greetingName(user?.displayName, user?.email);
  const { data, loading, error, reload } = useLoad(() => loadFan(uid), uid);
  const [index, setIndex] = useState(0);
  const [inside, setInside] = useState(false);
  const shows = data?.shows ?? [];
  const show = shows.length > 0 ? shows[Math.min(index, shows.length - 1)]! : null;
  const artistId = show?.artistIds[0] ?? data?.numbers[0]?.artistId ?? null;
  const artistName = show?.artistNames[0] || data?.numbers.find((n) => n.artistId === artistId)?.artistName || data?.numbers[0]?.artistName || null;
  const title = artistName ?? "Your world";
  const yours = artistId ? (data?.numbers.find((n) => n.artistId === artistId)?.count ?? null) : null;
  const fans = artistId && data?.artists.has(artistId) ? (data.artists.get(artistId)?.fanCount ?? null) : null;
  const note = fanNote(yours, fans);
  const live = show ? isLiveNow(show, new Date()) : false;
  const checked = show ? (data?.checkedIn.has(show.id) ?? false) : false;
  const short = title.length <= 12;

  return (
    <WorldStage
      stage={inside && show ? "event" : "artist"}
      theme={THEMES.raspberry}
      portalStyle={show ? "live" : "quiet"}
      description={show ? `3D world for ${title}. Tonight: ${show.venue}.` : `3D world for ${title}. No show today.`}
    >
      <WorldHeader
        start={
          inside && show ? (
            <button type="button" className="world-back" onClick={() => setInside(false)}>
              ← Back
            </button>
          ) : (
            <Link to="/" className="brand" aria-label="Razzberry home">
              <RaspberryMark className="brand-mark" />
              <Wordmark className="brand-word" />
            </Link>
          )
        }
        end={
          <>
            <Link to="/numbers" className="world-text-link">
              Numbers
            </Link>
            {admin && (
              <Link to="/admin" className="world-text-link">
                Admin
              </Link>
            )}
            <ThemeToggle />
            <Link to="/welcome" className="world-account" aria-label={`Account: ${name}`}>
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        {loading && !data ? "Loading your shows." : error && !data ? "Couldn't load your shows." : show ? `${title}. ${show.venue}.` : "No show today."}
      </p>
      {inside && show ? (
        <div className="world-banner">
          <h1>
            {title} / {weekdayName(show.startsAt)}
          </h1>
          <p>
            {show.venue} · {whenLabel(show, new Date())}
          </p>
        </div>
      ) : (
        <Anchored name="sign" className="world-sign-block">
          <h1 className={`world-sign${short ? " is-short" : ""}`}>{title}</h1>
          {note && <p className="world-sign-note">{note}</p>}
          {!show && !loading && <p className="world-sign-note">No show today.</p>}
        </Anchored>
      )}
      {show && !inside && (
        <>
          <Anchored name="portalLabel" className="world-portal-label">
            <p className="world-kicker">{weekdayName(show.startsAt)}</p>
            <p className="world-detail">
              {show.venue} · {whenLabel(show, new Date())}
            </p>
            {shows.length > 1 && (
              <button
                type="button"
                className="world-text-btn"
                onClick={() => setIndex((n) => (n + 1) % shows.length)}
              >
                Next show
              </button>
            )}
          </Anchored>
          <PortalButton label={`Enter ${show.venue}`} onClick={() => setInside(true)} />
        </>
      )}
      {inside && show && (
        <Anchored name="here" className="world-here">
          {checked ? (
            <p className="world-here-status" role="status">
              Checked in
            </p>
          ) : live ? (
            <CheckInButton showId={show.id} onChecked={reload} />
          ) : (
            <button type="button" className="world-here-btn" disabled>
              I'm here
            </button>
          )}
        </Anchored>
      )}
      {error && !data && (
        <p className="world-gl-note" role="alert">
          Couldn't load your shows.{" "}
          <button type="button" className="world-text-btn" onClick={reload}>
            Try again
          </button>
        </p>
      )}
    </WorldStage>
  );
}
