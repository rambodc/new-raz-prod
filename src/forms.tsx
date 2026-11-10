import { useEffect, useRef, useState, type FormEvent } from "react";
import { readAudioDuration } from "./audio";
import { publishEvent, publishTrack, saveArtist, saveEvent, type Artist, type EventItem } from "./data";
import { cleanBlock, cleanLine, cleanTicketUrl, combineLocal, dateInputValue, formatClock, formatDay, formatDuration, timeInputValue, validBlock, validLine, validTicketUrl } from "./format";
import { PHOTO_QUALITY_HINT, assertPhotoQuality } from "./resizeImage";
import { explain } from "./services";
import { Field, TextArea } from "./ui";

function PhotoField({ preview, empty, busy, hint, onFile }: { preview: string; empty: string; busy: boolean; hint?: string; onFile: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="stage-photo-field">
        {preview ? <img src={preview} alt="" /> : <span className="stage-photo-empty">{empty}</span>}
        <button type="button" className="change-photo" onClick={() => inputRef.current?.click()} disabled={busy}>
          {preview ? "Change photo" : "Add photo"}
        </button>
        <input
          ref={inputRef}
          className="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          onChange={(change) => {
            onFile(change.target.files?.[0] ?? null);
            change.target.value = "";
          }}
        />
      </div>
      {hint ? <p className="photo-hint">{hint}</p> : null}
    </div>
  );
}

async function acceptPhoto(file: File | null, minShortEdge: number): Promise<File | null> {
  if (!file) return null;
  await assertPhotoQuality(file, minShortEdge);
  return file;
}

