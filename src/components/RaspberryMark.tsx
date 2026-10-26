import { useId } from "react";
import { CROWN, DRUPELETS, DRUPELET_PATH, MARK_VIEWBOX, insetPolygon } from "../lib/raspberry";

type Props = {
  /** `flat` uses currentColor (nav, favicon-like); `glossy` is the shaded hero fallback. */
  variant?: "flat" | "glossy";
  className?: string;
  title?: string;
};

export function RaspberryMark({ variant = "flat", className, title }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glossy = variant === "glossy";
  const berry = glossy ? `url(#${uid}b)` : "currentColor";
  const leaf = glossy ? `url(#${uid}l)` : "currentColor";

  return (
    <svg
      className={className}
      viewBox={MARK_VIEWBOX}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {glossy && (
        <defs>
          <radialGradient id={`${uid}b`} cx="34%" cy="30%" r="80%">
            <stop offset="0" stopColor="#ff7fae" />
            <stop offset="0.38" stopColor="#e2205f" />
            <stop offset="1" stopColor="#6d0a30" />
          </radialGradient>
          <linearGradient id={`${uid}l`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2fae85" />
            <stop offset="1" stopColor="#0c4a3a" />
          </linearGradient>
          <g id={`${uid}d`}>
            <path d={DRUPELET_PATH} fill={berry} />
            <ellipse cx="-5.5" cy="-1" rx="3" ry="5.6" transform="rotate(14 -5.5 -1)" fill="#fff" opacity="0.5" />
          </g>
        </defs>
      )}
      <g fill={leaf} stroke={leaf} strokeWidth="6" strokeLinejoin="round">
        {CROWN.map((pts, i) => (
          <polygon key={i} points={insetPolygon(pts, 3).map((p) => p.join(",")).join(" ")} />
        ))}
      </g>
      {DRUPELETS.map((d, i) =>
        glossy ? (
          <use key={i} href={`#${uid}d`} transform={`translate(${d.x} ${d.y}) scale(${d.s})`} />
        ) : (
          <path key={i} d={DRUPELET_PATH} fill={berry} transform={`translate(${d.x} ${d.y}) scale(${d.s})`} />
        ),
      )}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={className}>razzberry</span>;
}
