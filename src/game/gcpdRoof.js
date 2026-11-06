// src/game/gcpdRoof.js
// The finale on the GCPD roof (SITES.start / signal, y 42): every rescued person joins in, then
// celebrate() stands the roof down with the searchlights up. Reuses what already exists rather
// than duplicating it: src/world/storyProps.js's recovered-evidence kit (the transmitter) and
// src/game/finale.js's own table of crates and antidote.
import * as THREE from 'three';
import { createGoon } from '../actors/characters.js';
import { createBroadcastRig } from '../world/storyProps.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { PALETTE } from '../config/palette.js';
import { createRng } from '../core/rng.js';
import { ROOF_Y as Y, guestSlots, guestsInView } from './roofSlots.js';

const mat = (color, extra = {}) => toonMaterial({ color, ...extra });
const prop = (geo, color, extra = {}) => { const m = new THREE.Mesh(geo, mat(color, extra)); addHullOutline(m, 0.012); return m; };

// A GCPD floodlight stand: a pole and a lamp box with a lit lens, aimed in toward the roof.
function buildFloodlight() {
  const g = new THREE.Group();
  const pole = prop(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8), 0x3a3f4a);
  pole.position.y = 2.3;
  const box = prop(new THREE.BoxGeometry(1.1, 0.8, 0.5), 0x20232b);
  box.position.y = 4.9;
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
  lens.position.set(0, 4.9, 0.26);
  g.add(pole, box, lens);
  return g;
}

// A searchlight beam: an open additive cone from the roof into the clouds, swept slowly.
function buildSearchlight(color = 0xdfe8ff) {
  const pivot = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 70, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  cone.position.y = 35;
  pivot.add(cone);
  return pivot;
}

function headset() {
  const g = new THREE.Group();
  const band = prop(new THREE.TorusGeometry(0.15, 0.015, 6, 14, Math.PI), 0x14151b);
  band.rotation.z = 0;
  band.position.y = 0.04;
  const boom = prop(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), 0x14151b);
  boom.position.set(0.14, -0.04, 0.06);
  boom.rotation.z = 1.1;
  g.add(band, boom);
  return g;
}

function glasses() {
  const g = new THREE.Group();
  const rim = new THREE.TorusGeometry(0.028, 0.006, 6, 12);
  const m = mat(0x0b0b12);
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(rim, m);
    lens.position.set(side * 0.032, 0, 0.01);
    g.add(lens);
  }
  return g;
}

function goggles() {
  const g = new THREE.Group();
  const rim = new THREE.TorusGeometry(0.04, 0.012, 6, 12);
  const m = mat(0x2a8a5a);
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(rim, m);
    lens.position.set(side * 0.05, 0, 0.01);
    g.add(lens);
  }
  const strap = prop(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 14, 1, true), 0x14151b);
  strap.position.y = 0;
  g.add(strap);
  return g;
}

function buildGuestBody(assets, rng) {
  return createGoon(assets, { type: 'civilian', rng });
}

