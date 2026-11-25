import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sanitizeClip } from './animator.js';

export async function loadAssets(base = './assets/', onProgress = () => {}) {
  const loader = new GLTFLoader();
  const names = ['hero_m.glb', 'hero_f.glb', 'hair_long.glb', 'anims1.glb', 'anims2.glb', 'anims_mocap.glb', 'outfits.glb'];
  let done = 0;
  // Comic paint for the shared bodies, laid out on the bodies' own UVs (scripts/paint-suits.mjs):
  // Batwoman's suit, the Batman region mask every other Batman suit recolours (raw data, not
  // colour), Nightwing's suit, and the white line sheets multiplied over code-painted characters.
  // Optional: a missing texture falls back to painted vertex regions. Fetched alongside the models.
  const texLoader = new THREE.TextureLoader();
  const suitTex = {};
  const lineTex = {};
  const TEX = [['bat_f', suitTex, 'f'], ['bat_m_mask', suitTex, 'm_mask', true], ['nightwing', suitTex, 'nightwing'],
    ['lines_m', lineTex, 'lines_m'], ['lines_f', lineTex, 'lines_f'], ['face_m', lineTex, 'face_m'], ['face_f', lineTex, 'face_f']];
  const paint = Promise.all(TEX.map(([file, into, key, raw]) => texLoader.loadAsync(`${base}tex/${file}.webp`).then((t) => {
    t.flipY = false;
    t.colorSpace = raw ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 4;
    into[key] = t;
  }).catch(() => {})));
  const [m, f, hair, a1, a2, mocap, outfits] = await Promise.all(names.map((n) => loader.loadAsync(base + n).then((g) => { onProgress(++done / names.length); return g; })));
  await paint;
  const clips = new Map();
  for (const clip of [...a1.animations, ...a2.animations, ...mocap.animations]) clips.set(clip.name, sanitizeClip(clip));
  return { base, bodies: { m: m.scene, f: f.scene }, hair: hair.scene, outfits: outfits.scene, clips, suitTex, lineTex };
}
