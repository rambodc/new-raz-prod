import type { CSSProperties } from "react";
import { DRAFT_FIELDS } from "../../functions/lib/cards.js";
import type { Draft } from "../chat/flow";
import type { Scene } from "../scene/types";

const BLOBS = [
  { x: "20%", y: "18%" },
  { x: "72%", y: "30%" },
  { x: "40%", y: "62%" },
  { x: "78%", y: "74%" },
];

export function RoomPreview({ scene, draft, portrait }: { scene: Scene; draft: Draft; portrait: string | null }) {
  const notes = (Object.keys(DRAFT_FIELDS) as (keyof Draft)[]).filter((key) => draft[key]);
  return (
    <section className="room" aria-label="Session preview" style={{ "--base": scene.colors.base, "--glow": scene.colors.glow, "--deep": scene.colors.deep, "--warmth": String(scene.light.warmth), "--intensity": String(scene.light.intensity), "--softness": `${28 + scene.shapes.softness * 50}px` } as CSSProperties}>
      <div className="room-glow" />
      {BLOBS.slice(0, Math.min(scene.shapes.count, BLOBS.length)).map((blob) => (
        <span key={blob.x} className="room-blob" style={{ left: blob.x, top: blob.y }} />
      ))}
      <div className="room-figure">
        {portrait ? <img src={portrait} alt="" /> : <p>Add a photo when you want a person in the room.</p>}
      </div>
      <div className="room-copy">
        {scene.name ? <h2>{scene.name}</h2> : null}
        {scene.line ? <p>{scene.line}</p> : null}
      </div>
      <div className="draft">
        <p className="draft-label">Session draft. Not saved.</p>
        {notes.length ? (
          notes.map((key) => (
            <p key={key}>
              <span>{DRAFT_FIELDS[key].label}</span> {draft[key]}
            </p>
          ))
        ) : (
          <p>No artist or event details yet.</p>
        )}
      </div>
    </section>
  );
}
