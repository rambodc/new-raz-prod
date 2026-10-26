import { useRef } from "react";
import { foundingCount, handle } from "./sim";

function hue(i: number) {
  return (i * 47 + 320) % 360;
}

/** Founding fans appear as the room fills. The newest one glows. All handles are made up. */
export function Wall({ count }: { count: number }) {
  const n = foundingCount(count);
  const first = useRef(n);
  return (
    <div className="vs-wall">
      <h2 className="vs-wall-title">Founding fans</h2>
      <ul className="vs-wall-grid">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className={`vs-chip${i === n - 1 ? " is-new" : ""}`} style={{ "--h": hue(i), animationDelay: i < first.current ? `${i * 28}ms` : "0ms" } as React.CSSProperties}>
            <span className="vs-chip-orb" aria-hidden="true" />
            {handle(i)}
          </li>
        ))}
      </ul>
    </div>
  );
}
