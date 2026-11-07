export type Vec3 = [number, number, number];

export type Shot = { position: Vec3; target: Vec3; fov: number };

export type Band = "phone" | "tablet" | "desktop";

export type WorldLayout = {
  band: Band;
  portrait: boolean;
  /** 0 is a narrow phone portrait, 1 is a wide desktop. */
  blend: number;
  sculpture: { position: Vec3; scale: number };
  portal: { position: Vec3; scale: number };
  sign: Vec3;
  auth: Shot;
  artist: Shot;
  mouth: Shot;
  event: Shot;
  ring: Vec3;
  label: Vec3;
};

export const ARCH = { radius: 0.64, height: 1.92 };

const PHONE_SCULPT: Vec3 = [-0.08, 0, 0.05];
const DESK_SCULPT: Vec3 = [-0.85, 0, 0.05];
const PHONE_PORTAL: Vec3 = [0.95, 0, 1.25];
const DESK_PORTAL: Vec3 = [2.85, 0.16, 0.55];
const RING_Z = -3.15;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

export function bandFor(width: number, height: number): Band {
  const aspect = width / Math.max(height, 1);
  if (width < 760 && aspect < 1.05) return "phone";
  if (width < 1180) return "tablet";
  return "desktop";
}

/** A shot aimed through the portal, built from where that portal actually stands. */
function portalShot(portal: Vec3, scale: number, eye: Vec3, look: Vec3, fov: number): Shot {
  return {
    position: [portal[0] + eye[0] * scale, portal[1] + eye[1], portal[2] + eye[2]],
    target: [portal[0] + look[0] * scale, portal[1] + look[1], portal[2] + look[2]],
    fov,
  };
}

/**
 * Composes the room for this viewport. Phone portrait moves the sculpture and
 * portal into a vertical frame. It is not the desktop camera with the sides cut off.
 */
export function layoutFor(width: number, height: number): WorldLayout {
  const safeW = Math.max(width, 1);
  const safeH = Math.max(height, 1);
  const aspect = safeW / safeH;
  const blend = clamp((aspect - 0.46) / (1.65 - 0.46), 0, 1);
  const short = safeH < 520;
  const sculpture = {
    position: mix3(PHONE_SCULPT, DESK_SCULPT, blend),
    scale: mix(0.7, 1, blend),
  };
  const portal = {
    position: mix3(PHONE_PORTAL, DESK_PORTAL, blend),
    scale: mix(0.82, 1, blend),
  };
  const sign: Vec3 = [mix(0.22, 0.72, blend), mix(0.72, 0.78, blend), mix(-1.7, -1.85, blend)];
  const zPull = short ? 1.35 : 0;
  const fovBump = short ? 4 : 0;
  const artist: Shot = {
    position: [mix(0.12, 0.25, blend), mix(1.42, 1.38, blend), mix(9.8, 8.35, blend) + zPull],
    target: [mix(0.18, 0.15, blend), mix(1.15, 1.16, blend), mix(0.25, 0.05, blend)],
    fov: mix(50, 30, blend) + fovBump,
  };
  const auth: Shot = {
    position: [mix(0.0, -0.35, blend), mix(1.05, 1.48, blend), mix(7.2, 8.7, blend) + zPull],
    target: [0, mix(0.7, 1.42, blend), 0.15],
    fov: mix(36, 30, blend) + fovBump,
  };
  const ring: Vec3 = [portal.position[0], portal.position[1] + 0.55, portal.position[2] + RING_Z];
  const label: Vec3 = [portal.position[0], portal.position[1] + ARCH.height * portal.scale + 0.22, portal.position[2] + 0.15];
  return {
    band: bandFor(safeW, safeH),
    portrait: safeH >= safeW,
    blend,
    sculpture,
    portal,
    sign,
    auth,
    artist,
    mouth: portalShot(portal.position, portal.scale, [0, 1.2, 1.45], [0, 1.05, -1.1], artist.fov),
    event: portalShot(portal.position, portal.scale, [0, 1.4, -0.55], [0, 1.15, -4.1], mix(46, 32, blend)),
    ring,
    label,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function smooth(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

function quad(a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 {
  const u = smooth(t);
  const ab = lerp3(a, b, u);
  const bc = lerp3(b, c, u);
  return lerp3(ab, bc, u);
}

/** Camera along the path from the artist room through the portal. 0 and 1 are the two still frames. */
export function journeyShot(layout: WorldLayout, t: number): Shot {
  return {
    position: quad(layout.artist.position, layout.mouth.position, layout.event.position, t),
    target: quad(layout.artist.target, layout.mouth.target, layout.event.target, t),
    fov: lerp(layout.artist.fov, layout.event.fov, smooth(t)),
  };
}

export function stepTowards(current: number, goal: number, dt: number, reduced: boolean): number {
  if (reduced) return goal;
  const next = current + (goal - current) * (1 - Math.exp(-dt * 2.5));
  return Math.abs(goal - next) < 0.001 ? goal : next;
}
