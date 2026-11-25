// A night's predator rooms. They run on the existing stealth runtime (src/stealth/stealthSystem.js:
// patrol routes, sight, silent takedowns, the alarm), handed over as the encounter's `room` so the
// shared ROOMS table (and the core city's boot-time scenery) never changes. The scenery is simple
// arena dressing built lazily the first time the night loads: crates for cover (with collision)
// and lamp posts where the room's lights are. Perches come from the city itself (rooftop edges,
// gargoyles near the room); a room needs none to work.
//
// Room data (docs/design/story-format.md 5): { id, site, entry, radius, bounds?, lights: [{ x, y,
// z, r }], cover: [{ x, y, z, w, d, h }], vent?: { x, y, z, w, d }, huddle?: { x, y, z },
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
  if (!night?.rooms) return;
  const G = typeof window !== 'undefined' ? window.__game : null;
  const scene = G?.scene, collision = G?.world?.collision;
  if (!scene || !collision) return;
  for (const room of Object.values(night.rooms)) {
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
    scene.add(group);
  }
}
