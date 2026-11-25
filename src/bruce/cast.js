// People in the Manor, the cave and the scenes (workstream K): Alfred with his routines, a scene's
// cast at its marks, gala guests, the suits on their stands. Figures are the shared rig, so every
// clip plays on them; nobody here has combat. Everything is built when a pocket or a scene needs it
// and removed after, and the crowd scales with quality.crowdDensity (Potato: a handful).
import * as THREE from 'three';
import { createAlfred } from '../heroes/models/alfred.js';
import { createLook, LOOKS } from '../actors/civilians/looks.js';
import { createCivilian } from '../actors/civilians/generator.js';
import { pickClip } from './civilian.js';
import { createProp, attachProp } from '../heroes/models/props.js';
import { holdProp } from '../actors/carryPoses.js';
import { bindPosition } from '../actors/rig.js';

const IDLE = ['Civ_Idle_M', 'Story_Thinking', 'Idle_Loop'];
// [polish] Standing conversation: an upright idle under the talking gestures. (Civ_Chat is a lean
// over a water cooler: on its own it bends people double, so it is never used here.)
const TALK_IDLES = [['Civ_Idle_M', 'Idle_Loop'], ['Civ_Idle_F', 'Idle_Loop'], ['Story_Thinking', 'Idle_Loop'], ['Civ_Idle_Happy', 'Idle_Loop']];
const TALK = TALK_IDLES[0];
const GESTURES = ['Story_Talk_One', 'Story_Talk_Two', 'Story_Talk_Arm', 'Yes'];
const EXPRESSIONS = ['smile', 'neutral', 'smile', 'surprised'];
const firstClip = (a, list) => list.find((c) => a.has?.(c)) ?? 'Idle_Loop';

// Alfred's day: where he is, by pocket and hour (station ids from the interiors).
export const ALFRED_ROUTINE = Object.freeze({
  wayneManor: [[0, 7, 'kitchen'], [7, 10, 'newspaper'], [10, 17, 'kitchen'], [17, 24, 'hallFire']],
  batcave: [[0, 24, 'batcomputer']],
  wayneTower: [],
});
export function alfredStation(pocket, hour, { injured = false } = {}) {
  if (pocket === 'batcave' && injured) return 'medbay';
  for (const [a, b, s] of ALFRED_ROUTINE[pocket] ?? []) if (hour >= a && hour < b) return s;
  return null;
}

