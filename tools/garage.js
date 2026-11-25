// The garage: every code-built vehicle on a turntable under the game's real toon + ink pipeline
// (src/render/inkPipeline.js, the same lights as src/game/world.js), with wheel spin/steer, lamp
// toggles, damage states, the Batmobile's mode slider and a draw-call/triangle readout.
// tools/vehicle-sheets.mjs drives window.__garage to shoot contact sheets.
// Open: npx vite --port 5360  ->  http://localhost:5360/tools/garage.html[?v=<id>]
import * as THREE from 'three';
import { createInkPipeline } from '../src/render/inkPipeline.js';
import { getQuality } from '../src/render/quality.js';
import { toonMaterial } from '../src/render/toon.js';
import { CATALOG } from '../src/vehicles/models/catalog.js';
import { measure } from '../src/vehicles/models/kit.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
let quality = getQuality(params.get('q') || 'high');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
let ink = createInkPipeline(renderer, quality);
ink.setComic(quality.comic);
ink.setPalette([0.14, 0.2, 0.3, 0.9, 0.55, 0.25, 0.75, 0.72, 0.62, 0.3, 0.33, 0.38, 0.2, 0.24, 0.32, 0.45, 0.4, 0.5]);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2436);
scene.fog = new THREE.FogExp2(0x1a2436, 0.006);
scene.add(new THREE.HemisphereLight(0x6a7fa8, 0x14171f, 0.75));
const moon = new THREE.DirectionalLight(0xa9bde0, 2.4);
moon.position.set(-30, 60, 22);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 20, far: 150 });
moon.shadow.bias = -0.0012;
moon.shadow.normalBias = 0.06;
scene.add(moon, moon.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
rim.position.set(20, 30, -60);
scene.add(rim);
// A street to stand on: asphalt, a lane line, a kerb and a pavement, a back wall.
const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toonMaterial({ color: 0x23262d }));
asphalt.rotation.x = -Math.PI / 2;
asphalt.receiveShadow = true;
scene.add(asphalt);
for (let i = -10; i <= 10; i++) {
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 2.2), new THREE.MeshBasicMaterial({ color: 0xb9b2a0 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(-3.4, 0.005, i * 5);
  scene.add(lane);
}
const kerb = new THREE.Mesh(new THREE.BoxGeometry(6, 0.16, 200), toonMaterial({ color: 0x4a4d53 }));
kerb.position.set(-12, 0.08, 0);
kerb.receiveShadow = true;
scene.add(kerb);
const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 40, 200), toonMaterial({ color: 0x3b3a44 }));
wall.position.set(-22, 20, 0);
scene.add(wall);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  ink.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- state

const $ = (id) => document.getElementById(id);
let cur = null, curEntry = null, size = 5, centerY = 0.8;
let angle = 0.7, t = 0, spinAngle = 0;
const view = { az: null, el: null, dist: null };

function show(id, opts = {}) {
  const entry = CATALOG.find((e) => e.id === id) ?? CATALOG[0];
  if (cur) scene.remove(cur.group);
  curEntry = entry;
  cur = entry.create({ palette: opts.palette ?? +$('palette').value, damage: +($('damage').value) });
  scene.add(cur.group);
  cur.group.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(cur.group);
  // Aircraft are built round their centre line: stand them on the ground for the turntable.
  if (box.min.y < -0.3 && entry.group !== 'marine') { cur.group.position.y = -box.min.y; cur.group.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(cur.group); }
  const s = new THREE.Vector3();
  box.getSize(s);
  size = Math.max(s.x, s.z, s.y * 1.6);
  centerY = Math.min(box.max.y * 0.45, size * 0.3);
  if (entry.group === 'air' || entry.id === 'batwing') centerY = box.getCenter(new THREE.Vector3()).y;
  for (const b of document.querySelectorAll('#list button')) b.classList.toggle('on', b.dataset.id === entry.id);
  buildLampUI();
  applyControls();
  return entry.id;
}

