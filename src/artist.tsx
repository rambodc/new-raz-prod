import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadArtistPage, saveArtist, type Artist } from "./data";
import { cleanBlock, cleanLine, validBlock, validLine } from "./format";
import type { Profile } from "./profile";
import { explain } from "./services";
import { Boot, Cover, Empty, EventList, Field, Page, TextArea, useLoad } from "./ui";

export function ArtistScreen({
  id,
  uid,
  profile,
  go,
  back,
}: {
  id: string;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  back: () => void;
}) {
  const { status, data, reload } = useLoad(`artist:${id}`, () => loadArtistPage(id));
  if (status === "loading") return <Boot />;
  if (status === "error" || !data) {
    return (
      <Page back={back}>
        <Empty title="Couldn't load this page" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={reload}>
          Try again
        </button>
      </Page>
    );
  }
  if (!data.artist) {
    return (
      <Page back={back}>
        <Empty title="This artist page isn't here" body="It may have been removed." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }

  const owner = profile.role === "artist" && uid === data.artist.id && uid === data.artist.ownerUid;

  return (
    <Page back={back}>
      <article className="artist-hero">
        <Cover url={data.artist.imageURL} alt="" />
        <div className="artist-copy">
          <h1>{data.artist.name}</h1>
          {data.artist.bio ? <p className="artist-bio">{data.artist.bio}</p> : null}
        </div>
      </article>
      {owner ? (
        <div className="action-row">
          <button className="primary" type="button" onClick={() => go("/events/new")}>
            Create event
          </button>
          <button className="ghost" type="button" onClick={() => go(`/artist/${id}/edit`)}>
            Edit page
          </button>
        </div>
      ) : null}
      <h2 className="section-label">Upcoming events</h2>
      <EventList
        events={data.events}
        go={go}
        emptyTitle="No upcoming events"
        emptyBody={owner ? "Publish a night and it will show up here." : "Nothing is scheduled yet."}
      />
    </Page>
  );
}

export function ArtistEditScreen({
  id,
  uid,
  profile,
  go,
  back,
}: {
  id: string;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  back: () => void;
}) {
  const { status, data, reload } = useLoad(`artist-edit:${id}`, () => loadArtistPage(id));
  if (status === "loading") return <Boot />;
  if (status === "error" || !data) {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="Couldn't load this page" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={reload}>
          Try again
        </button>
      </Page>
    );
  }
  const owner = data.artist && profile.role === "artist" && uid === data.artist.id && uid === data.artist.ownerUid;
  if (!owner || !data.artist) {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="You can only edit your own page" body="This page belongs to another artist." />
        <button className="primary" type="button" onClick={() => go(data.artist ? `/artist/${id}` : "/")}>
          Back
        </button>
      </Page>
    );
  }
  return <ArtistForm artist={data.artist} onCancel={back} onSaved={() => go(`/artist/${id}`)} />;
}

function ArtistForm({ artist, onCancel, onSaved }: { artist: Artist; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(artist.name);
  const [bio, setBio] = useState(artist.bio);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(artist.imageURL);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextName = cleanLine(name);
    const nextBio = cleanBlock(bio);
    if (!validLine(nextName, 80)) {
      setError("Enter a name up to 80 characters.");
      return;
    }
    if (!validBlock(nextBio, 600, true)) {
      setError("Keep the bio under 600 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveArtist(artist.id, { name: nextName, bio: nextBio, imageURL: artist.imageURL }, file);
      onSaved();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <Page back={onCancel} tone="form" narrow>
      <h1 className="screen-title">Edit page</h1>
      <form onSubmit={onSubmit}>
        <div className="cover-card">
          {preview ? <img src={preview} alt="" /> : <Cover url="" alt="" />}
          <button type="button" className="change-photo" onClick={() => inputRef.current?.click()} disabled={busy}>
            Change photo
          </button>
          <input
            ref={inputRef}
            className="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="form-card">
          <Field label="Name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
          <TextArea label="Bio" value={bio} maxLength={600} rows={4} disabled={busy} onChange={(event) => setBio(event.target.value)} />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Page>
  );
}
