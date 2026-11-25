// What the map remembers in the save (progress.map, registered field; workstream L2):
//   cells   discovered 20 m cells, base64 bitset (src/nav/discovery.js)
//   vistas  ids of vista sites stood on (each reveals a wide circle once)
//   ft      ids of unlocked fast-travel points (src/nav/fastTravel.js)
//   wps     player 1's custom waypoints, [{ x, y, z, c }] (c: colour index)
//   crimes  crimes stopped per district { districtId: count } (the Progress page)
// An old save has no `map`: it loads as the defaults (nothing discovered beyond the old city).
import { registerProgressField } from '../core/save.js';

export const MAX_WAYPOINTS = 6;
const ID = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const DEFAULT_MAP_SAVE = Object.freeze({ cells: '', vistas: [], ft: [], wps: [], crimes: {} });

export function sanitizeMapSave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ids = (v, max) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && ID.test(s)))].slice(0, max) : []);
  const cells = typeof r.cells === 'string' && /^[A-Za-z0-9+/=]{0,4096}$/.test(r.cells) ? r.cells : '';
  const wps = Array.isArray(r.wps)
    ? r.wps.filter((w) => w && num(w.x) && num(w.z) && Math.abs(w.x) < 1e4 && Math.abs(w.z) < 1e4).slice(0, MAX_WAYPOINTS)
      .map((w) => ({ x: w.x, y: num(w.y) ? w.y : 0, z: w.z, c: Number.isInteger(w.c) && w.c >= 0 && w.c < 8 ? w.c : 0 }))
    : [];
  const crimes = {};
  if (r.crimes && typeof r.crimes === 'object' && !Array.isArray(r.crimes)) {
    for (const [k, v] of Object.entries(r.crimes).slice(0, 64)) if (ID.test(k) && Number.isInteger(v) && v > 0) crimes[k] = Math.min(v, 1e6);
  }
  return { cells, vistas: ids(r.vistas, 64), ft: ids(r.ft, 64), wps, crimes };
}

registerProgressField('map', { sanitize: sanitizeMapSave, fresh: { cells: '', vistas: [], ft: [], wps: [], crimes: {} } });
