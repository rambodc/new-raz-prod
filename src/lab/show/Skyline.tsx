import { memo, useMemo } from "react";
import { ZONES, zoneLevel } from "./sim";

const W = 1920;
const GROUND = 900;
const ZONE_W = W / ZONES.length;
/** A window lights up once its area is at least this lit. */
const BUCKETS = [0.12, 0.35, 0.58, 0.8];

function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Geometry = { silhouette: string[]; windows: string[][] };

/** Stylised, generic towers, built once. Windows are grouped by area and by how lit that area must be. */
function buildSkyline(): Geometry {
  const silhouette: string[] = [];
  const windows: string[][] = [];
  ZONES.forEach((zone, z) => {
    const r = rng(z + 3);
    const x0 = z * ZONE_W;
    const sil: string[] = [];
    const wins: string[] = BUCKETS.map(() => "");
    const towers = 3;
    for (let t = 0; t < towers; t++) {
      const centre = z === 4 ? 0.5 : (t + 0.5) / towers;
      const w = Math.round(46 + r() * 44);
      const base = zone.id === "beltline" || zone.id === "village" ? 240 : zone.id === "airdrie" ? 60 : 110;
      const h = Math.round(base + r() * (zone.id === "beltline" ? 330 : 190));
      // Keep the area's middle clear in Beltline for the needle tower.
      const jitter = (r() - 0.5) * 30;
      let x = Math.round(x0 + ZONE_W * centre - w / 2 + jitter);
      if (z === 4) x = t === 0 ? x0 + 14 : t === 1 ? x0 + ZONE_W - w - 14 : x;
      if (z === 4 && t === 2) continue;
      const y = GROUND - h;
      const step = r() > 0.55 ? Math.round(w * 0.25) : 0;
      sil.push(`M${x} ${GROUND}V${y + (step ? 22 : 0)}${step ? `H${x + step}V${y}H${x + w - step}V${y + 22}H${x + w}` : `H${x + w}`}V${GROUND}Z`);
      const cols = Math.max(1, Math.floor((w - 10) / 14));
      const rows = Math.floor((h - 22) / 24);
      for (let c = 0; c < cols; c++) {
        for (let rw = 0; rw < rows; rw++) {
          if (r() < 0.38) continue;
          const bucket = Math.min(BUCKETS.length - 1, Math.floor(r() * BUCKETS.length));
          wins[bucket] += `M${x + 7 + c * 14} ${y + 26 + rw * 24}h7v11h-7z`;
        }
      }
    }
    silhouette.push(sil.join(""));
    windows.push(wins);
  });
  return { silhouette, windows };
}

const GEO = buildSkyline();

/** A needle tower with a round pod and a thin spire, set in the middle of Beltline. No logos. */
const NEEDLE = (
  <g className="sky-needle">
    <path d={`M951 ${GROUND}L956 470H964L969 ${GROUND}Z`} />
    <path d={`M944 470L950 438H970L976 470Z`} />
    <ellipse cx="960" cy="424" rx="40" ry="13" />
    <path d={`M926 424Q960 392 994 424Z`} />
    <path d={`M958 392L960 270L962 392Z`} />
  </g>
);

export const Skyline = memo(function Skyline({ crowd, count }: { crowd: number; count: number }) {
  const levels = useMemo(() => ZONES.map((zone) => zoneLevel(zone, crowd)), [crowd]);
  const beltline = levels[4];
  return (
    <div className="vs-skyline">
      <svg viewBox={`0 0 ${W} 1080`} preserveAspectRatio="xMidYMid meet" overflow="visible" role="img" aria-label={`A glowing city skyline. ${count} people have checked in.`}>
        <defs>
          <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1080">
            <stop offset="0" stopColor="#07040f" />
            <stop offset="0.7" stopColor="#1c0b2e" />
            <stop offset="1" stopColor="#3b1247" />
          </linearGradient>
          <linearGradient id="ground" gradientUnits="userSpaceOnUse" x1="0" y1={GROUND} x2="0" y2="1080">
            <stop offset="0" stopColor="#12071d" />
            <stop offset="1" stopColor="#05030a" />
          </linearGradient>
          <radialGradient id="zoneglow" cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor="#ff4f9a" stopOpacity="0.85" />
            <stop offset="0.55" stopColor="#b25cff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#b25cff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={-6000} y={-6000} width={W + 12000} height={7080} fill="url(#sky)" />
        {ZONES.map((zone, z) => (
          <ellipse key={`g-${zone.id}`} className="sky-glow" cx={z * ZONE_W + ZONE_W / 2} cy={GROUND} rx={ZONE_W * 0.85} ry={420} fill="url(#zoneglow)" style={{ opacity: levels[z] * 0.9 }} />
        ))}
        {ZONES.map((zone, z) => (
          <g key={zone.id}>
            <path d={GEO.silhouette[z]} className="sky-tower" />
            {BUCKETS.map((thr, b) => (
              <path key={b} d={GEO.windows[z][b]} className="sky-window" style={{ opacity: levels[z] >= thr ? 0.95 : 0 }} />
            ))}
          </g>
        ))}
        <g style={{ opacity: 0.55 + beltline * 0.45 }}>{NEEDLE}</g>
        <circle className="sky-beacon" cx="960" cy="262" r="5" style={{ opacity: beltline > 0.2 ? 1 : 0 }} />
        <rect x={-6000} y={GROUND} width={W + 12000} height={6000} fill="url(#ground)" />
        {ZONES.map((zone, z) => (
          <text key={`l-${zone.id}`} className="sky-label" x={z * ZONE_W + ZONE_W / 2} y={GROUND + 52} textAnchor="middle" style={{ opacity: 0.28 + levels[z] * 0.6 }}>
            {zone.name}
          </text>
        ))}
      </svg>
      <p className="vs-count" aria-hidden="true">
        <strong>{count}</strong> here
      </p>
    </div>
  );
});
