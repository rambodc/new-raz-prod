import type { MouseEvent, ReactNode } from "react";
import { loadHome, type Artist } from "./data";
import type { Profile } from "./profile";
import { artistHref } from "./slug";
import { ShareButton } from "./share";
import { Avatar, Cover, Empty, Scene, SignInButton, TopBar, openLink, useLoad } from "./ui";

export function HomeScreen({
  uid,
  profile,
  photoVersion,
  onSettings,
  onSignIn,
  go,
}: {
  uid: string;
  profile: Profile | null;
  photoVersion: number;
  onSettings?: () => void;
  onSignIn?: () => void;
  go: (path: string) => void;
}) {
  const { status, data, reload } = useLoad(profile ? `home:${uid}:${profile.role}` : "home:guest", () => loadHome(profile ? uid : "", profile?.role ?? "fan"));
  const account = profile && onSettings ? (
    <button type="button" className="avatar-link" aria-label="Settings" onClick={onSettings}>
      <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
    </button>
  ) : onSignIn ? (
    <SignInButton onClick={onSignIn} />
  ) : null;

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <div className="home-column">
        <p className="stage-empty">Loading artists…</p>
      </div>
    );
  } else if (status === "error" || !data) {
    body = (
      <div className="home-column">
        <div className="empty">
          <strong>Couldn't load artists</strong>
          <p>Check your connection and try again.</p>
          <button className="primary" type="button" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  } else {
    body = <HomeBody uid={uid} profile={profile} photoVersion={photoVersion} home={data} go={go} />;
  }

  return (
    <Scene variant="home">
      <TopBar onHome={() => go("/")} avatar={account} />
      {body}
    </Scene>
  );
}

function HomeBody({
  uid,
  profile,
  photoVersion,
  home,
  go,
}: {
  uid: string;
  profile: Profile | null;
  photoVersion: number;
  home: { artist: Artist | null; artists: Artist[] };
  go: (path: string) => void;
}) {
  const artist = profile?.role === "artist";
  function openMine(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!home.artist) return;
    go(artistHref(home.artist));
  }

  const artists = artist ? home.artists.filter((item) => item.id !== uid) : home.artists;

  return (
      <div className={artist ? "home-column is-artist" : "home-column is-fan"}>
        {profile ? (
        <div className="hello">
          <div className="hello-avatar">
            <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
          </div>
          <div>
            <h1>Welcome, {profile.firstName}</h1>
            {artist ? <p>You're an artist</p> : null}
          </div>
        </div>
        ) : null}
        {artist && home.artist ? (
          <section className="studio">
            <div className="studio-card">
              <a className="studio-cover" href={artistHref(home.artist)} onClick={openMine}>
                <Cover url={home.artist.imageURL} alt="" width={480} height={640} />
              </a>
              <div className="studio-copy">
                <p className="studio-kicker">Your page</p>
                <h2>{home.artist.name}</h2>
                <div className="studio-actions">
                  <a className="primary" href={artistHref(home.artist)} onClick={openMine}>
                    View page
                  </a>
                  <button type="button" className="secondary" onClick={() => go(`/artist/${home.artist?.id}/edit`)}>
                    Edit
                  </button>
                  <button type="button" className="secondary" onClick={() => go("/events/new")}>
                    New event
                  </button>
                  <ShareButton title={home.artist.name} text={home.artist.name} path={artistHref(home.artist)} label={`Share ${home.artist.name}`} />
                </div>
              </div>
            </div>
          </section>
        ) : null}
        <h2 className="section-label">Artists</h2>
        <ArtistGrid artists={artists} go={go} />
      </div>
  );
}

function ArtistGrid({ artists, go }: { artists: Artist[]; go: (path: string) => void }) {
  if (artists.length === 0) return <Empty title="No artists yet" body="When an artist publishes a page, you'll see it here." />;
  return (
    <ul className="artist-grid">
      {artists.map((artist) => (
        <li key={artist.id}>
          <a className="artist-card" href={artistHref(artist)} onClick={(click) => openLink(click, go)}>
            <Cover url={artist.imageURL} alt="" width={600} height={800} />
            <span className="artist-card-shade" aria-hidden="true" />
            <span className="artist-card-name">{artist.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
