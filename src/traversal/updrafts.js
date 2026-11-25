// Rising air for the wingsuit and the glide (workstream L3, `[move]`). Pure data hooks: columns
// over steam stacks and vents, and a band of lake breeze lifting off the seawall. The weather
// (workstream M) may add gusts through `environment.wind` ({ x, z, gust }); nothing here needs it.
//
//   column  { kind: 'column', x, z, r, y0, top, strength }   strongest at the centre, fading to the
//           rim and toward `top`
//   band    { kind: 'band', x0, z0, x1, z1, half, y0, top, strength }   a strip along a line
//           (the lakefront), lift across its whole width, fading to its edges
// Other workstreams add zones with addUpdrafts (a crime's burning car, a story set piece).
import { SHORE_X } from '../world/regions/eastLayout.js';

// The lakefront breeze: along the seawall north of the river to the museum campus.
export const LAKE_BAND = Object.freeze({ kind: 'band', x0: SHORE_X + 4, z0: -780, x1: SHORE_X + 4, z1: 190, half: 22, y0: -1, top: 70, strength: 4.5 });

// Zones from the city's steam sources ({ x, y, z, s }: src/world/cityBuilder.js ctx.steam). Only
// the larger stacks and roof vents lift a body; street manhole puffs are too small.
export function steamUpdrafts(steam = [], { minSize = 0.9 } = {}) {
  const out = [];
  for (const s of steam) {
    if (s.vent || (s.s ?? 1) < minSize) continue;
    out.push({ kind: 'column', x: s.x, z: s.z, r: 4 + 2.5 * (s.s ?? 1), y0: s.y ?? 0, top: (s.y ?? 0) + 45, strength: 7 + 3 * Math.min(2, s.s ?? 1) });
  }
  return out;
}

// m/s of lift at a point.
export function updraftAt(zones, x, y, z) {
  let lift = 0;
  for (let i = 0; i < zones.length; i++) {
    const u = zones[i];
    if (y < u.y0 - 2 || y > u.top) continue;
    let across;
    if (u.kind === 'band') {
      const dx = u.x1 - u.x0, dz = u.z1 - u.z0, L2 = dx * dx + dz * dz || 1;
      const t = ((x - u.x0) * dx + (z - u.z0) * dz) / L2;
      if (t < 0 || t > 1) continue;
      const d = Math.hypot(x - (u.x0 + dx * t), z - (u.z0 + dz * t));
      if (d > u.half) continue;
      across = 1 - (d / u.half) ** 2;
    } else {
      const d = Math.hypot(x - u.x, z - u.z);
      if (d > u.r) continue;
      across = 1 - (d / u.r) ** 2;
    }
    const fade = Math.min(1, (u.top - y) / 12);
    lift += u.strength * across * fade;
  }
  return lift;
}

// A small spatial bucket so a city's worth of columns costs a handful of checks per frame.
export function createUpdraftField(zones = [], cell = 64) {
  const bands = [];
  const cells = new Map();
  const key = (i, j) => i * 100003 + j;
  const scratch = [];
  function add(list) {
    for (const u of list) {
      if (u.kind === 'band') { bands.push(u); continue; }
      const i0 = Math.floor((u.x - u.r) / cell), i1 = Math.floor((u.x + u.r) / cell);
      const j0 = Math.floor((u.z - u.r) / cell), j1 = Math.floor((u.z + u.r) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let c = cells.get(k);
        if (!c) cells.set(k, (c = []));
        c.push(u);
      }
    }
  }
  add(zones);
  return {
    add,
    get bands() { return bands; },
    at(x, y, z) {
      const c = cells.get(key(Math.floor(x / cell), Math.floor(z / cell)));
      scratch.length = 0;
      if (c) for (let i = 0; i < c.length; i++) scratch.push(c[i]);
      for (let i = 0; i < bands.length; i++) scratch.push(bands[i]);
      return updraftAt(scratch, x, y, z);
    },
  };
}
