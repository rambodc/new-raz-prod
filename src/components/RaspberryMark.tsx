import { CROWN, DRUPELETS, DRUPELET_PATH, MARK_VIEWBOX, insetPolygon } from "../lib/raspberry";

/** The brand mark. It takes its colour from the text colour around it. */
export function RaspberryMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <g fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round">
        {CROWN.map((pts, i) => (
          <polygon key={i} points={insetPolygon(pts, 3).map((p) => p.join(",")).join(" ")} />
        ))}
      </g>
      {DRUPELETS.map((d, i) => (
        <path key={i} d={DRUPELET_PATH} fill="currentColor" transform={`translate(${d.x} ${d.y}) scale(${d.s})`} />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={className}>razzberry</span>;
}
