// Fog of war for the city map (workstream L2). Pure.
//
// Two levels: a district the story has visited (progress.districts) shows its streets and tint;
// a 20 m cell any local player has been near (or seen from a vista) shows everything. The old
// city (region 'core') was always on the Progress page, so it starts revealed.
//
// Saved as a bitset (one bit per cell, row-major over CITY_BOUNDS) in progress.map.cells, as
// base64 text (about 700 characters for the whole city).
export const DISCOVERY_CELL = 20;
// Proximity reveal radius: on the street, plus height above the ground (a roof sees farther).
export const REVEAL = { base: 70, perMetreUp: 1.4, max: 220, vista: 260, vistaReach: 8 };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bitsToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}
export function base64ToBits(s, length) {
  const out = new Uint8Array(length);
  if (typeof s !== 'string') return out;
  let o = 0;
  for (let i = 0; i + 3 < s.length + 0 && o < length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => { const ch = s[i + k]; const idx = B64.indexOf(ch); return idx < 0 ? 0 : idx; });
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    if (o < length) out[o++] = (n >> 16) & 255;
    if (o < length && s[i + 2] !== '=') out[o++] = (n >> 8) & 255;
    if (o < length && s[i + 3] !== '=') out[o++] = n & 255;
  }
  return out;
}

// bounds: { minX, maxX, minZ, maxZ }. cells: saved base64 (or nothing). alwaysAt(x, z): true where
// the map is always revealed (the old city).
export function createDiscovery({ bounds, cell = DISCOVERY_CELL, cells = '', alwaysAt = null } = {}) {
  const nx = Math.ceil((bounds.maxX - bounds.minX) / cell), nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const bytes = base64ToBits(cells, Math.ceil((nx * nz) / 8));
  const always = new Uint8Array(nx * nz);
  if (alwaysAt) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) always[j * nx + i] = alwaysAt(bounds.minX + (i + 0.5) * cell, bounds.minZ + (j + 0.5) * cell) ? 1 : 0;
  let version = 0;
  const get = (k) => (bytes[k >> 3] >> (k & 7)) & 1;
  const api = {
    nx, nz, cell, bounds,
    get version() { return version; },
    // Index of the cell at (x, z), or -1 off the map.
    index(x, z) {
      const i = Math.floor((x - bounds.minX) / cell), j = Math.floor((z - bounds.minZ) / cell);
      return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
    },
    revealedIndex(k) { return k >= 0 && (always[k] === 1 || get(k) === 1); },
    isRevealed(x, z) { return api.revealedIndex(api.index(x, z)); },
    // Reveals every cell whose centre is within r of (x, z). Returns how many were new.
    reveal(x, z, r) {
      const i0 = Math.max(0, Math.floor((x - r - bounds.minX) / cell)), i1 = Math.min(nx - 1, Math.floor((x + r - bounds.minX) / cell));
      const j0 = Math.max(0, Math.floor((z - r - bounds.minZ) / cell)), j1 = Math.min(nz - 1, Math.floor((z + r - bounds.minZ) / cell));
      let n = 0;
      for (let j = j0; j <= j1; j++) {
        const cz = bounds.minZ + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const cx = bounds.minX + (i + 0.5) * cell;
          if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
          const k = j * nx + i;
          if (get(k)) continue;
          bytes[k >> 3] |= 1 << (k & 7);
          n++;
        }
      }
      if (n) version++;
      return n;
    },
    // Share of the cells inside `rects` that are revealed (0..1).
    fractionIn(rects) {
      let all = 0, seen = 0;
      for (const r of rects) {
        for (let z = r.minZ + cell / 2; z < r.maxZ; z += cell) for (let x = r.minX + cell / 2; x < r.maxX; x += cell) {
          all++;
          if (api.isRevealed(x, z)) seen++;
        }
      }
      return all ? seen / all : 0;
    },
    toBase64: () => bitsToBase64(bytes),
    reset() { bytes.fill(0); version++; },
  };
  return api;
}

// The radius a player at height `above` (metres over the ground) reveals.
export function revealRadius(above = 0, R = REVEAL) {
  return Math.min(R.max, R.base + Math.max(0, above) * R.perMetreUp);
}

// The fog level of a cell for the painters: 0 clear, 1 street-level (district visited), 2 dark.
export function fogLevel(revealed, districtVisited) {
  return revealed ? 0 : districtVisited ? 1 : 2;
}
