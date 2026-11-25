// A fixed handful of real point lights, reassigned to the light spots that matter most to the
// player right now. Everything else in the city glows with emissive colour, halos and pool decals.
//
// Why a fixed count: every lit shader is compiled with the number of point lights in the scene and
// loops over all of them for every fragment, even at intensity 0. Adding, removing or hiding a
// light changes that number and recompiles every lit program (a visible hitch). So the pool size is
// set once per quality tier (quality.lights: 0 / 2 / 4 / 6 / 8) and never changes at runtime; only
// positions, colours, intensities, ranges and decays (all uniforms) move.
//
// Room fills (interiors.js) used to be 14 extra always-on lights that every outdoor fragment paid
// for. They are now spots in this pool: each room's fills are merged into one broad "room light"
// (see mergeRoomFills), which takes the first slot whenever the player is in or near that room.
//
// The finale's Batsignal flash is an override: while `flash.intensity > 0` it takes slot 0.
//
// Reassignment fades a slot out and the new spot in over FADE seconds, so lights never pop.
import * as THREE from 'three';

const RESORT = 0.2;   // seconds between re-ranking the spots
const FADE = 0.18;    // seconds for a slot to fade fully in or out
const RANGE = 90;     // spots farther than this from the focus are never considered
const ROOM_MARGIN = 10; // a room's light is held a little past its walls, so it is already on at the door

// Nearest spots win (height counts half, as before the pool had tiers): a lamp lights the wall
// around itself, which the camera sees even when its light never reaches the player, so ranking by
// light *at the player* dropped lamps the old nearest-first pool kept. Zero past RANGE. Pure.
export function spotScore(s, fx, fy, fz) {
  const dx = s.x - fx, dy = s.y - fy, dz = s.z - fz;
  const d2 = dx * dx + dy * dy * 0.5 + dz * dz;
  if (d2 > RANGE * RANGE) return 0;
  return 1 / Math.max(d2, 1);
}

function inRoomBox(b, x, y, z, m) {
  return x >= b.minX - m && x <= b.maxX + m && y >= b.minY - 2 && y <= b.maxY + m && z >= b.minZ - m && z <= b.maxZ + m;
}

// Picks up to `count` spot indices for focus (fx, fy, fz) into `out` (an Int32Array, -1 = empty),
// best first. A spot with `room` bounds that contain the focus (plus a margin) always wins.
// `scores` is caller-owned scratch (Float32Array, count long). Allocates nothing.
export function pickSpots(spots, fx, fy, fz, count, out, scores) {
  for (let i = 0; i < count; i++) { out[i] = -1; scores[i] = 0; }
  if (!count) return out;
  for (let s = 0; s < spots.length; s++) {
    const spot = spots[s];
    let sc = spotScore(spot, fx, fy, fz);
    if (spot.room && inRoomBox(spot.room, fx, fy, fz, ROOM_MARGIN)) sc += 1e6;
    if (!(sc > 0)) continue;
    if (out[count - 1] >= 0 && sc <= scores[count - 1]) continue;
    // Insertion into the short sorted list.
    let k = count - 1;
    while (k > 0 && (out[k - 1] < 0 || scores[k - 1] < sc)) { out[k] = out[k - 1]; scores[k] = scores[k - 1]; k--; }
    out[k] = s; scores[k] = sc;
  }
  return out;
}

// Merges each room's fill lights into one broad light at their intensity-weighted centre, with the
// summed intensity and the largest range. `roomOf(fill)` returns the room bounds the fill belongs
// to (or null for a fill outside any room, which stays a plain spot). Pure; runs once at boot.
export function mergeRoomFills(fills, roomOf) {
  const byRoom = new Map();
  const out = [];
  for (const f of fills) {
    const room = roomOf(f);
    if (!room) { out.push({ ...f }); continue; }
    if (!byRoom.has(room)) byRoom.set(room, []);
    byRoom.get(room).push(f);
  }
  const c = new THREE.Color();
  for (const [room, list] of byRoom) {
    let w = 0, x = 0, y = 0, z = 0, r = 0, g = 0, b = 0, dist = 0, decay = 0;
    for (const f of list) {
      const k = f.intensity;
      w += k; x += f.x * k; y += f.y * k; z += f.z * k;
      c.set(f.color);
      r += c.r * k; g += c.g * k; b += c.b * k;
      dist = Math.max(dist, f.distance);
      decay += (f.decay ?? 2) * k;
    }
    out.push({ x: x / w, y: y / w, z: z / w, color: c.setRGB(r / w, g / w, b / w).getHex(), intensity: w, distance: dist, decay: decay / w, room });
  }
  return out;
}

// flash: an object with { intensity, position, color, distance, decay } (world.flashLight).
export function createLightPool(scene, spots, count = 4, { flash = null } = {}) {
  const lights = Array.from({ length: count }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    scene.add(l);
    return l;
  });
  // Per slot: the spot index it shows and how far faded in it is (0..1). `want` is the ranked set.
  const slotSpot = new Int32Array(count).fill(-1);
  const level = new Float32Array(count);
  const want = new Int32Array(count).fill(-1);
  const scores = new Float32Array(count);
  let timer = 0;

  function wanted(s) { for (let i = 0; i < count; i++) if (want[i] === s) return true; return false; }
  function shown(s) { for (let i = 0; i < count; i++) if (slotSpot[i] === s) return true; return false; }

  return {
    lights,
    get count() { return count; },
    // [bruce] Lazily built interiors (src/bruce/pockets.js) add their spots when first built; the
    // pool's light count never changes, only what it can pick from.
    addSpots(list) { for (const s of list ?? []) spots.push(s); timer = 0; },
    update(dt, focus) {
      if (!count) return;
      timer -= dt;
      if (timer <= 0) {
        timer = RESORT;
        pickSpots(spots, focus.x, focus.y, focus.z, count, want, scores);
      }
      // Wanted spots not shown yet claim free slots (a slot frees once its old spot faded out).
      for (let w = 0; w < count; w++) {
        const s = want[w];
        if (s < 0 || shown(s)) continue;
        for (let i = 0; i < count; i++) if (slotSpot[i] < 0) { slotSpot[i] = s; level[i] = 0; break; }
      }
      // dt 0 (boot, photo mode): jump straight to the wanted set; normal play fades.
      const step = dt > 0 ? dt / FADE : 0;
      for (let i = 0; i < count; i++) {
        const l = lights[i];
        const s = slotSpot[i];
        if (s < 0) { l.intensity = 0; continue; }
        const keep = wanted(s);
        level[i] = keep ? (dt > 0 ? Math.min(1, level[i] + step) : 1) : Math.max(0, level[i] - step);
        if (!keep && (level[i] <= 0 || dt === 0)) { slotSpot[i] = -1; l.intensity = 0; continue; }
        const spot = spots[s];
        l.position.set(spot.x, spot.y, spot.z);
        l.color.set(spot.color);
        l.distance = spot.distance;
        l.decay = spot.decay ?? 2;
        l.intensity = spot.intensity * level[i];
      }
      // The finale flash borrows slot 0 for as long as it burns.
      if (flash && flash.intensity > 0) {
        const l = lights[0];
        l.position.copy(flash.position);
        l.color.copy(flash.color);
        l.distance = flash.distance;
        l.decay = flash.decay;
        l.intensity = flash.intensity;
      }
    },
  };
}
