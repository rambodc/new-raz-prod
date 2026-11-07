export const ribbonVertex = /* glsl */ `
uniform float uTime;
uniform float uWind;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vUv = uv;
  vec3 pos = position;
  float wind = sin(uv.y * 7.5 + uTime * 0.5 + position.x * 1.7) * 0.014 * uWind;
  pos += normal * wind;
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * world;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const ribbonFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBias;
uniform float uOpacity;
uniform float uTime;
uniform float uReflect;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 viewDir = normalize(vView);
  float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.35);
  float along = clamp(vUv.y, 0.0, 1.0);
  float across = abs(vUv.x * 2.0 - 1.0);
  vec3 deep = mix(uColorA, uColorB, clamp(uBias, 0.0, 1.0));
  vec3 col = mix(deep, uColorB, smoothstep(0.0, 0.48, along));
  col = mix(col, uColorC, smoothstep(0.32, 1.0, along));
  float silk = pow(1.0 - across, 1.45);
  col *= 0.42 + 0.72 * silk;
  float sheenPos = fract(along * 1.35 - uTime * 0.035);
  float sheen = exp(-pow((sheenPos - 0.4) * 5.5, 2.0));
  col += vec3(1.0, 0.84, 0.92) * sheen * silk * 0.18;
  vec3 lightDir = normalize(vec3(0.32, 0.86, 0.4));
  float spec = pow(max(dot(n, normalize(lightDir + viewDir)), 0.0), 46.0);
  col += vec3(1.0, 0.78, 0.88) * spec * 0.5;
  col += mix(uColorB, vec3(1.0, 0.82, 0.94), 0.45) * fres * 0.7;
  col *= 0.84 + 0.16 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float alpha = uOpacity;
  if (uReflect > 0.5) {
    float fade = smoothstep(-2.4, -0.04, vWorld.y);
    fade *= smoothstep(9.0, 1.2, length(vWorld.xz));
    alpha *= fade * 0.42;
  }
  gl_FragColor = vec4(col, alpha);
}
`;

export const portalVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const portalFragment = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uDash;
void main() {
  if (uDash > 0.5) {
    float d = fract(vUv.x * 22.0);
    if (d > 0.4) discard;
  }
  float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 1.5);
  vec3 col = uColor * (0.45 + fres * 0.9) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const glowVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const glowFragment = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float ellipse = p.x * p.x + p.y * p.y;
  float inside = smoothstep(1.08, 0.62, ellipse);
  float vertical = smoothstep(0.0, 0.18, vUv.y);
  float base = smoothstep(0.55, 0.0, vUv.y);
  float glow = inside * vertical;
  float alpha = glow * 0.55 * uIntensity + base * inside * 0.45 * uIntensity;
  vec3 col = uColor * (glow * 1.15 + base * 0.65) * uIntensity;
  gl_FragColor = vec4(col, alpha);
}
`;

export const floorVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * world;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const floorFragment = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vView;
uniform vec3 uSculpt;
uniform vec3 uPortal;
uniform vec3 uSculptPos;
uniform vec3 uPortalPos;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(vView);
  float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
  vec3 col = vec3(0.015, 0.012, 0.02);
  float dS = length(vWorld.xz - uSculptPos.xz);
  float dP = length(vWorld.xz - uPortalPos.xz);
  col += uSculpt * exp(-dS * 0.38) * 0.2;
  col += uPortal * exp(-dP * 0.5) * 0.34;
  vec3 lightDir = normalize(vec3(-0.15, 1.0, 0.25));
  vec3 halfDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 70.0);
  col += vec3(0.55, 0.4, 0.48) * spec * 0.22;
  col += fres * vec3(0.07, 0.045, 0.07);
  float r = length(vWorld.xz) / 13.0;
  col *= smoothstep(1.2, 0.15, r);
  gl_FragColor = vec4(col, 0.93);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragment = /* glsl */ `
varying vec3 vPos;
uniform float uTime;
uniform vec3 uAurora;
void main() {
  vec3 dir = normalize(vPos);
  float h = dir.y;
  vec3 col = vec3(0.012, 0.01, 0.018);
  float band = 0.5 + 0.5 * sin(dir.x * 3.2 + dir.z * 2.1 + uTime * 0.04);
  float curtain = smoothstep(0.05, 0.55, h) * smoothstep(0.95, 0.45, h) * band;
  col += uAurora * curtain * 0.28;
  col += vec3(0.09, 0.02, 0.06) * smoothstep(-0.05, 0.35, h) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const streakVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const streakFragment = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  float along = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.15, vUv.y);
  float across = pow(smoothstep(0.5, 0.0, abs(vUv.x - 0.5)), 1.4);
  float a = along * across * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}
`;
