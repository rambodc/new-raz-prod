import { useEffect, useRef, useState, type FormEvent } from "react";
import { deleteEvent, loadEventPage, publishEvent, saveEvent, type EventItem } from "./data";
import { cleanBlock, cleanLine, combineLocal, dateInputValue, formatClock, formatDay, formatWhen, timeInputValue, validBlock, validLine } from "./format";
import type { Profile } from "./profile";
import { explain } from "./services";
import { Avatar, Boot, Chevron, Cover, Empty, openLink, Page, TextArea, Field, useLoad } from "./ui";

export function EventScreen({
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
  const { status, data, reload } = useLoad(`event:${id}`, () => loadEventPage(id));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status === "loading" || busy) return <Boot />;
  if (status === "error" || !data) {
    return (
      <Page back={back} tone="event">
        <Empty title="Couldn't load this event" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={reload}>
          Try again
        </button>
      </Page>
    );
  }
  if (!data.event) {
    return (
      <Page back={back} tone="event">
        <Empty title="This event isn't here" body="It may have been removed." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }

  const event = data.event;
  const owner = profile.role === "artist" && uid === event.artistId;

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteEvent(event.id);
      go("/");
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <Page back={back} tone="event">
      <article>
        <div className="event-hero">
          <Cover url={event.imageURL} alt="" />
        </div>
        <h1 className="event-name">{event.title}</h1>
        {data.artist ? (
          <a className="artist-chip" href={`/artist/${data.artist.id}`} onClick={(click) => openLink(click, go)}>
            <span className="chip-avatar">
              <Avatar name={data.artist.name} url={data.artist.imageURL} version={0} alt="" />
            </span>
            <span>{data.artist.name}</span>
            <Chevron />
          </a>
        ) : null}
        <p className="event-meta">{formatWhen(event.startsAt, "detail")}</p>
        <p className="event-place">
          {event.venue}, {event.city}
        </p>
        {event.description ? <p className="blurb">{event.description}</p> : null}
        {owner ? (
          <div className="owner-actions">
            <button className="ghost" type="button" onClick={() => go(`/event/${event.id}/edit`)}>
              Edit event
            </button>
            <button className="ghost danger" type="button" onClick={() => void remove()}>
              {confirming ? "Delete this event" : "Delete event"}
            </button>
            {confirming ? (
              <button className="text-button" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </article>
    </Page>
  );
}

export function EventEditScreen({
  id,
  uid,
  profile,
  go,
  replace,
  back,
}: {
  id: string | null;
  uid: string;
  profile: Profile;
  go: (path: string) => void;
  replace: (path: string) => void;
  back: () => void;
}) {
  const creating = id === null;
  const { status, data, reload } = useLoad(creating ? "event-new" : `event-edit:${id}`, () => (creating ? Promise.resolve({ event: null, artist: null }) : loadEventPage(id)));
  if (!creating && status === "loading") return <Boot />;
  if (!creating && (status === "error" || !data)) {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="Couldn't load this event" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={reload}>
          Try again
        </button>
      </Page>
    );
  }
  if (profile.role !== "artist") {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="Artists publish events" body="This account can't create or edit an event." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }
  if (!creating && data && !data.event) {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="This event isn't here" body="It may have been removed." />
        <button className="primary" type="button" onClick={() => go("/")}>
          Back home
        </button>
      </Page>
    );
  }
  if (!creating && data?.event && data.event.artistId !== uid) {
    return (
      <Page back={back} tone="form" narrow>
        <Empty title="You can only edit your own events" body="This night belongs to another artist." />
        <button className="primary" type="button" onClick={() => go(`/event/${id}`)}>
          Back
        </button>
      </Page>
    );
  }
  return (
    <EventForm
      event={creating ? null : data?.event ?? null}
      onCancel={back}
      onSaved={(nextId) => replace(`/event/${nextId}`)}
      uid={uid}
    />
  );
}

function EventForm({
  uid,
  event,
  onCancel,
  onSaved,
}: {
  uid: string;
  event: EventItem | null;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? dateInputValue(event.startsAt) : "");
  const [time, setTime] = useState(event ? timeInputValue(event.startsAt) : "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(event?.imageURL ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const creating = event === null;

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(submit: FormEvent) {
    submit.preventDefault();
    const nextTitle = cleanLine(title);
    const nextVenue = cleanLine(venue);
    const nextCity = cleanLine(city);
    const nextDescription = cleanBlock(description);
    const startsAt = combineLocal(date, time);
    if (!file && !event?.imageURL) {
      setError("Add a photo of the event.");
      return;
    }
    if (!validLine(nextTitle, 120) || !validLine(nextVenue, 120) || !validLine(nextCity, 80) || !validBlock(nextDescription, 2000)) {
      setError("Fill in the title, venue, city and description.");
      return;
    }
    if (!startsAt) {
      setError("Choose a date and time.");
      return;
    }
    if (creating && startsAt.getTime() < Date.now() - 60_000) {
      setError("Choose a future date and time.");
      return;
    }
    setBusy(true);
    setError("");
    const input = { title: nextTitle, startsAt, venue: nextVenue, city: nextCity, description: nextDescription, imageURL: event?.imageURL ?? "" };
    try {
      const id = creating ? await publishEvent(uid, input, file as File) : await saveReturning(event.id, input, file);
      onSaved(id);
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  const selectedDay = date ? combineLocal(date, "00:00") : null;
  const selectedTime = time ? combineLocal("2026-01-05", time) : null;

  return (
    <Page back={onCancel} tone="form" narrow>
      <h1 className="screen-title">{creating ? "Create event" : "Edit event"}</h1>
      <form onSubmit={onSubmit}>
        <div className="cover-card">
          {preview ? <img src={preview} alt="" /> : <span className="cover-fallback">Add a photo</span>}
          <button type="button" className="change-photo" onClick={() => inputRef.current?.click()} disabled={busy}>
            Change photo
          </button>
          <input
            ref={inputRef}
            className="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            onChange={(change) => setFile(change.target.files?.[0] ?? null)}
          />
        </div>
        <div className="form-card">
          <Field label="Title" value={title} maxLength={120} disabled={busy} onChange={(change) => setTitle(change.target.value)} />
          <div className="split">
            <label className="field">
              <span>Date</span>
              <span className="picker">
                <span className={date ? "picker-value" : "picker-value is-empty"}>{selectedDay ? formatDay(selectedDay) : "Select date"}</span>
                <input type="date" value={date} disabled={busy} onChange={(change) => setDate(change.target.value)} />
              </span>
            </label>
            <label className="field">
              <span>Time</span>
              <span className="picker">
                <span className={time ? "picker-value" : "picker-value is-empty"}>{selectedTime ? formatClock(selectedTime, "always") : "Select time"}</span>
                <input type="time" value={time} disabled={busy} onChange={(change) => setTime(change.target.value)} />
              </span>
            </label>
          </div>
          <Field label="Venue" value={venue} maxLength={120} disabled={busy} onChange={(change) => setVenue(change.target.value)} />
          <Field label="City" value={city} maxLength={80} disabled={busy} onChange={(change) => setCity(change.target.value)} />
          <TextArea label="Description" value={description} maxLength={2000} rows={4} disabled={busy} onChange={(change) => setDescription(change.target.value)} />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : creating ? "Publish event" : "Save event"}
        </button>
      </form>
    </Page>
  );
}

async function saveReturning(id: string, input: Parameters<typeof saveEvent>[1], file: File | null): Promise<string> {
  await saveEvent(id, input, file);
  return id;
}