function buildLampUI() {
  const box = $('lamps');
  box.innerHTML = '';
  if (!cur.setLamps) return;
  for (const g of ['head', 'tail', 'brake', 'reverse', 'sign']) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-lamp="${g}" ${g === 'head' || g === 'tail' ? 'checked' : ''}> ${g}`;
    box.appendChild(l);
  }
  box.onchange = applyControls;
}

function applyControls() {
  if (!cur) return;
  if (cur.setLamps) {
    const st = {};
    for (const i of document.querySelectorAll('[data-lamp]')) st[i.dataset.lamp] = i.checked;
    cur.setLamps(st);
  }
  cur.setSiren?.($('siren').checked);
  cur.indicate?.(+$('ind').value);
  cur.setLod?.($('lod1').checked ? 1 : 0);
  cur.setMode?.(+$('mode').value);
  cur.setStrafe?.(+$('swivel').value);
  cur.aimTurret?.(+$('tyaw').value, +$('tpitch').value);
  cur.setCanopy?.(+$('canopy').value);
  cur.setSuspension?.([0, 1, 2, 3].map(() => +$('susp').value));
  cur.setBoost?.($('boost').checked);
}

const list = $('list');
for (const e of CATALOG) {
  const b = document.createElement('button');
  b.textContent = `${e.group} · ${e.label}`;
  b.dataset.id = e.id;
  b.onclick = () => show(e.id);
  list.appendChild(b);
}
for (const id of ['mode', 'swivel', 'tyaw', 'tpitch', 'canopy', 'susp', 'boost', 'siren', 'ind', 'lod1']) $(id).addEventListener('input', applyControls);
$('palette').addEventListener('input', () => show(curEntry.id));
$('damage').addEventListener('input', () => { cur.setDamage ? cur.setDamage(+$('damage').value) : show(curEntry.id); });
$('lowq').addEventListener('input', () => {
  quality = getQuality($('lowq').checked ? 'low' : 'high');
  ink = createInkPipeline(renderer, quality);
  ink.setComic(quality.comic);
  resize();
});

// ---------------------------------------------------------------- loop

function place() {
  const d = (view.dist ?? +$('dist').value) * (size * 1.25 + 2.5);
  const el = view.el ?? +$('height').value;
  const az = view.az ?? angle;
  camera.position.set(Math.sin(az) * Math.cos(el) * d, centerY + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(0, centerY, 0);
}

function stats() {
  const m = measure(cur.group);
  const extra = cur.stats ? cur.stats() : null;
  return { id: curEntry.id, draws: m.draws, tris: m.tris, ...(extra ?? {}) };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  if (!document.body.classList.contains('sheet')) {
    if ($('turn').checked) angle += dt * 0.35;
    if (cur) {
      if ($('spin').checked) spinAngle -= dt * 6;
      for (const w of cur.wheels ?? []) { w.spin.rotation.x = spinAngle; if (w.front) w.pivot.rotation.y = +$('steer').value; }
      cur.update?.(dt);
    }
    place();
    renderer.shadowMap.needsUpdate = true;
    ink.render(scene, camera, t);
    const s = stats();
    $('stats').textContent = `${s.id}\ndraw calls  ${s.draws}\ntriangles   ${s.tris}\nrenderer    ${renderer.info.render.calls} calls (all passes)`;
  }
  requestAnimationFrame(frame);
}

// Scripting hook for tools/vehicle-sheets.mjs: show a vehicle, pose the camera, render one frame.
window.__garage = {
  ids: () => CATALOG.map((e) => e.id),
  show(id, opts = {}) {
    document.body.classList.add('sheet');
    for (const [k, v] of Object.entries(opts.controls ?? {})) { const el = $(k); if (el.type === 'checkbox') el.checked = v; else el.value = v; }
    const r = show(id, opts);
    if (opts.damage != null && cur.setDamage) cur.setDamage(opts.damage);
    for (let i = 0; i < 3; i++) cur.update?.(0.1);
    return r;
  },
  shot({ az, el, dist = 1, steer = 0, spin = 0 }) {
    view.az = az; view.el = el; view.dist = dist;
    for (const w of cur.wheels ?? []) { w.spin.rotation.x = spin; if (w.front) w.pivot.rotation.y = steer; }
    place();
    renderer.shadowMap.needsUpdate = true;
    ink.render(scene, camera, t);
    return stats();
  },
  stats,
  get api() { return cur; },
};

show(params.get('v') || CATALOG[0].id);
requestAnimationFrame(frame);
