/**
 * Geometry of the Razzberry mark, measured from the official logo (500×500 artboard).
 * Shared by the SVG mark and the 3D hero so both always match the logo.
 */

export type Drupelet = { x: number; y: number; s: number; row: number };
export type Point = readonly [number, number];

/** Horizontal centre of the mark in logo coordinates. */
const CX = 252;

/** Row layout: 6 / 7 / 6 / 5 / 4 drupelets. dx values are mirrored around the centre line. */
const ROWS: { dx: number[]; y: number[]; s: number[] }[] = [
  { dx: [102.2, 59.2, 19.9], y: [161.8, 167.6, 172], s: [1.05, 1.015, 0.97] },
  { dx: [123, 80.1, 39.7, 0], y: [213.9, 218.4, 221.3, 221.7], s: [1.2, 1.11, 1.04, 1.03] },
  { dx: [102, 59.4, 19.8], y: [266.7, 268.9, 270.4], s: [1.07, 1.04, 1] },
  { dx: [80.7, 39.7, 0], y: [317.9, 321.2, 321.6], s: [1.04, 1.02, 1.02] },
  { dx: [60.2, 19.8], y: [366.3, 370.8], s: [1, 1] },
];

function buildDrupelets(): Drupelet[] {
  const out: Drupelet[] = [];
  ROWS.forEach((r, row) => {
    const left: Drupelet[] = [];
    const right: Drupelet[] = [];
    r.dx.forEach((dx, i) => {
      right.push({ x: CX + dx, y: r.y[i], s: r.s[i], row });
      if (dx !== 0) left.unshift({ x: CX - dx, y: r.y[i], s: r.s[i], row });
    });
    out.push(...left, ...right);
  });
  return out;
}

export const DRUPELETS: readonly Drupelet[] = buildDrupelets();

/** Drupelet teardrop, centred on its centroid: pointed tip up, round belly down (≈30×42 at s=1). */
export const DRUPELET_PATH = "M0 -24C6 -14 15 -6 15 3A15 15 0 0 1 -15 3C-15 -6 -6 -14 0 -24Z";

/** The three rhombus leaves of the crown (centre, left, right). */
export const CROWN: readonly (readonly Point[])[] = [
  [[250, 24], [226, 82], [253, 127], [278, 71]],
  [[151, 66], [177, 119], [233, 130], [208, 78]],
  [[353, 66], [327, 119], [271, 130], [296, 78]],
];

/** Move every vertex toward the centroid so a round-joined stroke can soften the corners. */
export function insetPolygon(points: readonly Point[], amount: number): Point[] {
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  return points.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount] as const;
  });
}

export const MARK_VIEWBOX = "96 16 312 378";
