// A night's predator rooms. They run on the existing stealth runtime (src/stealth/stealthSystem.js:
// patrol routes, sight, silent takedowns, the alarm), handed over as the encounter's `room` so the
// shared ROOMS table (and the core city's boot-time scenery) never changes. The scenery is simple
// arena dressing built lazily the first time the night loads: crates for cover (with collision)
// and lamp posts where the room's lights are. Perches come from the city itself (rooftop edges,
// gargoyles near the room); a room needs none to work.
//
// Room data (docs/design/story-format.md 5): { id, site, entry, radius, bounds?, lights: [{ x, y,
// z, r, post?, fill? }], fill?: [{ x, y, z, color, intensity, distance, reach, pool }], cover: [{ x, y, z, w, d, h }], vent?: { x, y, z, w, d }, huddle?: { x, y, z },
// squad: [{ type, route: { mode: 'pingpong'|'loop', points: [{ x, y, z, wait, face }] } }] }.
import * as THREE from 'three';
import { toonMaterial, addHullOutline } from '../render/toon.js';

const built = new Set();

export const W = (x, y, z, wait = 0, face = null) => ({ x, y, z, wait, face });
export const route = (mode, ...points) => ({ mode, points });

// The encounter definition for a room: one wave, each goon on its route's first point.
export function roomFight(room, site) {
  const at = site(room.site) ?? room.site;
  const squad = room.squad;
  const full = { perches: [], decks: [], posts: [], columns: [], rails: [], doors: [], lights: [], cover: [], vent: null, ...room, encore: room.encore ?? room.squad };
  return {
    site: at, radius: room.radius ?? 18, entry: room.entry, stealth: room.id, room: full, squad: 'main', gang: room.gang,
    waves: [squad.map((g) => { const p = g.route.points[0]; return { type: g.type, dx: p.x - at.x, dz: p.z - at.z, y: p.y }; })],
  };
}

// Builds a night's room dressing once (crates, lamp posts), the first time the night loads.
export function registerNightRooms(night) {
  // [missions] `night.lit`: [{ id, fill, lights? }] lights an open-air set piece (a street fight) the
  // same way a room's `fill` does, with no squad or cover of its own.
  if (!night?.rooms && !night?.lit) return;
  const G = typeof window !== 'undefined' ? window.__game : null;
  const scene = G?.scene, collision = G?.world?.collision;
  if (!scene || !collision) return;
  for (const room of [...Object.values(night.rooms ?? {}), ...(night.lit ?? [])]) {
    if (built.has(room.id)) continue;
    built.add(room.id);
    const group = new THREE.Group();
    group.name = `room:${room.id}`;
    const crateMat = toonMaterial({ color: 0x6b4a2e });
    for (const c of room.cover ?? []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.w ?? 1.6, c.h ?? 1.4, c.d ?? 1.6), crateMat);
      m.position.set(c.x, c.y + (c.h ?? 1.4) / 2, c.z);
      addHullOutline(m, 0.02);
      group.add(m);
      const w = (c.w ?? 1.6) / 2, d = (c.d ?? 1.6) / 2;
      collision.addBox(c.x - w, c.y, c.z - d, c.x + w, c.y + (c.h ?? 1.4), c.z + d, 'stealthCover');
    }
    const postMat = toonMaterial({ color: 0x2b2b30 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd58a });
    for (const l of room.lights ?? []) {
      if (!l.post) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, l.y - (l.base ?? 0), 6), postMat);
      post.position.set(l.x, (l.y + (l.base ?? 0)) / 2, l.z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat);
      bulb.position.set(l.x, l.y, l.z);
      group.add(post, bulb);
    }
    // [missions] `fill`: broad soft lights for the room, as spots in the shared light pool (no new
    // lights in the scene: src/world/lightPool.js), so a night-time room keeps the hero, the squad
    // and the cover readable. { x, y, z, color, intensity, distance }
    if (room.fill) {
      // On every tier (the potato tier has no pool lights at all): a soft pool of light painted on
      // the ground under each lamp and a broad faint one under each fill, unlit and additive, so
      // the hero, the squad and the crates stand out against a lit floor rather than a black one.
      const pools = [...(room.lights ?? []).map((l) => ({ x: l.x, y: (l.base ?? 0), z: l.z, r: (l.r ?? 4) * 1.1, k: 0.16, color: 0xffd58a })),
        ...room.fill.map((f) => ({ x: f.x, y: f.ground ?? room.cover?.[0]?.y ?? 0, z: f.z, r: f.pool ?? (f.reach ?? 26) * 0.75, k: 0.06, color: f.color ?? 0xffe2b0 }))];
      for (const q of pools) {
        if (!(q.r > 0)) continue;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(q.r, 24), new THREE.MeshBasicMaterial({ color: q.color, transparent: true, opacity: q.k, blending: THREE.AdditiveBlending, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(q.x, q.y + 0.04 + (q.k < 0.1 ? 0 : 0.01), q.z);
        disc.renderOrder = 2;
        group.add(disc);
      }
      // Each fill holds a pool slot while the focus is inside its box (`reach` metres around it).
      if (room.fill.length) G.world?.lightPool?.addSpots?.(room.fill.map((f) => {
        const r = f.reach ?? 26;
        return { color: 0xffe2b0, intensity: 85, distance: 60, decay: 1.2, ...f, room: { minX: f.x - r, maxX: f.x + r, minY: f.y - 18, maxY: f.y + 8, minZ: f.z - r, maxZ: f.z + r } };
      }));
    }
    scene.add(group);
    // [m45] A lamp marked `fill` also joins the world's light pool (a spot the fixed pool may pick
    // when the player is near: no new light is created), so an outdoor room at night reads clearly
    // on the tiers that have lights at all. Rooms without the flag are unchanged.
    const fills = (room.lights ?? []).filter((l) => l.fill).map((l) => ({ x: l.x, y: l.y, z: l.z, color: l.color ?? 0xffd58a, intensity: l.intensity ?? 18, distance: l.distance ?? 16 }));
    if (fills.length) G.world?.lightPool?.addSpots?.(fills);
  }
}