export function createCast({ scene, assets, quality = {} }) {
  const people = []; // { ch, id, mood, look, at, talkT }
  const tmp = new THREE.Vector3();
  let alfred = null; // { ch, pocket, station }

  function place(ch, p, yaw) { ch.root.position.set(p.x, p.y ?? 0, p.z); ch.face(yaw ?? 0); }
  function add(ch, o = {}) {
    scene.add(ch.root);
    const rec = { ch, id: o.id ?? null, name: o.name ?? '', mood: o.mood ?? 'idle', clip: null, talkT: 0, faceTo: o.faceTo ?? null, group: o.group ?? 'scene' };
    people.push(rec);
    return rec;
  }
  function remove(rec) {
    const i = people.indexOf(rec);
    if (i >= 0) people.splice(i, 1);
    scene.remove(rec.ch.root);
  }

  return {
    get people() { return people; },
    get alfred() { return alfred; },
    // A named person by look id (looks.js), at a world point.
    person(id, look, at, yaw, o = {}) {
      let ch;
      if (look === 'alfred') ch = createAlfred(assets, { variant: o.variant ?? 'butler', prop: o.prop ?? null, glasses: o.variant === 'shirtsleeves' });
      else if (LOOKS[look]) ch = createLook(assets, look);
      else ch = createCivilian(assets, o.seed ?? id.length * 31 + 7, { type: look === 'civilian' ? 'casual' : look });
      place(ch, at, yaw);
      return add(ch, { id, ...o });
    },
    // Guests (world centre): conversational groups of two to four standing in a loose circle,
    // facing in, looking at whoever is talking, one speaker at a time; a dancing pair in the middle
    // when there are enough. Crowd-scaled. [polish] Was a scattered ring of people facing outward.
    // o.band (local -> world fn): a pianist, a bassist and a drummer on the gala's band stand.
    // o.waiters: [{ x, y, z, yaw }] world spots for waiters carrying trays.
    guests(center, { n = 10, radius = 7, seed = 1, band = null, waiters = [] } = {}) {
      const count = Math.max(2, Math.round(n * (quality.crowdDensity ?? 1)));
      const out = [];
      let made = 0;
      // The formal looks (dinner jackets, gowns), with a socialite and an office suit for variety.
      const figure = (i) => createLook(assets, ['galaGuest', 'galaGuestF', 'galaGuest', 'socialite', 'galaGuestF'][i % 5]);
      const sizes = [];
      let left = count;
      if (count >= 6) { sizes.push(-2); left -= 2; }
      while (left > 0) { const k = left <= 4 ? left : left === 5 ? 3 : (sizes.length % 2 ? 3 : 4); sizes.push(k); left -= k; }
      const talkers = sizes.filter((k) => k > 0).length;
      let g = 0;
      for (const size of sizes) {
        const dance = size < 0, k = Math.abs(size);
        const a = dance ? 0 : (g / Math.max(1, talkers)) * Math.PI * 2 + seed * 0.7;
        const rr = dance ? 0 : radius * 0.55;
        const gx = center.x + Math.cos(a) * rr, gz = center.z + Math.sin(a) * rr;
        const members = [];
        for (let m = 0; m < k; m++) {
          const ch = figure(made);
          const ma = (m / k) * Math.PI * 2 + a, mr = dance ? 0.32 : 0.62 + k * 0.08;
          const px = gx + Math.cos(ma) * mr, pz = gz + Math.sin(ma) * mr;
          place(ch, { x: px, y: center.y, z: pz }, Math.atan2(gx - px, gz - pz));
          ch.setExpression?.(EXPRESSIONS[made % EXPRESSIONS.length]);
          const rec = add(ch, { id: `guest${made}`, mood: dance ? 'dance' : 'talk', group: 'guests' });
          rec.idles = TALK_IDLES[made % TALK_IDLES.length];
          if (!dance) { rec.circle = members; rec.faceTo = { x: gx, z: gz }; }
          members.push(rec);
          out.push(rec);
          made++;
        }
        if (!dance) { members.speaker = 0; members.turnT = 1 + (g % 3); g++; }
      }
      if (band) {
        for (const [i, p, mood] of [[0, band({ x: -4.65, y: 0.4, z: 34.0, yaw: Math.PI / 2 }), 'sit'], [1, band({ x: 1.0, y: 0.4, z: 34.1, yaw: Math.PI }), 'idle'], [2, band({ x: 3.4, y: 0.4, z: 35.7, yaw: Math.PI }), 'sit']]) {
          const ch = createLook(assets, 'galaGuest');
          place(ch, p, p.yaw);
          out.push(add(ch, { id: `band${i}`, mood, group: 'guests' }));
        }
      }
      waiters.forEach((w, i) => {
        const ch = createLook(assets, 'waiter');
        // Held level over the fist like Alfred's (src/heroes/models/alfred.js), in the hold pose.
        const tray = createProp('tray');
        const side = Math.sign(bindPosition(ch.body, 'hand_r').x) || 1;
        tray.position.set(side * 0.13, 0.12, 0.09);
        tray.rotation.x = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(tray);
        attachProp(ch, holder, 'r');
        holdProp(ch, assets, 'tray');
        place(ch, w, w.yaw);
        out.push(add(ch, { id: `waiter${i}`, mood: 'idle', group: 'guests' }));
      });
      return out;
    },
    // Alfred in this pocket, at his routine's station (built once per pocket visit).
    alfredIn(pocketId, stationWorld, variant = 'butler', prop = null) {
      if (alfred && alfred.pocket === pocketId && alfred.variant === variant) { place(alfred.rec.ch, stationWorld, stationWorld.yaw); return alfred; }
      if (alfred) remove(alfred.rec);
      const ch = createAlfred(assets, { variant, prop, glasses: variant === 'shirtsleeves' });
      place(ch, stationWorld, stationWorld.yaw);
      alfred = { rec: add(ch, { id: 'alfred', group: 'alfred' }), pocket: pocketId, variant };
      return alfred;
    },
    moveAlfred(p) { if (alfred) place(alfred.rec.ch, p, p.yaw); },
    dropAlfred() { if (alfred) { remove(alfred.rec); alfred = null; } },
    clear(group = 'scene') { for (const r of people.filter((x) => x.group === group)) remove(r); },
    clearAll() { for (const r of [...people]) remove(r); alfred = null; },
    byId: (id) => people.find((r) => r.id === id) ?? null,
    // A one-shot gesture (talking hands, a nod, a toast) then back to the mood loop.
    gesture(id, clips = ['Story_Talk_One', 'Story_Talk_Two', 'Story_Talk_Arm', 'Yes']) {
      const r = people.find((x) => x.id === id);
      if (!r) return;
      const c = firstClip(r.ch.animator, clips);
      r.ch.animator.play(c, { once: true, fade: 0.2 });
      r.talkT = 1.6; r.clip = c;
    },
    // Every frame: loops by mood, turn to whoever they face, gestures time out.
    update(dt, focus = null) {
      for (const r of people) {
        const a = r.ch.animator;
        if (r.talkT > 0) r.talkT -= dt;
        else {
          const want = r.mood === 'dance' ? firstClip(a, ['Story_Dance', 'Dance_Loop']) : r.mood === 'talk' ? firstClip(a, r.idles ?? TALK) : r.mood === 'sit' ? firstClip(a, ['Civ_Sit', 'Sitting_Idle_Loop']) : r.mood === 'tend' ? firstClip(a, ['Story_TendShoulder', 'Interact']) : firstClip(a, IDLE);
          if (want !== r.clip) { r.clip = want; a.play(want, { fade: 0.3 }); }
        }
        // [polish] A conversation: the speaker gestures and talks, the others look at them; the
        // turn passes round the circle every few seconds (circle[0] keeps the clock).
        const c = r.circle;
        if (c && c[0] === r && c.length > 1) {
          c.turnT -= dt;
          if (c.turnT <= 0) {
            c.speaker = (c.speaker + 1) % c.length;
            c.turnT = 2.6 + ((c.speaker * 7) % 5) * 0.5;
            const sp = c[c.speaker];
            const gc = GESTURES[(c.speaker + c.length) % GESTURES.length];
            if (sp.ch.animator.has?.(gc)) { sp.ch.animator.play(gc, { once: true, fade: 0.25 }); sp.talkT = 1.8; sp.clip = gc; }
            for (let k = 0; k < c.length; k++) {
              const m = c[k];
              m.ch.talk?.(k === c.speaker ? 0.8 : 0);
              const look = (k === c.speaker ? c[(k + 1) % c.length] : sp).ch.root.position;
              m.lookTarget ??= new THREE.Vector3();
              m.ch.lookAt?.(m.lookTarget.set(look.x, look.y + 1.6, look.z));
            }
          }
        }
        const f = r.faceTo ?? (r.group !== 'guests' ? focus : null);
        if (f) {
          tmp.set(f.x - r.ch.root.position.x, 0, f.z - r.ch.root.position.z);
          if (tmp.lengthSq() < 64 && tmp.lengthSq() > 0.01) {
            const yaw = Math.atan2(tmp.x, tmp.z);
            const d = Math.atan2(Math.sin(yaw - r.ch.yaw), Math.cos(yaw - r.ch.yaw));
            r.ch.face(r.ch.yaw + d * Math.min(1, dt * 3));
          }
        }
        a.update(dt);
      }
    },
  };
}
void pickClip;
