import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  NormalBlending,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  PointsMaterial,
  PointLight,
  Quaternion,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CROWN, CX, DRUPELETS } from "../lib/raspberry";

export type SceneTheme = "dark" | "light";

export type RaspberryScene = {
  setTheme(theme: SceneTheme): void;
  setPointer(x: number, y: number): void;
  setActive(active: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

// Logo units → scene units (1 scene unit = 100 logo px), origin at the berry's centre.
const U = 100;
const CY = 255;
const RX = 1.5;
const RY = 1.35;
const RZ = 1.15;

const DIST = 10.5;
const BERRY = "#d3185b";
const BODY = "#3d0518";
const LEAF = "#14684f";

/** A teardrop (round belly, pointed tip along +Y) swept around the Y axis. */
function teardropGeometry(): BufferGeometry {
  const pts: Vector2[] = [];
  const tip = 1.72;
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (i / 20) * (Math.PI / 2 + 0.95); // belly arc, bottom → shoulder
    pts.push(new Vector2(Math.max(Math.cos(a), 0.0001), Math.sin(a)));
  }
  const sx = Math.cos(0.95);
  const sy = Math.sin(0.95);
  const ctrlX = sx * 0.25;
  const ctrlY = (sy + tip) / 2;
  for (let i = 1; i <= 10; i++) {
    // slightly concave flank easing into the tip (quadratic Bezier)
    const t = i / 10;
    const m = 1 - t;
    pts.push(new Vector2(Math.max(m * m * sx + 2 * m * t * ctrlX, 0.0001), m * m * sy + 2 * m * t * ctrlY + t * t * tip));
  }
  return new LatheGeometry(pts, 28);
}

function roundedRhombus(points: readonly (readonly [number, number])[], radius: number): Shape {
  const p = points.map(([x, y]) => new Vector2((x - CX) / U, (CY - y) / U));
  const shape = new Shape();
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const prev = p[(i + n - 1) % n];
    const cur = p[i];
    const next = p[(i + 1) % n];
    const a = cur.clone().sub(prev).normalize();
    const b = next.clone().sub(cur).normalize();
    const r = Math.min(radius, cur.distanceTo(prev) / 2.5, cur.distanceTo(next) / 2.5);
    const start = cur.clone().addScaledVector(a, -r);
    const end = cur.clone().addScaledVector(b, r);
    if (i === 0) shape.moveTo(start.x, start.y);
    else shape.lineTo(start.x, start.y);
    shape.quadraticCurveTo(cur.x, cur.y, end.x, end.y);
  }
  shape.closePath();
  return shape;
}

function dotTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createRaspberryScene(canvas: HTMLCanvasElement, onContextLost: () => void): RaspberryScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    onContextLost();
  });

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.5, DIST);
  camera.lookAt(0, 0.5, 0);

  // Lights: warm key, raspberry rim from behind, violet fill, soft ambient.
  const ambient = new AmbientLight(0xffffff, 0.35);
  const key = new DirectionalLight(0xfff1e6, 2.4);
  key.position.set(-3, 4, 6);
  const rim = new DirectionalLight(0xff2f7d, 4);
  rim.position.set(4, 1.5, -4);
  const fill = new PointLight(0x8b5cf6, 14, 12, 2);
  fill.position.set(-4, -2.5, 3);
  const glow = new PointLight(0xff2f7d, 10, 9, 2);
  glow.position.set(2.2, -1.2, 3.2);
  scene.add(ambient, key, rim, fill, glow);

  const root = new Group();
  const pivot = new Group();
  root.add(pivot);
  scene.add(root);

  const berryMat = new MeshPhysicalMaterial({
    color: BERRY,
    roughness: 0.28,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.6,
    sheenColor: new Color("#ff7aa8"),
    envMapIntensity: 0.6,
  });
  const bodyMat = new MeshPhysicalMaterial({ color: BODY, roughness: 0.55, metalness: 0, envMapIntensity: 0.3 });
  const leafMat = new MeshPhysicalMaterial({
    color: LEAF,
    roughness: 0.32,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.6,
  });

  // Dark core so gaps between drupelets read as depth.
  const core = new Mesh(new SphereGeometry(1, 48, 32), bodyMat);
  core.scale.set(RX * 0.93, RY * 0.93, RZ * 0.9);
  pivot.add(core);

  const drupGeo = teardropGeometry();
  const drupelets: { mesh: Mesh; base: number; phase: number }[] = [];
  const up = new Vector3(0, 1, 0);
  DRUPELETS.forEach((d, i) => {
    const X = (d.x - CX) / U;
    const Y = (CY - d.y) / U;
    const inside = Math.max(0, 1 - (X / RX) ** 2 - (Y / RY) ** 2);
    const Z = RZ * Math.sqrt(inside);
    const n = new Vector3(X / (RX * RX), Y / (RY * RY), Z / (RZ * RZ)).normalize();
    const tangentUp = up.clone().addScaledVector(n, -up.dot(n)).normalize();
    const axis = n.clone().multiplyScalar(0.45).addScaledVector(tangentUp, 0.9).normalize();
    const mesh = new Mesh(drupGeo, berryMat);
    const base = 0.158 * d.s;
    mesh.scale.setScalar(base);
    mesh.position.set(X, Y, Z).addScaledVector(n, 0.015);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(up, axis));
    pivot.add(mesh);
    drupelets.push({ mesh, base, phase: i * 0.7 });
  });

  // Three-leaf crown, leaning back over the berry.
  const crown = new Group();
  crown.position.set(0, 1.18, 0.34);
  crown.rotation.x = -0.28;
  const leafGeo = CROWN.map((pts) => {
    const g = new ExtrudeGeometry(roundedRhombus(pts, 0.07), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 4,
      curveSegments: 10,
    });
    g.translate(0, -1.18 + 0, 0);
    return g;
  });
  const leaves = leafGeo.map((g, i) => {
    const m = new Mesh(g, leafMat);
    // Side leaves sweep slightly forward, the centre one stands tallest.
    m.position.z = i === 0 ? 0.05 : 0;
    m.rotation.y = i === 1 ? 0.18 : i === 2 ? -0.18 : 0;
    crown.add(m);
    return m;
  });
  pivot.add(crown);

  // Soft floating dust.
  const dotMap = dotTexture();
  const COUNT = 70;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 2.2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
    positions[i * 3 + 2] = Math.sin(a) * r * 0.5 - 0.5;
    seeds[i * 3] = Math.random() * 6.28;
    seeds[i * 3 + 1] = 0.15 + Math.random() * 0.3;
    seeds[i * 3 + 2] = Math.random();
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const dustMat = new PointsMaterial({
    map: dotMap,
    color: 0xff4f93,
    size: 0.12,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const dust = new Points(dustGeo, dustMat);
  scene.add(dust);

  // State
  let active = true;
  let raf = 0;
  let disposed = false;
  const target = new Vector2();
  const current = new Vector2();
  const start = performance.now();
  let lastFrame = start;

  function applyTheme(next: SceneTheme) {
    const dark = next === "dark";
    ambient.intensity = dark ? 0.35 : 0.9;
    key.intensity = dark ? 2.4 : 2.8;
    rim.intensity = dark ? 4 : 2.2;
    fill.intensity = dark ? 14 : 6;
    glow.intensity = dark ? 10 : 5;
    berryMat.envMapIntensity = dark ? 0.55 : 0.9;
    leafMat.envMapIntensity = dark ? 0.55 : 0.85;
    bodyMat.envMapIntensity = dark ? 0.3 : 0.5;
    renderer.toneMappingExposure = dark ? 1.05 : 1.0;
    dustMat.blending = dark ? AdditiveBlending : NormalBlending;
    dustMat.color.set(dark ? 0xff4f93 : 0xd3185b);
    dustMat.opacity = dark ? 0.8 : 0.5;
    dustMat.needsUpdate = true;
  }

  function frame(now: number) {
    if (disposed) return;
    raf = 0;
    if (!active) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    const t = (now - start) / 1000;
    const ease = 1 - Math.exp(-dt * 4);
    current.lerp(target, ease);

    root.position.y = Math.sin(t * 0.9) * 0.07;
    root.rotation.y = current.x * 0.55 + Math.sin(t * 0.35) * 0.1;
    root.rotation.x = -current.y * 0.28 + Math.sin(t * 0.5) * 0.025;
    root.rotation.z = Math.sin(t * 0.4) * 0.015;
    leaves.forEach((l, i) => {
      l.rotation.x = Math.sin(t * 1.1 + i) * 0.03;
    });
    for (const d of drupelets) d.mesh.scale.setScalar(d.base * (1 + 0.018 * Math.sin(t * 1.6 + d.phase)));

    const p = dustGeo.getAttribute("position");
    for (let i = 0; i < COUNT; i++) {
      const y = positions[i * 3 + 1] + Math.sin(t * seeds[i * 3 + 1] + seeds[i * 3]) * 0.25;
      p.setY(i, y);
      p.setX(i, positions[i * 3] + Math.cos(t * 0.3 + seeds[i * 3]) * 0.12);
    }
    p.needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function schedule() {
    if (!raf && active && !disposed) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  applyTheme("dark");
  schedule();

  return {
    setTheme: applyTheme,
    setPointer(x, y) {
      target.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1));
    },
    setActive(next) {
      active = next;
      if (next) schedule();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize(width, height) {
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole berry in view on tall/narrow viewports.
      const minAspect = 0.9;
      camera.position.z = camera.aspect < minAspect ? DIST * (minAspect / camera.aspect) : DIST;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [berryMat, bodyMat, leafMat, dustMat].forEach((m) => m.dispose());
      dotMap.dispose();
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
