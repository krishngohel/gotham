// Open water as a set of bodies (the harbour, the river, later the lake): flat dark water with
// drifting ink ripple lines and streaks of reflected city light near its banks. All bodies share
// one material and one draw; each carries its banks as a vertex attribute (aBank: north bank z,
// south bank z, falloff, two-banked flag), so the shore glow is per body. The harbour's plane and
// shading are exactly the old single-plane harbour's.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from './mapData.js';

const vertexShader = /* glsl */ `
attribute vec4 aBank;
varying vec3 vWorld;
varying vec4 vBank;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vBank = aBank;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uWater, uInk, uPaper, uGlow, uFog, uCam;
uniform vec3 uSky, uKeyDir, uKeyCol;
uniform float uDay, uLamps, uGlint, uWindK;
varying vec3 vWorld;
varying vec4 vBank;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 p = vWorld.xz;
  float d = length(vWorld - uCam);
  float n = noise(vec2(p.x * 0.05, p.y * 0.35 + uTime * 0.25)) * 0.6 + noise(vec2(p.x * 0.2 + uTime * 0.1, p.y * 1.1)) * 0.4;
  // Thin swell lines, fading out with distance so the far bay reads as one flat tone.
  float ripple = smoothstep(0.03, 0.0, abs(fract(n * 5.0) - 0.5) - 0.46) * (1.0 - smoothstep(40.0, 160.0, d));
  vec3 col = uWater;
  // The sky glow on the water toward the horizon, so the far shore and the bridge stand dark on it.
  float graze = smoothstep(120.0, 700.0, d);
  col = mix(col, mix(uFog, uGlow, 0.22), graze * 0.7);
  // City light near the waterfront, broken into thin horizontal slivers.
  float shore = exp(-(p.y - vBank.x) / vBank.z) + vBank.w * exp(-(vBank.y - p.y) / vBank.z);
  float streak = smoothstep(0.7, 0.95, noise(vec2(p.x * 0.35, 0.0))) * smoothstep(0.6, 0.85, noise(vec2(p.x * 0.3, p.y * 2.2 - uTime * 0.6)));
  col += uGlow * streak * shore * 0.45 * uLamps;
  col = mix(col, uPaper * 0.3, ripple * 0.22);
  col = mix(col, uInk, smoothstep(0.62, 0.7, n) * 0.4);
  // [env] A reflection of the sky in a band of broken horizontal dashes at middle distance, so the
  // water is not one flat tone: the sky's horizon colour, a little brighter by day.
  vec3 V = normalize(vWorld - uCam);
  float bandN = noise(vec2(p.x * 0.018 + uTime * 0.01, p.y * 0.55 - uTime * 0.12));
  float band = step(0.58, bandN) * smoothstep(35.0, 90.0, d) * (1.0 - smoothstep(260.0, 520.0, d));
  col = mix(col, uSky, band * (0.28 + 0.22 * uDay));
  // The moon's (or the hidden sun's) glitter path: where the mirrored view meets the key light,
  // cut into short paper-white dashes.
  vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
  float toKey = dot(R, normalize(uKeyDir));
  float path = smoothstep(0.965, 0.995, toKey) * step(0.55, noise(vec2(p.x * 0.6, p.y * 3.0 + uTime * 0.8)));
  col = mix(col, mix(uPaper, uKeyCol, 0.4), path * uGlint);
  // Gentle animated ink lines: long, slow swells drawn as thin pen strokes.
  float sw = noise(vec2(p.x * 0.012 + uTime * 0.02 * uWindK, p.y * 0.09 + uTime * 0.05 * uWindK));
  float inkLine = smoothstep(0.035, 0.0, abs(fract(sw * 7.0 + uTime * 0.03) - 0.5) - 0.465) * smoothstep(20.0, 60.0, d) * (1.0 - smoothstep(200.0, 380.0, d));
  col = mix(col, uInk, inkLine * 0.35);
  col = mix(col, uFog, (1.0 - exp(-d * 0.0045)) * (1.0 - graze * 0.6));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// bodies: [{ kind: 'harbour' | 'river' | 'lake', minX, maxX, minZ, maxZ, level }]
export function createWater(bodies = [{ kind: 'harbour', level: -0.6 }]) {
  const uniforms = {
    uTime: { value: 0 },
    uWater: { value: new THREE.Color(PALETTE.water) },
    uInk: { value: new THREE.Color(PALETTE.ink) },
    uPaper: { value: new THREE.Color(PALETTE.paper) },
    uGlow: { value: new THREE.Color(PALETTE.sodium) },
    uFog: { value: new THREE.Color(PALETTE.fog) },
    uCam: { value: new THREE.Vector3() },
    // [env] Time of day and weather (src/env/envSystem.js writes these).
    uSky: { value: new THREE.Color(PALETTE.gotham) },
    uKeyDir: { value: new THREE.Vector3(0.55, 0.42, -0.72) },
    uKeyCol: { value: new THREE.Color(0xa9bde0) },
    uDay: { value: 0 }, uLamps: { value: 1 }, uGlint: { value: 0.35 }, uWindK: { value: 1 },
  };
  const geos = bodies.map((b) => {
    let g, bank;
    if (b.kind === 'harbour') {
      // The original harbour plane, south of the seawall.
      g = new THREE.PlaneGeometry(1800, 1000).rotateX(-Math.PI / 2).translate(0, b.level ?? -0.6, WORLD.waterZ + 500);
      bank = [WORLD.waterZ, 0, 45, 0];
    } else {
      g = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ, 1, 1).rotateX(-Math.PI / 2)
        .translate((b.minX + b.maxX) / 2, b.level, (b.minZ + b.maxZ) / 2);
      // A channel glows off both walls; lit windows are close on either side. Open lake water has no
      // bank along its rectangle's edges (the shore glow comes from the city's own lights).
      bank = b.kind === 'lake' ? [b.minZ - 5000, 0, 45, 0] : [b.minZ, b.maxZ, 9, 1];
    }
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) a.set(bank, i * 4);
    g.setAttribute('aBank', new THREE.BufferAttribute(a, 4));
    return g;
  });
  const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }));
  mesh.receiveShadow = false;
  mesh.name = 'water';
  return { mesh, bodies, uniforms, update(t, cam) { uniforms.uTime.value = t; uniforms.uCam.value.copy(cam); } };
}
