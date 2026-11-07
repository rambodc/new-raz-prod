import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SCULPTURE, STEPS, STEP_ARC, columnRibbon, createArchGeometry, createArcStep, mulberry32 } from "./geometry";
import { ARCH, journeyShot, stepTowards, type Vec3, type WorldLayout } from "./layout";
import type { Quality } from "./quality";
import {
  floorFragment,
  floorVertex,
  glowFragment,
  glowVertex,
  portalFragment,
  portalVertex,
  ribbonFragment,
  ribbonVertex,
  skyFragment,
  skyVertex,
  streakFragment,
  streakVertex,
} from "./shaders";
import type { WorldTheme } from "./theme";

export type StageName = "auth" | "artist" | "event";
export type PortalStyle = "quiet" | "live" | "draft";

export type AnchorEls = {
  sign: HTMLElement | null;
  portalHit: HTMLElement | null;
  portalLabel: HTMLElement | null;
  here: HTMLElement | null;
};

type Palette = {
  a: THREE.Color;
  b: THREE.Color;
  c: THREE.Color;
  portal: THREE.Color;
  fog: THREE.Color;
  aurora: THREE.Color;
};

function makePalette(theme: WorldTheme): Palette {
  return {
    a: new THREE.Color(theme.a),
    b: new THREE.Color(theme.b),
    c: new THREE.Color(theme.c),
    portal: new THREE.Color(theme.portal),
    fog: new THREE.Color(theme.fog),
    aurora: new THREE.Color(theme.aurora),
  };
}

function usePalette(theme: WorldTheme, reduced: boolean): Palette {
  const colors = useMemo(() => makePalette(theme), []);
  const goal = useMemo(() => makePalette(theme), []);
  useEffect(() => {
    goal.a.set(theme.a);
    goal.b.set(theme.b);
    goal.c.set(theme.c);
    goal.portal.set(theme.portal);
    goal.fog.set(theme.fog);
    goal.aurora.set(theme.aurora);
  }, [theme, goal]);
  useFrame((_, dt) => {
    const k = reduced ? 1 : 1 - Math.exp(-dt * 2.8);
    colors.a.lerp(goal.a, k);
    colors.b.lerp(goal.b, k);
    colors.c.lerp(goal.c, k);
    colors.portal.lerp(goal.portal, k);
    colors.fog.lerp(goal.fog, k);
    colors.aurora.lerp(goal.aurora, k);
  });
  return colors;
}

function RibbonMesh({
  geometry,
  palette,
  bias,
  reflect,
  reduced,
  cast,
}: {
  geometry: THREE.BufferGeometry;
  palette: Palette;
  bias: number;
  reflect: boolean;
  reduced: boolean;
  cast: boolean;
}) {
  const mat = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 1 },
        uColorA: { value: palette.a },
        uColorB: { value: palette.b },
        uColorC: { value: palette.c },
        uBias: { value: bias },
        uOpacity: { value: reflect ? 0.7 : 1 },
        uReflect: { value: reflect ? 1 : 0 },
      },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      side: THREE.DoubleSide,
      transparent: reflect,
      depthWrite: !reflect,
    });
    return material;
  }, [palette, bias, reflect]);

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((_, dt) => {
    const time = mat.uniforms.uTime;
    const wind = mat.uniforms.uWind;
    if (time) time.value = reduced ? 0 : (time.value as number) + dt;
    if (wind) wind.value = reduced ? 0 : 1;
  });

  return <mesh geometry={geometry} material={mat} castShadow={cast && !reflect} frustumCulled />;
}

function Sculpture({ palette, reduced, reflect, cast }: { palette: Palette; reduced: boolean; reflect: boolean; cast: boolean }) {
  const geos = useMemo(() => SCULPTURE.map((spec) => columnRibbon(spec, reflect ? 48 : 80)), [reflect]);
  useEffect(() => () => geos.forEach((geo) => geo.dispose()), [geos]);
  return (
    <group>
      {geos.map((geo, index) => (
        <RibbonMesh key={index} geometry={geo} palette={palette} bias={index / Math.max(1, geos.length - 1)} reflect={reflect} reduced={reduced} cast={cast} />
      ))}
    </group>
  );
}

function PortalArch({ palette, portalStyle }: { palette: Palette; portalStyle: PortalStyle }) {
  const geo = useMemo(() => createArchGeometry(ARCH.radius, ARCH.height, 0.018), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: palette.portal },
          uIntensity: { value: 1 },
          uDash: { value: 0 },
        },
        vertexShader: portalVertex,
        fragmentShader: portalFragment,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [palette],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    const intensity = mat.uniforms.uIntensity;
    const dash = mat.uniforms.uDash;
    if (intensity) intensity.value = portalStyle === "live" ? 1.25 : portalStyle === "draft" ? 0.75 : 0.22;
    if (dash) dash.value = portalStyle === "draft" ? 1 : 0;
  });
  return <mesh geometry={geo} material={mat} />;
}

