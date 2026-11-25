// Character gallery under the game's real renderer and ink pipeline (toon materials, hull
// outlines, the depth/normal ink pass, halftone). Lists every entry of
// src/heroes/models/catalog.js; pick one to see it on a turntable playing an idle, a walk or a
// strike, with a draw-call / triangle readout for that character alone. scripts/model-shots.mjs
// --roster drives window.__roster to render contact sheets.
//   tools/roster.html?id=bat-m&clip=Walk_Loop&view=quarter&q=low&ui=0
import * as THREE from 'three';
import { loadAssets } from '../src/actors/assets.js';
import { createCape } from '../src/actors/cape.js';
import { createRenderer } from '../src/render/renderer.js';
import { createInkPipeline } from '../src/render/inkPipeline.js';
import { getQuality } from '../src/render/quality.js';
import { paletteAt } from '../src/render/comicPalette.js';
import { LAYER_FX } from '../src/render/layers.js';
import { toonMaterial } from '../src/render/toon.js';
import { PALETTE } from '../src/config/palette.js';
import { CATALOG, catalogEntry } from '../src/heroes/models/catalog.js';
import { makeLook, lookAtHour, keyDirection, gradePalette } from '../src/env/look.js';

const params = new URLSearchParams(location.search);
const quality = getQuality(params.get('q') ?? 'high');
const canvas = document.getElementById('gl');
const renderer = createRenderer(canvas, { ...quality, pixelRatioCap: Number(params.get('pr') ?? quality.pixelRatioCap) });
// The game caches its shadow map (render/shadows.js); this page has one small stage and redraws
// it every frame.
renderer.shadowMap.autoUpdate = true;
const ink = createInkPipeline(renderer, quality);
ink.setComic(quality.comic);
ink.setPalette(paletteAt(0, 0));
if (params.get('ui') === '0') { document.getElementById('ui').classList.add('hidden'); document.getElementById('stats').classList.add('hidden'); }

// The city's night lighting (world.js) plus the follow camera's fill (game.js), on a street.
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0062);
const hemi = new THREE.HemisphereLight(0x6a7fa8, 0x14171f, 0.75);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa9bde0, 2.4);
moon.position.set(-30, 60, 22);
if (quality.shadows) {
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 20, far: 150 });
  moon.shadow.bias = -0.0012;
  moon.shadow.normalBias = 0.06;
}
scene.add(moon, moon.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
rim.position.set(20, 30, -60);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x9fb2d6, 1.25);
scene.add(fill, fill.target);

// Time of day (?hour=12 or __roster.setHour): the environment system's look for that hour
// (src/env/look.js) written into the same lights the game drives: hemisphere, key (moon or sun,
// with its direction), rim, fog and the graded comic palette. Default: the night (23:00).
const look = makeLook();
const keyDir = [0, 1, 0];
const srgb = (c, a) => c.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
function setHour(h) {
  lookAtHour(h, look);
  const day = Math.max(0, Math.min(1, (look.hemiI - 0.8) / 0.9));
  srgb(hemi.color, look.hemiSky); srgb(hemi.groundColor, look.hemiGround); hemi.intensity = look.hemiI;
  srgb(moon.color, look.key); moon.intensity = look.keyI;
  srgb(rim.color, look.rim); rim.intensity = look.rimI;
  keyDirection(h, day > 0.05, keyDir);
  moon.position.set(keyDir[0] * 70, keyDir[1] * 70, keyDir[2] * 70);
  srgb(scene.fog.color, look.fog);
  scene.background.copy(scene.fog.color);
  ink.setPalette(gradePalette(paletteAt(0, 0).slice(), day));
}
setHour(Number(params.get('hour') ?? 23));
const stage = new THREE.Group();
const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), toonMaterial({ color: PALETTE.asphalt }));
street.rotation.x = -Math.PI / 2;
street.receiveShadow = true;
stage.add(street);
const kerb = new THREE.Mesh(new THREE.BoxGeometry(80, 0.15, 4), toonMaterial({ color: PALETTE.sidewalk }));
kerb.position.set(0, 0.075, -6);
kerb.receiveShadow = true;
stage.add(kerb);
const wall = new THREE.Mesh(new THREE.BoxGeometry(80, 12, 1), toonMaterial({ color: PALETTE.brick }));
wall.position.set(0, 6, -9);
stage.add(wall);
scene.add(stage);