export function ArtistForm({ artist, onClose, onSaved }: { artist: Artist; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(artist.name);
  const [bio, setBio] = useState(artist.bio);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(artist.imageURL);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(submit: FormEvent) {
    submit.preventDefault();
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
      await onSaved();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <form className="stage-form" onSubmit={onSubmit}>
      <div className="stage-form-head">
        <h2>Edit page</h2>
        <button type="button" className="stage-text" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <PhotoField
        preview={preview}
        empty="Add a photo"
        busy={busy}
        hint={PHOTO_QUALITY_HINT}
        onFile={(next) => {
          void acceptPhoto(next, 1200)
            .then((picked) => {
              setError("");
              setFile(picked);
              if (!picked) setPreview(artist.imageURL);
            })
            .catch((caught: unknown) => {
              setFile(null);
              setPreview(artist.imageURL);
              setError(explain(caught));
            });
        }}
      />
      <div className="stage-fields">
        <Field label="Name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
        <TextArea label="Bio" value={bio} maxLength={600} rows={4} disabled={busy} onChange={(event) => setBio(event.target.value)} />
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function EventForm({
  uid,
  event,
  onClose,
  onSaved,
}: {
  uid: string;
  event: EventItem | null;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const creating = event === null;
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? dateInputValue(event.startsAt) : "");
  const [time, setTime] = useState(event ? timeInputValue(event.startsAt) : "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [ticketUrl, setTicketUrl] = useState(event?.ticketUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(event?.imageURL ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    const nextTicket = cleanTicketUrl(ticketUrl);
    const startsAt = combineLocal(date, time);
    if (!file && !event?.imageURL) {
      setError("Add a photo of the event.");
      return;
    }
    if (!validLine(nextTitle, 120) || !validLine(nextVenue, 120) || !validLine(nextCity, 80) || !validBlock(nextDescription, 2000)) {
      setError("Fill in the title, venue, city and description.");
      return;
    }
    if (!validTicketUrl(nextTicket)) {
      setError("Ticket link must start with http:// or https://.");
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
    const input = {
      title: nextTitle,
      startsAt,
      venue: nextVenue,
      city: nextCity,
      description: nextDescription,
      imageURL: event?.imageURL ?? "",
      ticketUrl: nextTicket,
    };
    try {
      const id = creating ? await publishEvent(uid, input, file as File) : await saveReturning(event.id, input, file);
      await onSaved(id);
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  const selectedDay = date ? combineLocal(date, "00:00") : null;
  const selectedTime = time ? combineLocal("2026-01-05", time) : null;

  return (
    <form className="stage-form" onSubmit={onSubmit}>
      <div className="stage-form-head">
        <h3>{creating ? "Create event" : "Edit event"}</h3>
        <button type="button" className="stage-text" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <PhotoField
        preview={preview}
        empty="Add a photo"
        busy={busy}
        hint={PHOTO_QUALITY_HINT}
        onFile={(next) => {
          void acceptPhoto(next, 1200)
            .then((picked) => {
              setError("");
              setFile(picked);
              if (!picked) setPreview(event?.imageURL ?? "");
            })
            .catch((caught: unknown) => {
              setFile(null);
              setPreview(event?.imageURL ?? "");
              setError(explain(caught));
            });
        }}
      />
      <div className="stage-fields">
        <Field label="Title" value={title} maxLength={120} disabled={busy} autoComplete="off" onChange={(change) => setTitle(change.target.value)} />
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
        <Field label="Venue" value={venue} maxLength={120} disabled={busy} autoComplete="off" onChange={(change) => setVenue(change.target.value)} />
        <Field label="City" value={city} maxLength={80} disabled={busy} autoComplete="off" onChange={(change) => setCity(change.target.value)} />
        <TextArea label="Description" value={description} maxLength={2000} rows={4} disabled={busy} onChange={(change) => setDescription(change.target.value)} />
        <Field
          label="Ticket link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://"
          value={ticketUrl}
          maxLength={2048}
          disabled={busy}
          onChange={(change) => setTicketUrl(change.target.value)}
        />
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Saving…" : creating ? "Publish event" : "Save event"}
      </button>
    </form>
  );
}

async function saveReturning(id: string, input: Parameters<typeof saveEvent>[1], file: File | null): Promise<string> {
  await saveEvent(id, input, file);
  return id;
}

export function TrackForm({ artistId, order, onClose, onSaved }: { artistId: string; order: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cover) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function chooseAudio(file: File | null) {
    setAudio(file);
    setDuration(null);
    setError("");
    if (!file) return;
    if (!title.trim()) setTitle(cleanLine(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")));
    setReading(true);
    try {
      setDuration(await readAudioDuration(file));
    } catch (caught) {
      setError(explain(caught));
      setAudio(null);
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(submit: FormEvent) {
    submit.preventDefault();
    const nextTitle = cleanLine(title);
    if (!audio || duration === null) {
      setError("Choose an audio file.");
      return;
    }
    if (!validLine(nextTitle, 120)) {
      setError("Enter a title up to 120 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await publishTrack(artistId, { title: nextTitle, duration, order }, audio, cover);
      await onSaved();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <form className="stage-form" onSubmit={onSubmit}>
      <div className="stage-form-head">
        <h3>Add track</h3>
        <button type="button" className="stage-text" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <p className="stage-hint">MP3, M4A, AAC or WAV, up to 30 MB. The cover is optional.</p>
      <div className="stage-fields">
        <Field label="Title" value={title} maxLength={120} disabled={busy} autoComplete="off" onChange={(change) => setTitle(change.target.value)} />
        <div className="stage-file-row">
          <button type="button" className="stage-quiet" onClick={() => audioRef.current?.click()} disabled={busy || reading}>
            {audio ? "Change audio" : "Choose audio"}
          </button>
          <span>{reading ? "Reading length…" : audio ? `${audio.name} · ${duration ? formatDuration(duration) : ""}` : "No file yet"}</span>
          <input
            ref={audioRef}
            className="file"
            type="file"
            accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-m4a,audio/x-wav,.mp3,.m4a,.aac,.wav"
            onChange={(change) => {
              const file = change.target.files?.[0] ?? null;
              change.target.value = "";
              void chooseAudio(file);
            }}
          />
        </div>
        <div className="stage-file-row">
          <button type="button" className="stage-quiet" onClick={() => coverRef.current?.click()} disabled={busy}>
            {cover ? "Change cover" : "Add cover"}
          </button>
          {preview ? <img className="stage-file-preview" src={preview} alt="" /> : <span>Uses your artist photo</span>}
          <input
            ref={coverRef}
            className="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            onChange={(change) => {
              const next = change.target.files?.[0] ?? null;
              change.target.value = "";
              void acceptPhoto(next, 800)
                .then((picked) => {
                  setError("");
                  setCover(picked);
                })
                .catch((caught: unknown) => {
                  setCover(null);
                  setError(explain(caught));
                });
            }}
          />
          <p className="photo-hint">Optional. A sharp cover, at least 800px on the short side.</p>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary" type="submit" disabled={busy || reading} aria-busy={busy}>
        {busy ? "Uploading…" : "Add track"}
      </button>
    </form>
  );
}
