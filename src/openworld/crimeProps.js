// What a crime puts in the street besides its squad, drawn from small pools built lazily (a
// figure's first draw builds its bone textures, so pools stay small and are reused): civilians in
// danger (cowering, then cheering), runners and carriers, the getaway van, bombs, a fire, sniper
// lasers. Positions come from the objective leaves each frame; nothing is allocated per frame.
// Quality: fire flames and lasers are skipped on potato.
import * as THREE from 'three';
import { createGoon } from '../actors/characters.js';
import { createVan, createLootBags } from '../world/sideProps.js';
import { readyObjects } from '../render/prewarm.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';

const POOL = { civ: 4, run: 3, van: 2, bomb: 2, laser: 3 };

export function createCrimeProps(ow) {
  const { scene, assets, rng } = ow;
  const cheap = ow.quality?.name === 'potato';
  const pools = { civ: [], run: [], van: [], bomb: [], laser: [] };
  let loot = null, fire = null;
  const visible = new Set();
  let flick = 0;

  function make(kind) {
    if (kind === 'civ' || kind === 'run') {
      const g = createGoon(assets, { type: kind === 'civ' ? 'civilian' : 'grunt', rng });
      readyObjects(g.root);
      g.root.visible = false;
      scene.add(g.root);
      return { kind, fig: g, obj: g.root, busy: false, hideT: 0, anim: null };
    }
    if (kind === 'van') { const v = createVan(); v.visible = false; scene.add(v); return { kind, obj: v, busy: false, hideT: 0 }; }
    if (kind === 'bomb') {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), toonMaterial({ color: 0x3a3a40 }));
      addHullOutline(box, 0.02);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
      led.position.set(0.18, 0.22, 0);
      box.position.y = 0.18;
      grp.add(box, led);
      grp.visible = false;
      scene.add(grp);
      return { kind, obj: grp, led, busy: false, hideT: 0 };
    }
    if (kind === 'laser') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return { kind, obj: m, busy: false, hideT: 0 };
    }
    return null;
  }
  function take(kind) {
    let a = pools[kind].find((x) => !x.busy);
    if (!a && pools[kind].length < POOL[kind]) { a = make(kind); pools[kind].push(a); }
    if (!a) return null;
    a.busy = true; a.hideT = 0; a.anim = null;
    a.obj.visible = true;
    visible.add(a);
    return a;
  }
  function free(a, delay = 0) {
    if (!a) return;
    if (delay > 0) { a.hideT = delay; return; }
    a.busy = false; a.obj.visible = false; visible.delete(a);
  }
  const play = (a, name, opts = {}) => { if (a.fig && a.anim !== name) { a.anim = name; a.fig.animator.play(name, { fade: 0.2, ...opts }); } };
  const ground = (x, y, z) => { const g = ow.collision?.groundBelow?.(x, y + 2.5, z, 0.3); return g > -Infinity ? g : y; };

  function buildFire() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a24, transparent: true, opacity: 0.85, depthWrite: false });
    const core = new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 6), i % 2 ? core : mat);
      f.position.set(Math.sin(i * 1.7) * 2.2, 1.2, Math.cos(i * 1.7) * 2.2);
      f.userData.phase = i * 1.3;
      grp.add(f);
    }
    grp.visible = false;
    scene.add(grp);
    return grp;
  }

  // Binds pool items to the crime's leaves (again after an escalation adds a leaf).
  function claim(c) {
    c.actors ??= { civ: [], run: [], van: [], bomb: [], laser: [], bound: new Set(), loot: false, fire: false };
    const A = c.actors;
    for (const l of c.obj.leaves) {
      if (A.bound.has(l)) continue;
      A.bound.add(l);
      if (l.kind === 'protect') for (const s of l.civilians) { const a = take('civ'); if (a) { s.y = ground(s.x, s.y, s.z); A.civ.push({ a, s, kind: 'protect' }); } }
      if (l.kind === 'rescue') for (const s of l.people) { const a = take('civ'); if (a) { s.y = ground(s.x, s.y, s.z); A.civ.push({ a, s, kind: 'rescue' }); } }
      if (l.kind === 'chase') for (const r of l.runners) { const a = take('run'); if (a) A.run.push({ a, r }); }
      if (l.kind === 'tail') { const car = c.plan.tailTarget === 'car'; const a = take(car ? 'van' : 'run'); if (a) (car ? A.van : A.run).push({ a, r: l.target, car }); }
      if (l.kind === 'getaway') { const a = take('van'); if (a) A.van.push({ a, r: l.car }); }
      if (l.kind === 'defuse') for (const b of l.bombs) { const a = take('bomb'); if (a) { a.obj.position.set(b.x, ground(b.x, b.y, b.z), b.z); A.bomb.push({ a, b }); } }
      if (l.kind === 'sniper' && !cheap) for (const n of l.nests) { const a = take('laser'); if (a) { a.obj.position.set(n.x, n.y + 1.5, n.z); a.obj.rotation.set(0, n.yaw ?? 0, 0); a.obj.scale.set(1, 1, 32); A.laser.push({ a, n }); } }
    }
    // Scenery: the van for a break-in or a kidnapping, loot bags for robberies, a fire for arson.
    if (c.plan.props?.van && !A.van.some((v) => v.static)) { const a = take('van'); if (a) { a.obj.position.set(c.pos.x + Math.cos(c.spot.yaw ?? 0) * 3, ground(c.pos.x, c.pos.y, c.pos.z), c.pos.z - Math.sin(c.spot.yaw ?? 0) * 3); a.obj.rotation.y = c.spot.yaw ?? 0; A.van.push({ a, static: true }); } }
    if (c.plan.props?.loot && !A.loot) { loot ??= (() => { const l = createLootBags(); l.visible = false; scene.add(l); return l; })(); if (!loot.visible) { loot.position.set(c.pos.x, ground(c.pos.x, c.pos.y, c.pos.z), c.pos.z); loot.visible = true; A.loot = true; } }
    if (c.plan.props?.fire && !A.fire && !cheap) { fire ??= buildFire(); if (!fire.visible) { fire.position.set(c.pos.x, ground(c.pos.x, c.pos.y, c.pos.z), c.pos.z); fire.visible = true; A.fire = true; } }
    if (c.plan.bridge && !A.van.some((v) => v.bridge)) { const a = take('van'); if (a) { const p = c.plan.bridge.car; a.obj.position.set(p.x, p.y + 0.5, p.z); a.obj.rotation.set(0.5, Math.PI / 2, 0); A.van.push({ a, static: true, bridge: true }); } }
  }

  function draw(c) {
    const A = c.actors;
    if (!A) return;
    if (A.bound.size < c.obj.leaves.length) claim(c);
    for (const { a, s, kind } of A.civ) {
      a.obj.position.set(s.x, s.y, s.z);
      if (s.hurt) { play(a, 'Hit_Knockback', { once: true }); if (!a.hideT) a.hideT = 3; }
      else if (s.safe || s.saved) { play(a, 'Yes', { once: true }); if (!a.hideT) a.hideT = 4; }
      else play(a, kind === 'rescue' ? 'Crouch_Idle_Loop' : (s.panic ?? 0) > 0.6 ? 'Crouch_Idle_Loop' : 'Idle_Loop');
    }
    for (const { a, r, car } of A.run) {
      if (r.caught || r.escaped) { if (a.obj.visible && !a.hideT) { a.hideT = r.caught ? 2.5 : 0.01; if (r.caught) { play(a, 'Crouch_Idle_Loop'); ow.events.emit('word', { text: 'GOTCHA!', pos: a.obj.position.clone().setY(a.obj.position.y + 1.6) }); } } continue; }
      a.obj.position.set(r.x, r.y, r.z);
      a.obj.rotation.y = r.yaw ?? 0;
      if (!car) play(a, r.air ? 'Jump_Loop' : (r.speed ?? 2) > 4 || !('speed' in r) ? 'Jog_Fwd_Loop' : 'Walk_Loop');
    }
    for (const v of A.van) {
      if (v.static || !v.r) continue;
      v.a.obj.position.set(v.r.x, v.r.y ?? 0, v.r.z);
      v.a.obj.rotation.y = (v.r.yaw ?? 0) - Math.PI / 2;
    }
    for (const { a, b } of A.bomb) if (b.done && a.obj.visible && !a.hideT) a.hideT = 1.5;
    for (const { a, n } of A.laser) a.obj.visible = !n.down;
  }

  function release(c, delay = 0) {
    const A = c.actors;
    if (!A) return;
    for (const { a } of A.civ) free(a, delay);
    for (const { a } of A.run) free(a, Math.min(delay, 2));
    for (const { a } of A.van) free(a, 0);
    for (const { a } of A.bomb) free(a, 0);
    for (const { a } of A.laser) free(a, 0);
    if (A.loot && loot) loot.visible = false;
    if (A.fire && fire) fire.visible = false;
    c.actors = null;
  }

  return {
    claim, draw, release,
    update(dt) {
      flick += dt;
      for (const a of visible) {
        if (a.fig) a.fig.animator.update(dt);
        if (a.led) a.led.visible = (flick * 4) % 1 < 0.5;
        if (a.hideT > 0 && (a.hideT -= dt) <= 0) { a.hideT = 0; a.busy = false; a.obj.visible = false; visible.delete(a); }
      }
      if (fire?.visible) for (const f of fire.children) { const k = 0.8 + Math.sin(flick * 9 + f.userData.phase) * 0.25; f.scale.set(k, k * 1.2, k); }
    },
    stats: () => ({ civ: pools.civ.length, run: pools.run.length, van: pools.van.length, bomb: pools.bomb.length, laser: pools.laser.length, visible: visible.size }),
    dispose() { for (const k of Object.keys(pools)) for (const a of pools[k]) a.obj.removeFromParent(); },
  };
}
