// Out of the suit (workstream K): a player in civilian clothes. The hero object stays (its physics,
// collision and input are the game's one path for a player), but its body and cape are hidden and a
// civilian figure walks in its place: Bruce in tux, suit, casual or training clothes (with the
// night's injuries showing), or the ward off duty for a second player.
//
// While civilian, the hero runs under a 'civilian' control (hero.control): the game's combat never
// starts a move (its `free` test needs no control or a combat one), the Batwing cannot be called
// (canCall refuses under any control), and the gadget wheel stays shut ('civilian' joins
// NO_GADGET_CONTROLS). Movement is a walk (sprint is a brisk walk), no jump, no glide, no grapple.
// Restrained self-defence: hold block to guard, punch to shove (a shove only pushes; it never
// knocks anyone down). Vehicles still work: enter() takes the control for the drive and the figure
// hides; when the drive ends the civilian control is put back.
import * as THREE from 'three';
import { NO_GADGET_CONTROLS } from '../gadgets/gadgetDefs.js';
import { createBruce } from '../heroes/models/bruce.js';
import { createLook } from '../actors/civilians/looks.js';

NO_GADGET_CONTROLS.add('civilian');

export const CIVILIAN_SPEED = { walk: 1.7, brisk: 3.4, guard: 0.9 };
// Clip choices, best first (pack clips once loaded; base clips always).
const CLIPS = {
  idle: ['Civ_Idle_M', 'Idle_Loop'],
  walk: ['Civ_Walk_M', 'Walk_Formal_Loop', 'Walk_Loop'],
  brisk: ['Civ_Walk_Hurried', 'Jog_Fwd_Loop'],
  limp: ['Story_Limp', 'Walk_Loop'],
  hurtIdle: ['Story_Injured_Idle', 'Idle_Loop'],
  guard: ['Idle_Shield_Loop'],
  shove: ['Shield_OneShot', 'Interact'],
};
export const pickClip = (animator, kind) => (CLIPS[kind] ?? CLIPS.idle).find((c) => animator.has?.(c) ?? true) ?? 'Idle_Loop';

// The control a civilian hero runs under (one per hero, kept between drives).
function civilianControl(h, rec, events) {
  const wish = { x: 0, z: 0 };
  const f = new THREE.Vector3(), r = new THREE.Vector3();
  return {
    name: 'civilian', camera: 'ground', keepCrouch: false,
    update(dt, ctx) {
      const { input, cam } = ctx;
      const fw = cam.forward(f), rt = cam.right(r);
      wish.x = fw.x * input.move.y + rt.x * input.move.x;
      wish.z = fw.z * input.move.y + rt.z * input.move.x;
      const mag = Math.min(1, Math.hypot(wish.x, wish.z));
      if (mag > 0) { const l = Math.hypot(wish.x, wish.z); wish.x /= l; wish.z /= l; }
      rec.guard = input.down('block');
      const max = rec.guard ? CIVILIAN_SPEED.guard : input.down('sprint') ? CIVILIAN_SPEED.brisk * rec.speedK : CIVILIAN_SPEED.walk * rec.speedK;
      h.vel.x += (wish.x * max * mag - h.vel.x) * Math.min(1, 12 * dt);
      h.vel.z += (wish.z * max * mag - h.vel.z) * Math.min(1, 12 * dt);
      h.vel.y = h.grounded ? -2 : Math.max(-30, h.vel.y - 24 * dt);
      const res = h.integrate(dt);
      h.grounded = res.grounded;
      if (res.grounded) h.vel.y = 0;
      if (mag > 0.05 && !rec.guard) h.faceTowards(wish.x, wish.z, 10, dt);
      h.speed = Math.hypot(h.vel.x, h.vel.z);
      if (h.grounded && h.speed < 3.6) h.lastSafe.copy(h.pos);
      if (input.pressed('punch') && !rec.shoveT) { rec.shoveT = 0.6; events?.emit('bruceShove', { player: h.player, pos: h.pos.clone() }); }
      return false;
    },
  };
}