const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 40), 1, 0.1, 400);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  ink.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const assets = await loadAssets('/assets/');
const clipNames = [...assets.clips.keys()].sort();
const clipSel = document.getElementById('clip');
for (const n of clipNames) clipSel.add(new Option(n, n));

// ---------------------------------------------------------------- characters

const live = []; // { entry, ch, cape }
let clip = params.get('clip') ?? 'Idle_Loop';
clipSel.value = clip;
let view = params.get('view') ?? 'turntable';
document.getElementById('view').value = view;
let spin = 0;

async function build(id, seed = 1) {
  const entry = catalogEntry(id);
  if (!entry) throw new Error(`no catalog entry ${id}`);
  const make = await entry.load();
  const ch = await make(assets, seed);
  let cape = null;
  // Older builders carry no meta: a Batman suit still wears the hero's default cape.
  const capeSpec = ch.meta ? ch.meta.cape : (entry.group === 'batman' ? { color: ch.colors.cape } : null);
  if (capeSpec) {
    cape = createCape(ch, capeSpec.color, capeSpec.options ?? {});
    scene.add(cape.mesh);
  }
  return { entry, ch, cape };
}

function clear() {
  for (const l of live) { scene.remove(l.ch.root); if (l.cape) scene.remove(l.cape.mesh); }
  live.length = 0;
}

function play(l, name, t = null) {
  const a = l.ch.animator;
  if (!a.has(name)) name = 'Idle_Loop';
  a.mixer.stopAllAction();
  // once: true forces a restart even when the same clip was current; then loop it.
  a.play(name, { fade: 0, once: true }).setLoop(THREE.LoopRepeat, Infinity);
  if (t != null) a.update(t);
}

// Shows one character (or a line-up of several) at the origin.
async function show(ids, { clipName = clip, t = null, seed = 1 } = {}) {
  clear();
  const list = Array.isArray(ids) ? ids : [ids];
  const gap = 1.15;
  for (let i = 0; i < list.length; i++) {
    const l = await build(list[i], seed + i);
    l.ch.root.position.set((i - (list.length - 1) / 2) * gap, 0, 0);
    l.ch.face(0);
    scene.add(l.ch.root);
    live.push(l);
    play(l, clipName, t);
  }
  // Let capes settle into their drape: step the cloth for a second of simulated time.
  for (let k = 0; k < 60; k++) for (const l of live) { l.ch.root.updateMatrixWorld(true); l.cape?.update(1 / 60, [0.4, 0, 0.2]); }
  return stats();
}

// ---------------------------------------------------------------- views and stats

const LOOK_Y = 1.0;
let customCam = null;
function placeCamera(name, width = 1) {
  if (name === 'custom' && customCam) {
    camera.position.set(...customCam.p);
    camera.lookAt(...customCam.l);
    camera.updateMatrixWorld(true);
    fill.position.copy(camera.position);
    return;
  }
  const k = Math.max(1, width * 0.65);
  const views = {
    front: [0, 1.25, 3.6 * k], quarter: [2.5 * k, 1.35, 2.6 * k], side: [3.6 * k, 1.25, 0], back: [0, 1.45, -3.6 * k],
    // The third-person follow camera: about 8 m behind and above the hero.
    game8m: [2.2, 3.1, -7.6], far20m: [6, 4.5, 19], face: [0.45, 1.72, 1.05],
    turntable: [Math.sin(spin) * 3.6 * k, 1.3, Math.cos(spin) * 3.6 * k],
  };
  const p = views[name] ?? views.front;
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(0, name === 'far20m' || name === 'game8m' ? 0.9 : name === 'face' ? 1.6 : LOOK_Y, 0);
  camera.updateMatrixWorld(true);
  fill.position.copy(camera.position);
  fill.target.position.set(0, 1, 0);
}

