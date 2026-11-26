import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { toonMaterial } from '../render/toon.js';
import { LAYER_FX } from '../render/layers.js';
import { createRng } from '../core/rng.js';
import { facadeTextures, storefrontTextures, noiseTexture, yardTexture, woodTexture, asphaltTexture, roofTexture, sidewalkTexture, puddleTexture } from './textures.js';

export const FACADE_STYLES = ['brick', 'stone', 'deco', 'concrete', 'warehouse', 'factory', 'steel'];
// Meters covered by one texture repeat horizontally, per style (matches the window grid).
export const FACADE_METERS = { brick: 28, stone: 24, deco: 30, concrete: 32, warehouse: 40, factory: 30, steel: 24 };
export const FLOOR_METERS = 54.4;
export const DETAIL_MATERIALS = ['asphalt', 'sidewalk', 'yard', 'concrete', 'glow', 'lane', 'pool', 'puddle', 'cone', 'chem'];

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createCityMaterials(rng) {
  const m = {};
  for (const style of FACADE_STYLES) {
    const t = facadeTextures(style, rng);
    m[`facade_${style}`] = toonMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissive, emissiveIntensity: 1.1 });
  }
  const sf = storefrontTextures(rng);
  m.storefront = toonMaterial({ map: sf.map, emissive: 0xffffff, emissiveMap: sf.emissive, emissiveIntensity: 0.9 });
  m.storefront.userData.shops = sf.shops;
  m.trim = toonMaterial({ color: PALETTE.trim });
  m.roof = toonMaterial({ map: roofTexture(rng) });
  m.asphalt = toonMaterial({ map: asphaltTexture(rng) });
  m.sidewalk = toonMaterial({ map: sidewalkTexture(rng) });
  m.yard = toonMaterial({ map: yardTexture(rng) });
  m.concrete = toonMaterial({ map: noiseTexture(rng, 0x4d5056, 0.02, 256, 1200) });
  m.steel = toonMaterial({ color: PALETTE.steel });
  m.rust = toonMaterial({ color: PALETTE.rust });
  m.wood = toonMaterial({ map: woodTexture(rng) });
  m.glass = toonMaterial({ color: PALETTE.glass, emissive: 0x1a2436, emissiveIntensity: 1 });
  m.painted = toonMaterial({ vertexColors: true });
  m.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.glow.userData.noShadow = true;
  m.lane = new THREE.MeshBasicMaterial({ color: PALETTE.laneMark, polygonOffset: true, polygonOffsetFactor: -2 });
  m.lane.userData = { noShadow: true, layer: LAYER_FX };
  m.pool = new THREE.MeshBasicMaterial({ map: poolTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  m.pool.userData = { noShadow: true, layer: LAYER_FX };
  m.puddle = new THREE.MeshBasicMaterial({ map: puddleTexture(rng), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.puddle.userData = { noShadow: true, layer: LAYER_FX };
  // Lamp light shafts: additive, strongest at the lamp and along the silhouette of the cone.
  m.cone = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(PALETTE.sodium) }, uFogDensity: { value: 0.0062 } },
    vertexShader: `varying float vA; varying float vE; varying float vF; uniform float uFogDensity;
      void main() { vA = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal);
      vE = abs(dot(n, normalize(-mv.xyz))); float d = -mv.z; vF = exp(-pow(uFogDensity * d, 2.0)) * (1.0 - smoothstep(60.0, 110.0, d)) * smoothstep(1.5, 5.0, d);
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; varying float vE; varying float vF;
      void main() { float a = pow(vE, 2.0) * (0.25 + 0.75 * vA * vA) * 0.3 * vF; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  m.cone.userData = { noShadow: true, layer: LAYER_FX };
  m.chem = new THREE.MeshBasicMaterial({ color: PALETTE.chem });
  m.chem.userData.noShadow = true;
  // Cheap overlays (ground, paint, light pools, glow) group in big chunks and cull on their own box
  // at the draw distance; everything else is a near material, swapped for the far-LOD silhouette
  // past quality.lodDistance (src/world/buckets.js, src/world/chunks.js).
  for (const key of DETAIL_MATERIALS) m[key].userData.detail = true;
  // Flat-colour materials ride in the vertex-coloured buckets (src/world/buckets.js add()).
  for (const key of ['trim', 'steel', 'rust']) m[key].userData.foldInto = 'painted';
  m.chem.userData.foldInto = 'glow';
  m.painted.userData.subChunk = 64;
  // Park lawns (Robinson Park, the Museum Campus): a cheap textured overlay like the asphalt. Its own
  // rng, so the core's material textures (drawn from the city rng above) are unchanged.
  m.lawn = toonMaterial({ map: noiseTexture(createRng(907), 0x24402b, 0.07, 256, 5000) });
  m.lawn.userData.detail = true;
  // Ground that is not flat (Bristol's hills, workstream H): vertex-coloured like 'painted' (the
  // same shader), but a detail overlay so a hillside stays drawn out to the draw distance.
  m.turf = toonMaterial({ vertexColors: true });
  m.turf.userData.detail = true;
  return m;
}