function PortalGlow({ palette, portalStyle }: { palette: Palette; portalStyle: PortalStyle }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: palette.portal },
          uIntensity: { value: 1 },
        },
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [palette],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const intensity = mat.uniforms.uIntensity;
    if (intensity) intensity.value = portalStyle === "quiet" ? 0.18 : portalStyle === "draft" ? 0.45 : 1;
  });
  return (
    <mesh position={[0, ARCH.height * 0.5, -0.04]} material={mat}>
      <planeGeometry args={[ARCH.radius * 2.15, ARCH.height * 1.05]} />
    </mesh>
  );
}

function EventRing({ palette, portalStyle }: { palette: Palette; portalStyle: PortalStyle }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.portal, toneMapped: false }), [palette]);
  const faint = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.portal, transparent: true, opacity: 0.4, toneMapped: false }), [palette]);
  useEffect(
    () => () => {
      mat.dispose();
      faint.dispose();
    },
    [mat, faint],
  );
  useFrame(() => {
    const dim = portalStyle === "quiet" ? 0.25 : 1;
    mat.opacity = dim;
    faint.opacity = 0.35 * dim;
  });
  return (
    <group position={[0, 0.045, -3.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
        <torusGeometry args={[1.15, 0.016, 16, 96]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={faint}>
        <torusGeometry args={[1.55, 0.006, 12, 80]} />
      </mesh>
    </group>
  );
}

function Amphitheater({ cast }: { cast: boolean }) {
  const geos = useMemo(() => STEPS.map((step) => createArcStep(step.inner, step.outer, step.y, step.rise, STEP_ARC[0], STEP_ARC[1])), []);
  useEffect(() => () => geos.forEach((geo) => geo.dispose()), [geos]);
  return (
    <group>
      {geos.map((geo, index) => (
        <mesh key={index} geometry={geo} receiveShadow={cast} castShadow={cast}>
          <meshStandardMaterial color={index % 2 === 0 ? "#14131a" : "#191820"} roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
      <mesh position={[0.45, 1.2, -2.55]} receiveShadow={cast}>
        <boxGeometry args={[7.4, 2.5, 0.2]} />
        <meshStandardMaterial color="#0c0b11" roughness={0.96} metalness={0.03} />
      </mesh>
    </group>
  );
}

function Floor({ palette, layout }: { palette: Palette; layout: WorldLayout }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSculpt: { value: palette.b },
          uPortal: { value: palette.portal },
          uSculptPos: { value: new THREE.Vector3(...layout.sculpture.position) },
          uPortalPos: { value: new THREE.Vector3(...layout.portal.position) },
        },
        vertexShader: floorVertex,
        fragmentShader: floorFragment,
        transparent: true,
        depthWrite: true,
      }),
    [palette, layout.sculpture.position, layout.portal.position],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const sculpt = mat.uniforms.uSculptPos?.value as THREE.Vector3;
    const portal = mat.uniforms.uPortalPos?.value as THREE.Vector3;
    sculpt.set(...layout.sculpture.position);
    portal.set(...layout.portal.position);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={mat} renderOrder={2}>
      <circleGeometry args={[16, 72]} />
    </mesh>
  );
}

function radialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.72)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Contact({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  const tex = useMemo(() => radialTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.03, position[2]]} scale={[scale, scale, 1]} renderOrder={3}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Streak({ position, color, rotation = 0 }: { position: Vec3; color: THREE.Color; rotation?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color }, uIntensity: { value: 0.85 } },
        vertexShader: streakVertex,
        fragmentShader: streakFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [color],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh rotation={[-Math.PI / 2, rotation, 0]} position={position} renderOrder={4} material={mat}>
      <planeGeometry args={[1.35, 3.8]} />
    </mesh>
  );
}

function Sky({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAurora: { value: palette.aurora } },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    [palette],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    const time = mat.uniforms.uTime;
    if (time && !reduced) time.value = (time.value as number) + dt;
  });
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[42, 28, 20]} />
    </mesh>
  );
}