// Draw calls and triangles of the shown characters alone: the colour pass (layer 0 + FX, every
// hull) and the normal pass (layer 0 only) as the ink pipeline draws them.
const statScene = new THREE.Scene();
function stats() {
  const holders = [];
  for (const l of live) { holders.push([l.ch.root, l.ch.root.parent]); statScene.add(l.ch.root); if (l.cape) { holders.push([l.cape.mesh, l.cape.mesh.parent]); statScene.add(l.cape.mesh); } }
  placeCamera('front', live.length);
  const info = renderer.info;
  info.autoReset = false;
  const rt = new THREE.WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(rt);
  const count = (layers) => {
    info.reset();
    camera.layers.set(0);
    for (const l of layers) camera.layers.enable(l);
    renderer.render(statScene, camera);
    return { calls: info.render.calls, triangles: info.render.triangles };
  };
  const color = count([LAYER_FX]);
  statScene.overrideMaterial = new THREE.MeshNormalMaterial();
  const normal = count([]);
  statScene.overrideMaterial = null;
  renderer.setRenderTarget(null);
  rt.dispose();
  info.autoReset = true;
  camera.layers.set(0);
  for (const [o, parent] of holders) parent.add(o);
  const bones = live.length ? live[0].ch.body.skeleton.bones.length : 0;
  const per = live.length || 1;
  const s = { characters: live.length, colorCalls: color.calls / per, normalCalls: normal.calls / per, calls: (color.calls + normal.calls) / per, triangles: color.triangles / per, bones, meta: live[0]?.ch.meta ?? null };
  const el = document.getElementById('stats');
  el.textContent = `${live.map((l) => l.entry.name).join(', ')}\nper character:\n  draw calls ${s.calls} (colour ${s.colorCalls}, normal ${s.normalCalls})\n  triangles (colour pass) ${s.triangles}\n  bones ${bones}`;
  return s;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!window.__roster.frozen) {
    spin += dt * 0.5;
    for (const l of live) {
      l.ch.animator.update(dt);
      l.ch.root.updateMatrixWorld(true);
      l.cape?.update(dt, [0.4, 0, 0.2]);
    }
  }
  placeCamera(view, live.length);
  ink.render(scene, camera, now / 1000);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI

const listEl = document.getElementById('list');
let group = null;
for (const e of CATALOG) {
  if (e.group !== group) { group = e.group; const h = document.createElement('h2'); h.textContent = group; listEl.appendChild(h); }
  const b = document.createElement('button');
  b.textContent = e.name;
  b.dataset.id = e.id;
  b.onclick = () => select(e.id);
  listEl.appendChild(b);
}
async function select(id) {
  for (const b of listEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === id);
  const lineup = document.getElementById('lineup').checked;
  const entry = catalogEntry(id);
  await show(lineup ? CATALOG.filter((e) => e.group === entry.group).map((e) => e.id) : id);
}
clipSel.onchange = () => { clip = clipSel.value; for (const l of live) play(l, clip); };
document.getElementById('view').onchange = (e) => { view = e.target.value; };
document.getElementById('lineup').onchange = () => { const on = listEl.querySelector('button.on'); if (on) select(on.dataset.id); };

// Scripted access for scripts/model-shots.mjs.
window.__roster = {
  frozen: params.get('freeze') === '1',
  catalog: CATALOG.map(({ id, name, group: g }) => ({ id, name, group: g })),
  show,
  stats,
  setView(name, s = 0) { view = name; spin = s; placeCamera(view, live.length); },
  setCamera(p, l) { customCam = { p, l }; view = 'custom'; placeCamera(view); },
  // Pose every shown character at clip time t and render one frame now.
  pose(name, t) { for (const l of live) { play(l, name, t); l.ch.root.updateMatrixWorld(true); } },
  render() { placeCamera(view, live.length); ink.render(scene, camera, 0); },
  stage,
  setHour,
  get live() { return live; },
};
await select(params.get('id') ?? CATALOG[0].id);
window.__roster.ready = true;
requestAnimationFrame(frame);
