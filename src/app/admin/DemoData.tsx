import { useState } from "react";
import { createShow, getArtist, uploadArtistImage } from "../../data/api";
import { DEMO_IMAGES, JOHN_SUMMIT_SHOWS, PHOTO_CREDIT, TEST_SHOW_ID, testShow } from "../../data/demo";
import { resizeToJpegBase64 } from "../../lib/image";

async function addImage(artistId: string, url: string): Promise<void> {
  if ((await getArtist(artistId))?.imageUrl) return; // keep any picture that is already there
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load the demo picture.");
  const blob = await res.blob();
  await uploadArtistImage(artistId, await resizeToJpegBase64(new File([blob], "demo.jpg", { type: blob.type })));
}

/** One tap: the real John Summit dates, a TEST show open right now at the office, and a picture for each artist. Safe to tap again. */
export default function DemoData({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      for (const { id, startsAt, endsAt, ...rest } of JOHN_SUMMIT_SHOWS) {
        await createShow({ ...rest, startsAt: new Date(startsAt), endsAt: new Date(endsAt) }, { id, replace: false });
      }
      await createShow(testShow(new Date()), { id: TEST_SHOW_ID, replace: true });
      for (const { artistId, url } of DEMO_IMAGES) await addImage(artistId, url);
      setNote({ text: "Done. The TEST show is open now until 11:59 pm.", bad: false });
    } catch {
      setNote({ text: "Couldn't add everything. Tap again to finish.", bad: true });
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <div className="lb-card admin-card">
      <p className="muted">
        Adds two real John Summit arena dates (Boston Oct 29, Washington DC Oct 31; end times are estimates), a TEST show at #6, 7115 48 St SE that is open from now until 11:59 pm, and a picture for each artist.
      </p>
      <button type="button" className="lb-btn lb-btn--ghost" onClick={run} disabled={busy}>
        {busy ? "Adding…" : "Add demo data"}
      </button>
      <p className="muted">{PHOTO_CREDIT}</p>
      {note && (
        <p className={note.bad ? "checkin-note checkin-note--bad" : "checkin-note"} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