// createCivilians({ scene, assets, events }) -> { dress(player, kind, opts), undress(player), of(player), update(dt) }
//   kind: 'bruce' (opts.outfit, opts.injuries) | 'ward'
export function createCivilians({ scene, assets, events, vehicles = null }) {
  const byPlayer = new Map();
  function build(kind, opts) {
    if (kind === 'ward') return createLook(assets, 'ward');
    const ch = createBruce(assets, { outfit: opts.outfit ?? 'suit', injuries: opts.injuries ?? null });
    // Seen from the follow camera (behind), a one-colour suit reads as a bodysuit: lift the jacket a shade.
    if ((opts.outfit ?? 'suit') === 'suit' && ch.setPalette) ch.setPalette({ ...ch.palette, outer: 0x46506a, outer2: 0x3a4258 });
    return ch;
  }
  function dispose(rec) {
    if (!rec?.figure) return;
    scene.remove(rec.figure.root);
    rec.figure.root.traverse?.((o) => { if (o.geometry && o.isSkinnedMesh) o.geometry.dispose?.(); });
  }
  const api = {
    of: (p) => byPlayer.get(p) ?? null,
    get list() { return [...byPlayer.values()]; },
    isCivilian: (p) => byPlayer.has(p),
    // Puts a player in civilian clothes (rebuilds the figure when the outfit changes).
    dress(p, kind = 'bruce', opts = {}) {
      const h = p.hero;
      let rec = byPlayer.get(p);
      const outfit = opts.outfit ?? rec?.outfit ?? 'suit';
      if (!rec || rec.kind !== kind || (kind === 'bruce' && rec.outfit !== outfit)) {
        dispose(rec);
        const figure = build(kind, { ...opts, outfit });
        scene.add(figure.root);
        figure.animator.play('Idle_Loop', { fade: 0 });
        rec = { player: p, kind, outfit, figure, control: null, guard: false, shoveT: 0, speedK: 1, clip: null, limp: false };
        rec.control = civilianControl(h, rec, events);
        byPlayer.set(p, rec);
      }
      if (opts.injuries && rec.figure.setInjuries) rec.figure.setInjuries(opts.injuries);
      rec.limp = !!opts.limp;
      rec.speedK = opts.speedK ?? 1;
      h.bat.root.visible = false;
      h.cape.mesh.visible = false;
      h.control = rec.control;
      h.vel.set(0, 0, 0);
      rec.figure.root.position.copy(h.pos);
      rec.figure.face(h.bat.yaw);
      return rec;
    },
    undress(p) {
      const rec = byPlayer.get(p);
      if (!rec) return;
      dispose(rec);
      byPlayer.delete(p);
      const h = p.hero;
      if (h.control === rec.control) h.control = null;
      h.bat.root.visible = true;
      h.cape.mesh.visible = true;
      h.cape.reset?.();
    },
    setInjuries(p, inj) { byPlayer.get(p)?.figure.setInjuries?.(inj); },
    // Every frame: the figure follows its hero; the control comes back after a drive or teleport.
    update(dt) {
      for (const rec of byPlayer.values()) {
        const h = rec.player.hero;
        const driving = !!(vehicles?.active && vehicles.driver === h) || h.control?.name === 'drive' || h.control?.name === 'boardCar';
        rec.figure.root.visible = !driving;
        if (!driving) {
          if (!h.control || h.control.name === 'blockStagger') h.control = rec.control;
          h.bat.root.visible = false;
          h.cape.mesh.visible = false;
        }
        rec.figure.root.position.copy(h.pos);
        rec.figure.face(h.bat.yaw);
        if (rec.shoveT > 0) rec.shoveT = Math.max(0, rec.shoveT - dt);
        const a = rec.figure.animator;
        const kind = rec.shoveT > 0.3 ? 'shove' : rec.guard ? 'guard' : h.speed < 0.25 ? (rec.limp ? 'hurtIdle' : 'idle') : rec.limp ? 'limp' : h.speed > 2.6 ? 'brisk' : 'walk';
        const clip = pickClip(a, kind);
        if (clip !== rec.clip) { rec.clip = clip; a.play(clip, { fade: 0.25, once: kind === 'shove' }); }
        a.update(dt);
      }
    },
    disposeAll() { for (const p of [...byPlayer.keys()]) api.undress(p); },
  };
  return api;
}
