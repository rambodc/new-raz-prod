import { useState } from "react";
import { deleteShow, updateShowEnd } from "../../data/api";
import { buildTimes, formatDay, formatTime, lineup, toDateInput, toTimeInput } from "../../data/shows";
import type { Show } from "../../data/types";

function Row({ show, onChanged }: { show: Show; onChanged: () => void }) {
  const [end, setEnd] = useState(toTimeInput(show.endsAt));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function saveEnd() {
    const times = buildTimes(toDateInput(show.startsAt), toTimeInput(show.startsAt), end);
    if (!times) return;
    setBusy(true);
    try {
      await updateShowEnd(show.id, times.endsAt);
      setNote("Saved.");
      onChanged();
    } catch {
      setNote("Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${show.venue}?`)) return;
    setBusy(true);
    try {
      await deleteShow(show.id);
      onChanged();
    } catch {
      setNote("Couldn't delete.");
      setBusy(false);
    }
  }

  return (
    <li className="lb-card admin-card">
      <h3 className="show-venue">{show.venue}</h3>
      <p className="muted">
        {formatDay(show.startsAt)} · {formatTime(show.startsAt)} to {formatTime(show.endsAt)}
      </p>
      <p className="show-lineup">{lineup(show)}</p>
      <div className="row">
        <label>
          <span>End time</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="button" className="lb-btn lb-btn--ghost" onClick={saveEnd} disabled={busy}>
          Save
        </button>
        <button type="button" className="lb-btn lb-btn--ghost danger" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
      {note && (
        <p className="checkin-note" role="status">
          {note}
        </p>
      )}
    </li>
  );
}

export default function ShowList({ shows, onChanged }: { shows: Show[]; onChanged: () => void }) {
  if (shows.length === 0) return <p className="muted">No shows yet.</p>;
  return (
    <ul className="stack">
      {shows.map((s) => (
        <Row key={s.id} show={s} onChanged={onChanged} />
      ))}
    </ul>
  );
}