export function createGcpdRoof({ scene, assets, events, finale }) {
  const rng = createRng(220990);
  const group = new THREE.Group();
  group.name = 'gcpdRoof';
  scene.add(group);

  const guests = []; // { id, made }
  const people = []; // every ch added, for celebrate()
  const pulsers = []; // { mesh, base } emissive lights to pulse
  const sweepers = []; // { pivot, base, speed } searchlights, built on celebrate()
  let rigKit = null, decorated = false, near = true, celebrating = false;

  // Set dressing shared by every guest (the floodlights), built once, the first time anyone is
  // added, so an empty roof never pays for it.
  function decorate() {
    if (decorated) return;
    decorated = true;
    for (const [x, z, yaw] of [[-16, -15, 0.7], [16, -15, -0.7], [-16, 16, 2.4]]) {
      const fl = buildFloodlight();
      fl.position.set(x, Y, z);
      fl.rotation.y = yaw;
      fl.userData.keepFar = true;
      group.add(fl);
    }
  }

  function addNpc(ch, slot) {
    ch.root.position.set(slot.x, Y, slot.z);
    ch.root.rotation.y = slot.yaw ?? 0;
    ch.animator.play('Idle_Talking_Loop', { fade: 0.2 });
    group.add(ch.root);
    people.push(ch);
    return ch;
  }

  const BUILDERS = {
    // The pirate broadcast's engineer, standing at the console of the seized transmitter.
    technician(slot) {
      const ch = addNpc(buildGuestBody(assets, rng), slot);
      ch.bone('Head')?.add(headset());
      rigKit = createBroadcastRig();
      rigKit.position.set(slot.x + 1.4, Y, slot.z - 0.6);
      rigKit.rotation.y = slot.yaw ?? 0;
      group.add(rigKit);
      // Two small status lights beside the console, on top of the kit's own beacon.
      for (const s of [-1, 1]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb02e }));
        bulb.position.set(slot.x + 1.4 + s * 1.1, Y + 1.9, slot.z - 0.6);
        group.add(bulb);
        pulsers.push({ mesh: bulb, base: new THREE.Color(0xffb02e), k: 3 + s });
      }
      return [ch];
    },
    // The Ace Chemicals chemist, in a lab coat with goggles pushed up. Stands beside the antidote
    // case on finale.js's own table instead of bringing a second one.
    chemist(slot) {
      const ch = addNpc(buildGuestBody(assets, rng), slot);
      const coat = prop(new THREE.CylinderGeometry(0.22, 0.28, 0.85, 10), PALETTE.paper);
      coat.position.set(0, -0.15, 0);
      ch.bone('spine_02')?.add(coat);
      const gog = goggles();
      gog.position.set(0, 0.1, 0.1);
      ch.bone('Head')?.add(gog);
      return [ch];
    },
    // The kidnapped news crew: a camera operator, a lamp holder and a reporter.
    newsCrew(slots) {
      const made = [];
      slots.forEach((slot, i) => {
        const ch = addNpc(buildGuestBody(assets, rng), slot);
        if (i === 0) {
          // Shoulder camera: a body with a lens, resting on the shoulder.
          const body = prop(new THREE.BoxGeometry(0.22, 0.24, 0.46), 0x1a1b1f);
          const lens = prop(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 12), 0x3a3f4a);
          lens.rotation.x = Math.PI / 2;
          lens.position.z = 0.3;
          const cam = new THREE.Group();
          cam.add(body, lens);
          cam.position.set(0.2, 0.12, 0.22);
          ch.bone('spine_02')?.add(cam);
        } else if (i === 1) {
          // A lamp on a stand in front of the crew member.
          const lamp = new THREE.Group();
          const pole = prop(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), 0x2a2c32);
          const head = prop(new THREE.BoxGeometry(0.34, 0.26, 0.2), 0x20232b);
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
          pole.position.y = 0.65;
          head.position.y = 1.35;
          glow.position.set(0, 1.35, 0.11);
          lamp.add(pole, head, glow);
          lamp.position.set(0.55, 0, 0.35);
          ch.root.add(lamp);
        } else {
          // A reporter's microphone on a stand.
          const stand = new THREE.Group();
          const pole = prop(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), 0x2a2c32);
          const mic = prop(new THREE.SphereGeometry(0.06, 8, 6), 0x1a1b1f);
          mic.position.y = 0.58;
          pole.position.y = 0.55;
          stand.add(pole, mic);
          stand.position.set(0, 0, 0.4);
          ch.root.add(stand);
        }
        made.push(ch);
      });
      return made;
    },
    gordon(slot) {
      const ch = addNpc(buildGuestBody(assets, rng), slot);
      const coat = prop(new THREE.CylinderGeometry(0.22, 0.28, 0.85, 10), 0x4b586e);
      coat.position.set(0, -0.15, 0);
      ch.bone('spine_02')?.add(coat);
      const specs = glasses();
      specs.position.set(0, 0.02, 0.14);
      ch.bone('Head')?.add(specs);
      return [ch];
    },
    alfred(slot) {
      const ch = addNpc(buildGuestBody(assets, rng), slot);
      const vest = prop(new THREE.BoxGeometry(0.3, 0.42, 0.16), 0x14151b);
      vest.position.set(0, -0.03, 0);
      ch.bone('spine_02')?.add(vest);
      const tray = new THREE.Group();
      const disc = prop(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20), 0xd8dde6);
      const cup = prop(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 10), PALETTE.paper);
      cup.position.set(0.06, 0.03, 0);
      tray.add(disc, cup);
      const hand = ch.bone('hand_l');
      if (hand) { tray.rotation.x = -0.3; hand.add(tray); }
      return [ch];
    },
    nightwing(slot) {
      // Prefer the real Nightwing system when it's merged in (src/allies/nightwing.js's own
      // contract: spawn(p, mode), actor); a simple look-alike otherwise so this roof still works
      // end to end. His own combat AI (updateAlly, run every frame from game.js) keeps steering
      // his animation.
      const nw = window.__game?.nightwing;
      if (nw?.spawn) {
        nw.spawn({ x: slot.x, y: Y, z: slot.z }, 'ally');
        const actor = nw.actor;
        if (actor) people.push(actor);
        return actor ? [actor] : [];
      }
      const ch = addNpc(buildGuestBody(assets, rng), slot);
      const suit = prop(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 10), 0x14151b);
      suit.position.set(0, -0.12, 0);
      ch.bone('spine_02')?.add(suit);
      const chevron = prop(new THREE.CircleGeometry(0.1, 3), PALETTE.detective);
      chevron.position.set(0, 0.15, 0.13);
      chevron.rotation.z = Math.PI;
      ch.bone('spine_02')?.add(chevron);
      const mask = prop(new THREE.BoxGeometry(0.22, 0.05, 0.02), 0x0b0b12);
      mask.position.set(0, 0.02, 0.13);
      ch.bone('Head')?.add(mask);
      return [ch];
    },
    // Rescued civilians, wrapped in foil emergency blankets.
    civilians(slots) {
      return slots.map((slot) => {
        const ch = addNpc(buildGuestBody(assets, rng), slot);
        const blanket = prop(new THREE.BoxGeometry(0.52, 0.3, 0.34), 0xd9a92c);
        blanket.position.set(0, 0.1, 0);
        ch.bone('spine_02')?.add(blanket);
        return ch;
      });
    },
  };

  const api = {
    get guests() { return guests.map((g) => g.id); },
    addGuest(id) {
      if (guests.some((g) => g.id === id)) return false;
      const build = BUILDERS[id];
      if (!build) return false;
      decorate();
      const slots = guestSlots(id);
      const made = build(slots.length > 1 ? slots : slots[0]);
      // The people's ink outline shells come off: a dozen skinned characters, each drawn twice,
      // made the finale the slowest scene in the game (about 7 ms of GPU time on an RTX 4060;
      // draw-bound, so fewer triangles did not help). The ink pass still draws their edges, and
      // side by side they look the same. Only skinned shells: the props keep theirs.
      group.traverse((o) => { if (o.isSkinnedMesh && o.material?.userData?.outline) o.visible = false; });
      guests.push({ id, made });
      events?.emit?.('roofGuest', { id });
      return true;
    },
    celebrate() {
      if (celebrating) { finale?.freeRoam?.(); return; }
      celebrating = true;
      // The roof stands down: searchlights sweep the clouds over the city.
      for (const [x, z, base, speed] of [[-12, -12, 0.35, 0.22], [14, -10, -0.3, -0.18], [2, 14, 0.1, 0.27]]) {
        const beam = buildSearchlight();
        beam.position.set(x, Y, z);
        beam.userData.keepFar = true;
        group.add(beam);
        sweepers.push({ pivot: beam, base, speed, phase: x });
      }
      finale?.freeRoam?.();
      events?.emit?.('roofCelebrate');
    },
    reset() {
      // The real Nightwing (if used) is externally owned: despawn him properly instead of
      // ripping his root out from under src/allies/nightwing.js's own state.
      if (guests.some((g) => g.id === 'nightwing')) window.__game?.nightwing?.despawn?.();
      for (const g of guests) {
        if (g.id === 'nightwing') continue;
        for (const m of g.made) { const root = m?.root ?? m?.ch?.root; if (root?.parent) root.parent.remove(root); }
      }
      guests.length = 0;
      people.length = 0;
      pulsers.length = 0;
      sweepers.length = 0;
      while (group.children.length) group.remove(group.children[0]);
      rigKit = null; decorated = false; celebrating = false;
    },
    update(dt, camPos) {
      // Every frame, not only on a change: a guest can join while the camera is across the city.
      if (camPos) {
        near = guestsInView(camPos);
        for (const c of group.children) if (!c.userData.keepFar) c.visible = near;
      }
      const now = performance.now() / 1000;
      // The searchlights read from anywhere in the city, so they sweep even when the people are hidden.
      for (const s of sweepers) {
        s.pivot.rotation.z = s.base + Math.sin(now * s.speed + s.phase) * 0.22;
        s.pivot.rotation.x = Math.cos(now * s.speed * 0.8 + s.phase) * 0.2;
      }
      if (!near) return;
      // Nobody else advances these people's animations (they are not fighters): without this they
      // stand in the rig's bind pose, arms out, through the whole finale.
      for (const ch of people) ch?.animator?.update?.(dt);
      for (const p of pulsers) p.mesh.material.color.copy(p.base).multiplyScalar(0.6 + Math.sin(now * p.k) * 0.4);
      if (rigKit) rigKit.userData.dish.rotation.y += dt * 0.6;
    },
  };
  return api;
}