function Motes({ palette, reduced }: { palette: Palette; reduced: boolean }) {
  const geo = useMemo(() => {
    const rand = mulberry32(7);
    const count = 42;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 10;
      positions[i * 3 + 1] = 0.3 + rand() * 3.1;
      positions[i * 3 + 2] = (rand() - 0.5) * 8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);
  const warm = useMemo(() => new THREE.Color("#ffe8f2"), []);
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#ffd4e8",
        size: 0.045,
        map: sprite,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [sprite],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      sprite.dispose();
    },
    [geo, mat, sprite],
  );
  useFrame(() => {
    mat.color.copy(palette.portal).lerp(warm, 0.65);
    if (!reduced) mat.opacity = 0.28 + Math.sin(performance.now() / 1800) * 0.06;
  });
  return <points geometry={geo} material={mat} />;
}

function CameraRig({ stage, layout, reduced }: { stage: StageName; layout: WorldLayout; reduced: boolean }) {
  const { camera, invalidate } = useThree();
  const progress = useRef(stage === "event" ? 1 : 0);
  const look = useRef(new THREE.Vector3());
  useEffect(() => {
    invalidate();
  }, [stage, layout, reduced, invalidate]);
  useFrame((_, dt) => {
    const goal = stage === "event" ? 1 : 0;
    progress.current = stepTowards(progress.current, goal, dt, reduced);
    const shot = stage === "auth" ? layout.auth : journeyShot(layout, progress.current);
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(persp.fov - shot.fov) > 0.05) {
      persp.fov = shot.fov;
      persp.updateProjectionMatrix();
    }
    camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
    look.current.set(shot.target[0], shot.target[1], shot.target[2]);
    camera.lookAt(look.current);
    if (!reduced && Math.abs(progress.current - goal) > 0.001) invalidate();
  });
  return null;
}

function project(camera: THREE.Camera, width: number, height: number, point: Vec3, target: THREE.Vector3) {
  target.set(point[0], point[1], point[2]).project(camera);
  return {
    x: (target.x * 0.5 + 0.5) * width,
    y: (-target.y * 0.5 + 0.5) * height,
    behind: target.z > 1,
  };
}

function place(el: HTMLElement | null, x: number, y: number, behind: boolean) {
  if (!el) return;
  if (behind) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  el.classList.add("is-anchored");
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
}

function Anchors({ layout, anchors }: { layout: WorldLayout; anchors: RefObject<AnchorEls> }) {
  const { camera, size } = useThree();
  const tmp = useRef(new THREE.Vector3());
  useFrame(() => {
    const els = anchors.current;
    if (!els) return;
    const sign = project(camera, size.width, size.height, layout.sign, tmp.current);
    place(els.sign, sign.x, sign.y, sign.behind);
    const label = project(camera, size.width, size.height, layout.label, tmp.current);
    place(els.portalLabel, label.x, label.y, label.behind);
    const here = project(camera, size.width, size.height, layout.ring, tmp.current);
    const hereY = Math.min(size.height - 88, Math.max(72, here.y));
    place(els.here, here.x, hereY, here.behind);

    const hit = els.portalHit;
    if (hit) {
      const scale = layout.portal.scale;
      const base = layout.portal.position;
      const top = project(camera, size.width, size.height, [base[0], base[1] + ARCH.height * scale, base[2]], tmp.current);
      const left = project(camera, size.width, size.height, [base[0] - ARCH.radius * scale, base[1] + ARCH.height * scale * 0.4, base[2]], tmp.current);
      const right = project(camera, size.width, size.height, [base[0] + ARCH.radius * scale, base[1] + ARCH.height * scale * 0.4, base[2]], tmp.current);
      const bottom = project(camera, size.width, size.height, [base[0], base[1], base[2]], tmp.current);
      if (top.behind) {
        hit.style.visibility = "hidden";
      } else {
        hit.style.visibility = "visible";
        hit.classList.add("is-anchored");
        const w = Math.max(64, Math.abs(right.x - left.x) + 28);
        const h = Math.max(96, Math.abs(bottom.y - top.y) + 20);
        hit.style.width = `${w}px`;
        hit.style.height = `${h}px`;
        hit.style.transform = `translate3d(${(left.x + right.x) / 2}px, ${(top.y + bottom.y) / 2}px, 0) translate(-50%, -50%)`;
      }
    }
  });
  return null;
}

