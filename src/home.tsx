import type { MouseEvent } from "react";
import { loadHome } from "./data";
import type { Profile } from "./profile";
import { Avatar, Boot, Chevron, Cover, EventList, Scene, TopBar, useLoad } from "./ui";

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
          avatar={
            <button type="button" className="avatar-link" aria-label="Settings" onClick={onSettings}>
              <Avatar name={profile.firstName} url={profile.photoURL} version={photoVersion} alt="" />
            </button>
          }
        />
        <div className="home-column">
          <div className="empty">
            <strong>Couldn't load events</strong>
            <p>Check your connection and try again.</p>
            <button className="primary" type="button" onClick={reload}>
              Try again
            </button>
          </div>
        </div>
      </Scene>
    );
  }

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(`/artist/${uid}`);
  }

  return (
    <Scene variant="home">
      <TopBar
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
        {artist && data.artist ? (
          <section className="mine">
            <p>Your artist page</p>
            <a href={`/artist/${uid}`} onClick={open}>
              <Cover url={data.artist.imageURL} alt="" />
              <span className="mine-shade" />
              <span className="mine-name">{data.artist.name}</span>
              <Chevron />
            </a>
          </section>
        ) : null}
        <h2 className="section-label">Events</h2>
        <EventList
          events={data.events}
          go={go}
          emptyTitle="Nothing coming up"
          emptyBody="When an artist publishes a night, you'll see it here."
        />
      </div>
    </Scene>
  );
}
