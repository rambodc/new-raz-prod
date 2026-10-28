import { useState, type FormEvent } from "react";
import { createShow } from "../../data/api";
import { searchAddress, type Place } from "../../data/geocode";
import { getPosition } from "../../data/geo";
import { buildTimes, cleanLineup, toDateInput, toTimeInput } from "../../data/shows";

const EMPTY_LINEUP = [""];

function parseCoord(text: string, limit: number): number | null {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** Adds one show. Venue spot: search an address, use your location, or type the numbers. */
export default function ShowForm({ onAdded }: { onAdded: () => void }) {
  const initial = new Date();
  const [venue, setVenue] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [date, setDate] = useState(toDateInput(initial));
  const [start, setStart] = useState(toTimeInput(initial));
  const [end, setEnd] = useState(toTimeInput(new Date(initial.getTime() + 3 * 3600_000)));
  const [names, setNames] = useState<string[]>(EMPTY_LINEUP);
  const [address, setAddress] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const say = (text: string, bad = false) => setNote({ text, bad });

  function startNow() {
    const now = new Date();
    setDate(toDateInput(now));
    setStart(toTimeInput(now));
    setEnd(toTimeInput(new Date(now.getTime() + 3 * 3600_000)));
  }

  async function find() {
    setPlaces(null);
    try {
      const found = await searchAddress(address);
      setPlaces(found);
      if (found.length === 0) say("Nothing found. Try more of the address.", true);
    } catch {
      say("Search isn't working. Type the numbers instead.", true);
    }
  }

  function pick(place: Place) {
    setLat(place.lat.toFixed(6));
    setLng(place.lng.toFixed(6));
    if (!venue.trim()) setVenue(place.label.split(",")[0]);
    setPlaces(null);
  }

  async function here() {
    try {
      const p = await getPosition();
      setLat(p.lat.toFixed(6));
      setLng(p.lng.toFixed(6));
      say(`Location set (about ${Math.round(p.accuracy)} m).`);
    } catch {
      say("Couldn't get your location.", true);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const la = parseCoord(lat, 90);
    const ln = parseCoord(lng, 180);
    const times = buildTimes(date, start, end);
    const lineup = cleanLineup(names);
    if (!venue.trim()) return say("Add the venue name.", true);
    if (la === null || ln === null) return say("Set the venue location.", true);
    if (!times) return say("Check the date and times.", true);
    if (lineup.length === 0) return say("Add at least one artist.", true);
    setBusy(true);
    try {
      await createShow({ venue, lat: la, lng: ln, startsAt: times.startsAt, endsAt: times.endsAt, artistNames: lineup });
      say("Show added.");
      setNames(EMPTY_LINEUP);
      onAdded();
    } catch {
      say("Couldn't add the show. Try again.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lb-card admin-card form" onSubmit={submit}>
      <label>
        <span>Venue</span>
        <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} autoComplete="off" />
      </label>

      <fieldset>
        <legend>Venue location</legend>
        <div className="row">
          <input aria-label="Search an address" placeholder="Search an address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button type="button" className="lb-btn lb-btn--ghost" onClick={find}>
            Find
          </button>
        </div>
        {places && places.length > 0 && (
          <ul className="places">
            {places.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button type="button" onClick={() => pick(p)}>
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <label>
            <span>Latitude</span>
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <label>
            <span>Longitude</span>
            <input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </label>
        </div>
        <button type="button" className="lb-btn lb-btn--ghost" onClick={here}>
          Use my current location
        </button>
      </fieldset>

      <fieldset>
        <legend>When</legend>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="row">
          <label>
            <span>Start</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span>End</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <button type="button" className="lb-btn lb-btn--ghost" onClick={startNow}>
          Start now (3 hours)
        </button>
      </fieldset>

      <fieldset>
        <legend>Lineup</legend>
        {names.map((n, i) => (
          <input key={i} aria-label={`Artist ${i + 1}`} placeholder="Artist name" value={n} maxLength={80} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        <button type="button" className="lb-btn lb-btn--ghost" onClick={() => setNames([...names, ""])}>
          Add artist
        </button>
      </fieldset>

      {note && (
        <p className={note.bad ? "checkin-note checkin-note--bad" : "checkin-note"} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      )}
      <button type="submit" className="lb-btn lb-btn--big" disabled={busy}>
        {busy ? "Adding…" : "Add show"}
      </button>
    </form>
  );
}
