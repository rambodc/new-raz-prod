import type { MouseEvent } from "react";
import { loadHome, type Artist } from "./data";
import type { Profile } from "./profile";
import { artistHref } from "./slug";
import { Avatar, Boot, Chevron, Cover, Empty, Scene, TopBar, openLink, useLoad } from "./ui";

export function HomeScreen({
  uid,
  profile,
  photoVersion,
  onSettings,
  go,
}: {
  uid: string;
  profile: Profile;
  photoVersion: number;
  onSettings: () => void;
  go: (path: string) => void;
}) {
  const artist = profile.role === "artist";
  const { status, data, reload } = useLoad(`home:${uid}:${profile.role}`, () => loadHome(uid, profile.role));
  if (status === "loading") return <Boot />;
  if (status === "error" || !data) {
    return (
      <Scene variant="home">
        <TopBar
          onHome={() => go("/")}
          avatar={
            <button type="button" className="avatar-link" aria-label="Settings" onClick={onSettings}>
              <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
            </button>
          }
        />
        <div className="home-column">
          <div className="empty">
            <strong>Couldn't load artists</strong>
            <p>Check your connection and try again.</p>
            <button className="primary" type="button" onClick={reload}>
              Try again
            </button>
          </div>
        </div>
      </Scene>
    );
  }

  const home = data;
  function openMine(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(artistHref(home.artist ?? { id: uid, slug: "" }));
  }

  const artists = artist ? home.artists.filter((item) => item.id !== uid) : home.artists;

  return (
    <Scene variant="home">
      <TopBar
        onHome={() => go("/")}
        avatar={
          <button type="button" className="avatar-link" aria-label="Settings" onClick={onSettings}>
            <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
          </button>
        }
      />
      <div className={artist ? "home-column is-artist" : "home-column is-fan"}>
        <div className="hello">
          <div className="hello-avatar">
            <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
          </div>
          <div>
            <h1>Welcome, {profile.firstName}</h1>
            {artist ? <p>You're an artist</p> : null}
          </div>
        </div>
        {artist && home.artist ? (
          <section className="mine">
            <p>Your artist page</p>
            <a href={artistHref(home.artist)} onClick={openMine}>
              <Cover url={home.artist.imageURL} alt="" />
              <span className="mine-shade" />
              <span className="mine-name">{home.artist.name}</span>
              <Chevron />
            </a>
          </section>
        ) : null}
        <h2 className="section-label">Artists</h2>
        <ArtistGrid artists={artists} go={go} />
      </div>
    </Scene>
  );
}

function ArtistGrid({ artists, go }: { artists: Artist[]; go: (path: string) => void }) {
  if (artists.length === 0) return <Empty title="No artists yet" body="When an artist publishes a page, you'll see it here." />;
  return (
    <ul className="artist-grid">
      {artists.map((artist) => (
        <li key={artist.id}>
          <a className="artist-card" href={artistHref(artist)} onClick={(click) => openLink(click, go)}>
            <Cover url={artist.imageURL} alt="" />
            <span className="artist-card-shade" aria-hidden="true" />
            <span className="artist-card-name">{artist.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
