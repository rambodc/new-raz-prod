import * as THREE from "three";

export type Spine = (t: number) => { x: number; y: number; z: number };

export type RibbonOptions = {
  segments: number;
  width: (t: number) => number;
  twist: (t: number) => number;
  thickness?: number;
};

function safeNormalize(v: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (v.lengthSq() < 1e-8) return fallback.clone();
  return v.normalize();
}

/** A folded ribbon volume following `spine`. UVs run across (x) and along (y). */
export function createRibbonGeometry(spine: Spine, options: RibbonOptions): THREE.BufferGeometry {
  const segments = Math.max(2, options.segments);
  const thickness = options.thickness ?? 0.02;
  const frames: { c: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3; w: number }[] = [];
  let transport = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const next = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = spine(Math.max(0, t - 0.012));
    const p = spine(t);
    const b = spine(Math.min(1, t + 0.012));
    prev.set(a.x, a.y, a.z);
    next.set(b.x, b.y, b.z);
    tangent.copy(next).sub(prev);
    tangent.copy(safeNormalize(tangent, new THREE.Vector3(0, 1, 0)));
    transport = transport.clone().sub(tangent.clone().multiplyScalar(transport.dot(tangent)));
    if (transport.lengthSq() < 1e-8) {
      const ref = Math.abs(tangent.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      transport = new THREE.Vector3().crossVectors(ref, tangent);
    }
    transport = safeNormalize(transport, new THREE.Vector3(1, 0, 0));
    const binormal = transport.clone().applyAxisAngle(tangent, options.twist(t));
    const normal = safeNormalize(new THREE.Vector3().crossVectors(binormal, tangent), new THREE.Vector3(0, 0, 1));
    frames.push({ c: new THREE.Vector3(p.x, p.y, p.z), b: binormal, n: normal, w: Math.max(0.01, options.width(t)) });
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const push = (v: THREE.Vector3, u: number, vv: number) => {
    positions.push(v.x, v.y, v.z);
    uvs.push(u, vv);
    return positions.length / 3 - 1;
  };

  for (let i = 0; i <= segments; i++) {
    const f = frames[i]!;
    const t = i / segments;
    const left = f.c.clone().addScaledVector(f.b, f.w);
    const right = f.c.clone().addScaledVector(f.b, -f.w);
    const offset = f.n.clone().multiplyScalar(thickness);
    push(left.clone().add(offset), 0, t);
    push(right.clone().add(offset), 1, t);
    push(right.clone().sub(offset), 1, t);
    push(left.clone().sub(offset), 0, t);
  }

  const quad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
  };

  for (let i = 0; i < segments; i++) {
    const o = i * 4;
    const n = (i + 1) * 4;
    quad(o, o + 1, n + 1, n); // front
    quad(o + 2, o + 3, n + 3, n + 2); // back
    quad(o + 3, o, n, n + 3); // left edge
    quad(o + 1, o + 2, n + 2, n + 1); // right edge
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export type ColumnSpec = {
  phase: number;
  amplitude: number;
  width: number;
  twist: number;
  lean: number;
  height: number;
  y0: number;
  zAmp: number;
  folds: number;
};

export function columnSpine(spec: ColumnSpec): Spine {
  return (t) => {
    const fold = Math.sin(t * Math.PI * spec.folds + spec.phase);
    const y = spec.y0 + t * spec.height;
    const x = Math.sin(t * Math.PI * 1.35 + spec.phase) * spec.amplitude + fold * spec.amplitude * 0.38 + spec.lean;
    const z = Math.cos(t * Math.PI * 1.1 + spec.phase * 0.75) * spec.zAmp + fold * spec.zAmp * 0.25;
    return { x, y, z };
  };
}

export function columnRibbon(spec: ColumnSpec, segments = 72): THREE.BufferGeometry {
  return createRibbonGeometry(columnSpine(spec), {
    segments,
    thickness: 0.018,
    width: (t) => {
      const env = Math.sin(t * Math.PI) ** 0.7;
      const flutter = 0.86 + 0.14 * Math.sin(t * Math.PI * 3 + spec.phase);
      return spec.width * (0.16 + 0.84 * env) * flutter;
    },
    twist: (t) => spec.twist * t + Math.sin(t * Math.PI * 2 + spec.phase) * 0.35,
  });
}

/** The sculptural identity: layered silk, taller than it is wide. */
export const SCULPTURE: ColumnSpec[] = [
  { phase: 0.15, amplitude: 0.46, width: 0.4, twist: 0.7, lean: -0.04, height: 3.55, y0: 0.02, zAmp: 0.3, folds: 2.15 },
  { phase: 1.35, amplitude: 0.5, width: 0.34, twist: -0.85, lean: 0.14, height: 3.4, y0: 0.06, zAmp: 0.34, folds: 2.45 },
  { phase: 2.4, amplitude: 0.36, width: 0.28, twist: 1.05, lean: -0.2, height: 3.15, y0: 0.1, zAmp: 0.24, folds: 1.85 },
  { phase: 3.5, amplitude: 0.3, width: 0.22, twist: -0.45, lean: 0.22, height: 2.95, y0: 0.16, zAmp: 0.2, folds: 2.7 },
  { phase: 4.55, amplitude: 0.22, width: 0.15, twist: 0.95, lean: 0.02, height: 2.55, y0: 0.28, zAmp: 0.16, folds: 3.05 },
  { phase: 5.3, amplitude: 0.16, width: 0.11, twist: -1.15, lean: -0.1, height: 2.2, y0: 0.42, zAmp: 0.12, folds: 2.1 },
];

export type DrapeSpec = { side: number; phase: number; y: number; width: number };

export function drapeRibbon(spec: DrapeSpec, segments = 56): THREE.BufferGeometry {
  const spine: Spine = (t) => ({
    x: spec.side * (0.62 + Math.sin(t * Math.PI * 2.2 + spec.phase) * 0.28 + Math.sin(t * Math.PI * 4.0) * 0.06),
    y: spec.y + Math.sin(t * Math.PI * 2.2 + spec.phase) * 0.34,
    z: -2.35 - t * 4.2,
  });
  return createRibbonGeometry(spine, {
    segments,
    thickness: 0.012,
    width: (t) => spec.width * (0.72 + 0.28 * Math.sin(t * Math.PI)),
    twist: (t) => Math.sin(t * Math.PI + spec.phase) * 0.45,
  });
}

export const DRAPES: DrapeSpec[] = [
  { side: -1, phase: 0.2, y: 0.85, width: 0.28 },
  { side: -1, phase: 1.1, y: 1.35, width: 0.34 },
  { side: -1, phase: 2.2, y: 1.9, width: 0.3 },
  { side: -1, phase: 3.1, y: 2.45, width: 0.24 },
  { side: -1, phase: 4.0, y: 2.95, width: 0.2 },
  { side: 1, phase: 0.5, y: 0.95, width: 0.3 },
  { side: 1, phase: 1.6, y: 1.5, width: 0.34 },
  { side: 1, phase: 2.6, y: 2.05, width: 0.28 },
  { side: 1, phase: 3.5, y: 2.55, width: 0.22 },
  { side: 1, phase: 4.4, y: 3.05, width: 0.18 },
  { side: -0.28, phase: 0.8, y: 1.15, width: 0.42 },
  { side: 0.28, phase: 1.7, y: 1.7, width: 0.4 },
  { side: -0.12, phase: 2.4, y: 2.2, width: 0.36 },
  { side: 0.16, phase: 3.2, y: 0.7, width: 0.32 },
];

/** A curved amphitheatre tread: top surface plus the inner riser. Angles sweep the back of the room. */
export function createArcStep(inner: number, outer: number, y: number, rise: number, a0: number, a1: number, segments = 48): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const push = (x: number, yy: number, z: number, nx: number, ny: number, nz: number) => {
    positions.push(x, yy, z);
    normals.push(nx, ny, nz);
    return positions.length / 3 - 1;
  };
  for (let i = 0; i < segments; i++) {
    const t0 = a0 + ((a1 - a0) * i) / segments;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / segments;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const a = push(c0 * inner, y, s0 * inner, 0, 1, 0);
    const b = push(c0 * outer, y, s0 * outer, 0, 1, 0);
    const c = push(c1 * outer, y, s1 * outer, 0, 1, 0);
    const d = push(c1 * inner, y, s1 * inner, 0, 1, 0);
    indices.push(a, b, c, a, c, d);
    const low = y - rise;
    const e = push(c0 * inner, y, s0 * inner, -c0, 0, -s0);
    const f = push(c1 * inner, y, s1 * inner, -c1, 0, -s1);
    const g = push(c1 * inner, low, s1 * inner, -c1, 0, -s1);
    const h = push(c0 * inner, low, s0 * inner, -c0, 0, -s0);
    indices.push(e, h, f, h, g, f);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

export const STEP_ARC: [number, number] = [Math.PI * 1.08, Math.PI * 1.92];

export const STEPS: { inner: number; outer: number; y: number; rise: number }[] = [
  { inner: 2.85, outer: 3.5, y: 0.08, rise: 0.08 },
  { inner: 3.5, outer: 4.2, y: 0.22, rise: 0.14 },
  { inner: 4.2, outer: 4.95, y: 0.4, rise: 0.18 },
  { inner: 4.95, outer: 5.75, y: 0.6, rise: 0.2 },
  { inner: 5.75, outer: 6.65, y: 0.82, rise: 0.22 },
  { inner: 6.65, outer: 7.6, y: 1.06, rise: 0.24 },
];

class ArchCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly height: number,
  ) {
    super();
  }

  override getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    const target = optionalTarget ?? new THREE.Vector3();
    const angle = Math.PI * (1 - t);
    return target.set(Math.cos(angle) * this.radius, Math.sin(angle) * this.height, 0);
  }
}

export function createArchGeometry(radius: number, height: number, tube = 0.016): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new ArchCurve(radius, height), 72, tube, 10, false);
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function finitePositions(geo: THREE.BufferGeometry): boolean {
  const pos = geo.getAttribute("position");
  if (!pos || pos.count === 0) return false;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  }
  return true;
}