function Interior({
  portalZ,
  blend,
  palette,
  portalStyle,
  reduced,
  theme,
}: {
  portalZ: number;
  blend: number;
  palette: Palette;
  portalStyle: PortalStyle;
  reduced: boolean;
  theme: WorldTheme;
}) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const spread = 0.4 + blend * 0.38;
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = camera.position.z < portalZ - 0.05;
  });
  return (
    <group ref={ref} visible={false}>
      <group position={[-spread, 0, -2.5]} scale={0.48} rotation={[0, 0.35, 0]}>
        <Sculpture palette={palette} reduced={reduced} reflect={false} cast={false} />
      </group>
      <group position={[spread, 0, -2.7]} scale={0.46} rotation={[0, -0.4, 0]}>
        <Sculpture palette={palette} reduced={reduced} reflect={false} cast={false} />
      </group>
      <group position={[-spread * 0.85, 0, -4.3]} scale={0.38} rotation={[0, 0.2, 0]}>
        <Sculpture palette={palette} reduced={reduced} reflect={false} cast={false} />
      </group>
      <group position={[spread * 0.9, 0, -4.5]} scale={0.36} rotation={[0, -0.25, 0]}>
        <Sculpture palette={palette} reduced={reduced} reflect={false} cast={false} />
      </group>
      <EventRing palette={palette} portalStyle={portalStyle} />
      <pointLight position={[0, 1.5, -2.6]} intensity={portalStyle === "draft" ? 4 : 9} distance={9} decay={2} color={theme.b} />
    </group>
  );
}

function FogSync({ palette }: { palette: Palette }) {
  const { scene } = useThree();
  useFrame(() => {
    if (scene.fog && "color" in scene.fog) scene.fog.color.copy(palette.fog);
  });
  return null;
}

export default function WorldScene({
  stage,
  theme,
  portalStyle,
  layout,
  reduced,
  quality,
  anchors,
}: {
  stage: StageName;
  theme: WorldTheme;
  portalStyle: PortalStyle;
  layout: WorldLayout;
  reduced: boolean;
  quality: Quality;
  anchors: RefObject<AnchorEls>;
}) {
  const palette = usePalette(theme, reduced);
  const portalPos = layout.portal.position;
  const sculptPos = layout.sculpture.position;
  const sculptAt: Vec3 = [sculptPos[0], sculptPos[1] + (stage === "auth" && layout.portrait ? 0.7 : 0), sculptPos[2]];
  return (
    <>
      <color attach="background" args={["#07060a"]} />
      <fog attach="fog" args={[theme.fog, 14, 34]} />
      <FogSync palette={palette} />
      <CameraRig stage={stage} layout={layout} reduced={reduced} />
      <Anchors layout={layout} anchors={anchors} />
      <hemisphereLight args={["#3a2458", "#07060a", 0.45]} />
      <directionalLight
        position={[4.5, 8.5, 5.5]}
        intensity={2.4}
        color="#ffe4f1"
        castShadow={quality.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 3.5, -2]} intensity={0.55} color="#7c6bff" />
      <pointLight position={[portalPos[0], portalPos[1] + 1.15, portalPos[2] + 0.35]} color={theme.portal} intensity={portalStyle === "quiet" ? 2 : 12} distance={8} decay={2} />
      <pointLight position={[sculptPos[0], 1.8, sculptPos[2] + 1.4]} color={theme.b} intensity={4} distance={6} decay={2} />
      <Sky palette={palette} reduced={reduced} />
      <Amphitheater cast={quality.shadows} />
      <group position={sculptAt} scale={layout.sculpture.scale}>
        <Sculpture palette={palette} reduced={reduced} reflect={false} cast={quality.shadows} />
      </group>
      {quality.reflection && (
        <group scale={[1, -1, 1]} position={[0, 0.02, 0]}>
          <group position={sculptAt} scale={layout.sculpture.scale}>
            <Sculpture palette={palette} reduced={reduced} reflect cast={false} />
          </group>
        </group>
      )}
      <group position={portalPos}>
        <group scale={layout.portal.scale}>
          <PortalArch palette={palette} portalStyle={portalStyle} />
          <PortalGlow palette={palette} portalStyle={portalStyle} />
        </group>
        {portalStyle !== "quiet" && <Interior portalZ={portalPos[2]} blend={layout.blend} palette={palette} portalStyle={portalStyle} reduced={reduced} theme={theme} />}
      </group>
      <Floor palette={palette} layout={layout} />
      <Contact position={sculptPos} scale={1.15 * layout.sculpture.scale} />
      <Contact position={portalPos} scale={0.85 * layout.portal.scale} />
      <Streak position={[portalPos[0], 0.04, portalPos[2] + 1.55]} color={palette.portal} />
      {layout.blend > 0.35 &&
        [0, 1, 2].map((step) => (
          <mesh key={step} position={[portalPos[0] - 0.05, 0.045 + step * 0.07, portalPos[2] + 1.35 - step * 0.42]} receiveShadow={quality.shadows} castShadow={quality.shadows}>
            <boxGeometry args={[1.55 - step * 0.08, 0.08, 0.4]} />
            <meshStandardMaterial color="#15141b" roughness={0.88} metalness={0.06} />
          </mesh>
        ))}
      {quality.motes && <Motes palette={palette} reduced={reduced} />}
    </>
  );
}
