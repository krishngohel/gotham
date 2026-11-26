// [verify] The GCPD units on the wire (online co-op): the host packs what a guest must see and be
// chased by into a small JSON blob for net.registerState('police') (src/net/share.js, <= 4 KiB,
// sent only when it changes); the guest unpacks it into puppet targets that units.js draws. Pure.
//
// Blob: { c: [[slot, van?1:0, x, y, z, yaw, flags]], o: [[slot, x, y, z, yaw, pose]],
//         h: 0 | [x, y, z, yaw, lx, ly, lz, r, spot?1:0], r: [[x, y, z, yaw, halfWidth]], s: 0 | [x, y, z, yaw, halfWidth] }
// Positions in decimetres, angles in centiradians (integers: a 6-cruiser, 10-officer pursuit with
// the helicopter is ~0.6 KiB; at 8 Hz that is ~40 kbit/s, inside the ~150 kbit/s host->guest budget
// of docs/design/online-coop.md). Cruiser flags: 1 siren, 2 stunned. Officer pose: POSE below.
const dm = (v) => Math.round((+v || 0) * 10);
const cr = (v) => Math.round((+v || 0) * 100);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export const POSE = Object.freeze({ stand: 0, run: 1, aim: 2, down: 3, talk: 4, walk: 5 });
const MAX_POSE = 5;

// The pose a guest should play: read from the clip the host's officer is playing (units.js picks
// it from lists like RUN = ['Run_Loop', 'Civ_Jog', ...]).
export function officerPose(o) {
  if (o.stun > 0 || o.restrained) return POSE.down;
  const c = o.clip ?? '';
  if (/Run|Jog/.test(c)) return POSE.run;
  if (/Walk/.test(c)) return POSE.walk;
  if (/Pistol|Point/.test(c)) return POSE.aim;
  if (/Crouch|Scared/.test(c)) return POSE.down;
  if (/Argue|Look/.test(c)) return POSE.talk;
  return POSE.stand;
}

export function packUnits({ cruisers = [], officers = [], heli = null, roadblocks = [], spike = null } = {}) {
  const c = [], o = [], r = [];
  for (const u of cruisers) if (u.active) c.push([u.i ?? c.length, u.type === 'police_van' ? 1 : 0, dm(u.x), dm(u.y), dm(u.z), cr(u.yaw), (u.siren ? 1 : 0) | (u.stun > 0 ? 2 : 0)]);
  for (const u of officers) if (u.active) o.push([u.i ?? o.length, dm(u.x), dm(u.y), dm(u.z), cr(u.yaw), officerPose(u)]);
  for (const b of roadblocks) r.push([dm(b.x), dm(b.y), dm(b.z), cr(b.yaw), dm(b.halfWidth)]);
  const h = heli?.active ? [dm(heli.x), dm(heli.y), dm(heli.z), cr(heli.yaw), dm(heli.light.x), dm(heli.light.y), dm(heli.light.z), dm(heli.light.r), heli.mode !== 'leave' && heli.mode !== 'arrive' ? 1 : 0] : 0;
  const s = spike?.active && !spike.hit ? [dm(spike.x), dm(spike.y), dm(spike.z), cr(spike.yaw), dm(spike.halfWidth)] : 0;
  return { c, o, h, r, s };
}

// Never throws; drops malformed rows. Slots are clamped to the guest's own pools.
export function unpackUnits(blob, { maxCruisers = 6, maxOfficers = 10, maxRoadblocks = 6 } = {}) {
  const out = { cruisers: [], officers: [], heli: null, roadblocks: [], spike: null };
  if (!blob || typeof blob !== 'object') return out;
  const rows = (a) => (Array.isArray(a) ? a.filter((x) => Array.isArray(x)) : []);
  for (const a of rows(blob.c)) {
    const slot = a[0] | 0;
    if (slot < 0 || slot >= maxCruisers || out.cruisers.some((q) => q.slot === slot)) continue;
    out.cruisers.push({ slot, van: a[1] === 1, x: num(a[2]) / 10, y: num(a[3]) / 10, z: num(a[4]) / 10, yaw: num(a[5]) / 100, siren: !!(a[6] & 1), stunned: !!(a[6] & 2) });
  }
  for (const a of rows(blob.o)) {
    const slot = a[0] | 0;
    if (slot < 0 || slot >= maxOfficers || out.officers.some((q) => q.slot === slot)) continue;
    out.officers.push({ slot, x: num(a[1]) / 10, y: num(a[2]) / 10, z: num(a[3]) / 10, yaw: num(a[4]) / 100, pose: Math.max(0, Math.min(MAX_POSE, a[5] | 0)) });
  }
  if (Array.isArray(blob.h)) {
    const a = blob.h;
    out.heli = { x: num(a[0]) / 10, y: num(a[1]) / 10, z: num(a[2]) / 10, yaw: num(a[3]) / 100, light: { x: num(a[4]) / 10, y: num(a[5]) / 10, z: num(a[6]) / 10, r: num(a[7], 70) / 10 }, spot: a[8] === 1 };
  }
  for (const a of rows(blob.r).slice(0, maxRoadblocks)) out.roadblocks.push({ x: num(a[0]) / 10, y: num(a[1]) / 10, z: num(a[2]) / 10, yaw: num(a[3]) / 100, halfWidth: num(a[4], 60) / 10 });
  if (Array.isArray(blob.s)) { const a = blob.s; out.spike = { x: num(a[0]) / 10, y: num(a[1]) / 10, z: num(a[2]) / 10, yaw: num(a[3]) / 100, halfWidth: num(a[4], 50) / 10 }; }
  return out;
}

// Shortest-way angle blend (puppets turn smoothly between 8 Hz updates).
export function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
