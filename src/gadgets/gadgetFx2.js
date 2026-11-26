// [prog] Pooled visuals for the wave 3 gadgets: expanding rings (sonic, EMP, hack, glue), glue
// foam, the decoy hologram, the scout drone, EMP mines, zap/tracer lines and tag pips over tracked
// goons. Built once, the first time a new gadget is used (gadgetFx.js `extra`, lazily), all hidden;
// the per-frame path only writes into preallocated objects. Quality: on potato/low (no dynamic
// lights) rings use fewer segments, the hologram does not flicker and spark bursts are halved.
// No lights: the hologram and the rings are unlit basic materials.
import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';

export const FX2_LIMITS = { rings: 8, foam: 8, holo: 2, drones: 2, mines: 4, zaps: 6, pips: 8 };

export function createGadgetFx2(scene, quality = null) {
  const cheap = !quality || (quality.lights ?? 0) <= 2;
  const root = new THREE.Group();
  root.name = 'gadgetFx2';
  scene.add(root);
  const fxLayer = (o) => { o.layers.set(LAYER_FX); o.frustumCulled = false; return o; };
  const basic = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra });

  // ---- rings ----
  const ringGeo = new THREE.RingGeometry(0.85, 1, cheap ? 24 : 48);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < FX2_LIMITS.rings; i++) {
    const mesh = fxLayer(new THREE.Mesh(ringGeo, basic(0xffffff, 0.8, { side: THREE.DoubleSide, depthWrite: false })));
    mesh.visible = false;
    root.add(mesh);
    rings.push({ mesh, t: 0, life: 0, r: 1, live: false });
  }
  let ringNext = 0;
  const ring = (pos, radius, color = 0xffffff, life = 0.6) => {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    r.mesh.position.set(pos.x, pos.y + 0.08, pos.z);
    r.mesh.material.color.setHex(color);
    r.t = 0; r.life = life; r.r = radius; r.live = true;
    r.mesh.visible = true;
    r.mesh.scale.setScalar(0.2);
  };

  // ---- glue foam (one blob per pinned goon, at its feet) ----
  const foamGeo = new THREE.IcosahedronGeometry(0.55, cheap ? 0 : 1);
  const foamMat = basic(0xe9f2c4);
  const foam = [];
  for (let i = 0; i < FX2_LIMITS.foam; i++) {
    const mesh = new THREE.Mesh(foamGeo, foamMat);
    mesh.visible = false;
    mesh.scale.set(1.2, 0.6, 1.2);
    root.add(mesh);
    foam.push({ mesh, target: null, live: false });
  }
  const foamApi = {
    attach(target) {
      const i = foam.findIndex((f) => !f.live);
      if (i < 0) return -1;
      const f = foam[i];
      f.live = true; f.target = target; f.mesh.visible = true;
      f.mesh.position.set(target.pos.x, target.pos.y + 0.25, target.pos.z);
      return i;
    },
    release(i) { const f = foam[i]; if (!f) return; f.live = false; f.target = null; f.mesh.visible = false; },
    get live() { return foam.reduce((n, f) => n + (f.live ? 1 : 0), 0); },
  };

  // ---- the decoy hologram: a caped, eared silhouette in cyan light ----
  const holoMat = basic(0x7fe8ff, 0.55, { depthWrite: false, blending: THREE.AdditiveBlending });
  const holoParts = [
    [new THREE.CylinderGeometry(0.32, 0.42, 1.3, 10), 0, 1.0, 0],
    [new THREE.SphereGeometry(0.2, 10, 8), 0, 1.82, 0],
    [new THREE.ConeGeometry(0.06, 0.22, 4), -0.1, 2.05, 0],
    [new THREE.ConeGeometry(0.06, 0.22, 4), 0.1, 2.05, 0],
    [new THREE.ConeGeometry(0.62, 1.4, 10, 1, true), 0, 0.95, -0.12],
  ];
  const holos = [];
  for (let i = 0; i < FX2_LIMITS.holo; i++) {
    const g = new THREE.Group();
    for (const [geo, x, y, z] of holoParts) { const m = fxLayer(new THREE.Mesh(geo, holoMat)); m.position.set(x, y, z); g.add(m); }
    g.visible = false;
    root.add(g);
    holos.push({ g, live: false, t: 0 });
  }
  const holoApi = {
    show(i, pos, yaw = 0) { const h = holos[i]; if (!h) return; h.g.position.set(pos.x, pos.y, pos.z); h.g.rotation.y = yaw; h.g.visible = true; h.live = true; h.t = 0; },
    hide(i) { const h = holos[i]; if (h) { h.g.visible = false; h.live = false; } },
  };

  // ---- the scout drone ----
  const droneBody = new THREE.BoxGeometry(0.5, 0.14, 0.5);
  const rotorGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 8);
  const droneMat = basic(0x22252c), rotorMat = basic(0xb9c4cf, 0.6, { depthWrite: false });
  const eyeMat = basic(0xff4040);
  const drones = [];
  for (let i = 0; i < FX2_LIMITS.drones; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(droneBody, droneMat));
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { const r = new THREE.Mesh(rotorGeo, rotorMat); r.position.set(x, 0.09, z); g.add(r); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), eyeMat);
    eye.position.set(0, -0.06, 0.26);
    g.add(eye);
    g.visible = false;
    root.add(g);
    drones.push({ g, live: false });
  }
  const droneApi = {
    show(i, pos, yaw = 0) { const d = drones[i]; if (!d) return; d.g.position.copy(pos); d.g.rotation.y = yaw; d.g.visible = true; d.live = true; },
    move(i, pos, yaw = 0, tilt = 0) { const d = drones[i]; if (!d) return; d.g.position.copy(pos); d.g.rotation.set(tilt, yaw, 0); },
    hide(i) { const d = drones[i]; if (d) { d.g.visible = false; d.live = false; } },
  };

  // ---- EMP mines ----
  const mineGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.1, 10);
  const mines = [];
  for (let i = 0; i < FX2_LIMITS.mines; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mineGeo, droneMat));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), basic(0x56c8ff));
    led.position.y = 0.07;
    g.add(led);
    g.visible = false;
    root.add(g);
    mines.push({ g, led, live: false, armed: false, t: 0 });
  }
  const mineApi = {
    place(i, pos) { const m = mines[i]; if (!m) return; m.g.position.set(pos.x, pos.y + 0.05, pos.z); m.g.visible = true; m.live = true; m.armed = false; m.t = 0; },
    arm(i) { const m = mines[i]; if (m) m.armed = true; },
    clear(i) { const m = mines[i]; if (m) { m.g.visible = false; m.live = false; } },
  };

  // ---- zap and tracer lines (disruptor beam, bolas cord, decoy shots, tracker dart) ----
  const zaps = [];
  for (let i = 0; i < FX2_LIMITS.zaps; i++) {
    const geo = new THREE.BufferGeometry();
    const a = new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', a);
    const line = fxLayer(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })));
    line.visible = false;
    root.add(line);
    zaps.push({ line, a, t: 0, life: 0, live: false });
  }
  let zapNext = 0;
  const zap = (from, to, color = 0x9fe3ff, life = 0.2) => {
    const z = zaps[zapNext];
    zapNext = (zapNext + 1) % zaps.length;
    z.a.setXYZ(0, from.x, from.y, from.z);
    z.a.setXYZ(1, to.x, to.y, to.z);
    z.a.needsUpdate = true;
    z.line.material.color.setHex(color);
    z.line.material.opacity = 1;
    z.t = 0; z.life = life; z.live = true;
    z.line.visible = true;
  };

  // ---- pips: a small diamond over each tracked or marked target ----
  const pipGeo = new THREE.OctahedronGeometry(0.14, 0);
  const pips = [];
  for (let i = 0; i < FX2_LIMITS.pips; i++) {
    const mesh = fxLayer(new THREE.Mesh(pipGeo, basic(0xffd23f)));
    mesh.visible = false;
    root.add(mesh);
    pips.push({ mesh, target: null, live: false, lift: 2.3 });
  }
  const pipApi = {
    // `target` has a .pos (a goon) or is a position itself (a car's group.position).
    follow(target, color = 0xffd23f, lift = 2.3) {
      const i = pips.findIndex((p) => !p.live);
      if (i < 0) return -1;
      const p = pips[i];
      p.live = true; p.target = target; p.lift = lift;
      p.mesh.material.color.setHex(color);
      p.mesh.visible = true;
      return i;
    },
    release(i) { const p = pips[i]; if (!p) return; p.live = false; p.target = null; p.mesh.visible = false; },
  };

  let clock = 0;
  return {
    ring, foam: foamApi, holo: holoApi, drone: droneApi, mine: mineApi, zap, pip: pipApi,
    // Spark bursts are halved on the cheap tiers.
    sparkCount: (n) => (cheap ? Math.ceil(n / 2) : n),
    cheap,
    update(dt) {
      clock += dt;
      for (const r of rings) {
        if (!r.live) continue;
        r.t += dt;
        const k = Math.min(1, r.t / r.life);
        r.mesh.scale.setScalar(0.2 + (r.r - 0.2) * (1 - (1 - k) * (1 - k)));
        r.mesh.material.opacity = 0.8 * (1 - k);
        if (k >= 1) { r.live = false; r.mesh.visible = false; }
      }
      for (const f of foam) if (f.live && f.target) f.mesh.position.set(f.target.pos.x, f.target.pos.y + 0.25, f.target.pos.z);
      for (const h of holos) {
        if (!h.live) continue;
        h.t += dt;
        // A little flicker and a slow bob (steady on the cheap tiers).
        holoMat.opacity = cheap ? 0.5 : 0.42 + 0.14 * Math.abs(Math.sin(h.t * 23)) * (Math.sin(h.t * 3.1) > 0.85 ? 0.2 : 1);
        h.g.position.y += Math.sin(h.t * 2) * 0.002;
      }
      for (const d of drones) if (d.live) for (let k = 1; k <= 4; k++) d.g.children[k].rotation.y += dt * 40;
      for (const m of mines) if (m.live) { m.t += dt; m.led.visible = !m.armed || ((m.t * 2.5) % 1) < 0.5; }
      for (const z of zaps) {
        if (!z.live) continue;
        z.t += dt;
        z.line.material.opacity = Math.max(0, 1 - z.t / z.life);
        if (z.t >= z.life) { z.live = false; z.line.visible = false; }
      }
      for (const p of pips) {
        if (!p.live || !p.target) continue;
        const at = p.target.pos ?? p.target;
        p.mesh.position.set(at.x, at.y + p.lift + Math.sin(clock * 4) * 0.06, at.z);
        p.mesh.rotation.y += dt * 2;
      }
    },
    dispose() { scene.remove(root); },
  };
}
