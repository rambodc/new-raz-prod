import { useState } from "react";
import { uploadArtistImage } from "../../data/api";
import { Avatar } from "../../components/Avatar";
import type { Artist } from "../../data/types";
import { resizeToJpegBase64 } from "../../lib/image";


function Row({ artist, onChanged }: { artist: Artist; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNote(null);
    try {
      const data = await resizeToJpegBase64(file);
      await uploadArtistImage(artist.id, data);
      setNote({ text: "Saved.", bad: false });
      onChanged();
    } catch (error) {
      setNote({ text: error instanceof Error && /JPG|resize/.test(error.message) ? error.message : "Couldn't upload. Try again.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="lb-card admin-card artist-row">
      <Avatar name={artist.name} url={artist.imageUrl} />
      <span className="num-name">{artist.name}</span>
      <label className={`lb-btn lb-btn--ghost file-btn${busy ? " is-busy" : ""}`}>
        {busy ? "Uploading…" : artist.imageUrl ? "Replace image" : "Add image"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => void choose(e.target.files?.[0])} aria-label={`Image for ${artist.name}`} />
      </label>
      {note && (
        <p className={note.bad ? "checkin-note checkin-note--bad" : "checkin-note"} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      )}
    </li>
  );
}

export default function ArtistImages({ artists, onChanged }: { artists: Artist[]; onChanged: () => void }) {
  if (artists.length === 0) return <p className="muted">Artists appear here when you add a show.</p>;
  return (
    <ul className="stack">
      {artists.map((a) => (
        <Row key={a.id} artist={a} onChanged={onChanged} />
      ))}
    </ul>
  );
}
