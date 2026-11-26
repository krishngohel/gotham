// Invisible walls around the union of the regions' land (plus the harbour strip the core always
// let you reach), so the playable edge follows the region list instead of four hand-placed boxes.
// Pure: rasterises the union on a 2 m grid, marks every uncovered cell within `thick` cells of a
// covered one, and merges the marked cells into as few boxes as it can. Region rects are on even
// metres, so the walls sit exactly on their edges.
export function boundaryWalls(rects, { cell = 2, thick = 3 } = {}) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const r of rects) { b.minX = Math.min(b.minX, r.minX); b.maxX = Math.max(b.maxX, r.maxX); b.minZ = Math.min(b.minZ, r.minZ); b.maxZ = Math.max(b.maxZ, r.maxZ); }
  const pad = (thick + 1) * cell;
  const x0 = Math.floor((b.minX - pad) / cell) * cell, z0 = Math.floor((b.minZ - pad) / cell) * cell;
  const W = Math.ceil((b.maxX + pad - x0) / cell), H = Math.ceil((b.maxZ + pad - z0) / cell);
  const covered = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const cz = z0 + (j + 0.5) * cell;
    for (let i = 0; i < W; i++) {
      const cx = x0 + (i + 0.5) * cell;
      // Half-open on each axis: a cell centred exactly on an edge two rects share (the core's odd
      // seawall line, z 205) belongs to one of them instead of falling between both as a wall.
      for (const r of rects) if (cx >= r.minX && cx < r.maxX && cz >= r.minZ && cz < r.maxZ) { covered[j * W + i] = 1; break; }
    }
  }
  const wall = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (covered[j * W + i]) continue;
    let near = false;
    for (let dj = -thick; dj <= thick && !near; dj++) for (let di = -thick; di <= thick; di++) {
      const a = i + di, c = j + dj;
      if (a >= 0 && a < W && c >= 0 && c < H && covered[c * W + a]) { near = true; break; }
    }
    if (near) wall[j * W + i] = 1;
  }
  // Runs along x per row, then stack identical runs on consecutive rows.
  const out = [];
  let open = new Map(); // "i0,i1" -> box being grown
  for (let j = 0; j < H; j++) {
    const next = new Map();
    for (let i = 0; i < W;) {
      if (!wall[j * W + i]) { i++; continue; }
      let e = i;
      while (e < W && wall[j * W + e]) e++;
      const key = `${i},${e}`;
      const box = open.get(key) ?? { minX: x0 + i * cell, maxX: x0 + e * cell, minZ: z0 + j * cell, maxZ: 0 };
      box.maxZ = z0 + (j + 1) * cell;
      next.set(key, box);
      open.delete(key);
      i = e;
    }
    for (const bx of open.values()) out.push(bx);
    open = next;
  }
  for (const bx of open.values()) out.push(bx);
  return out;
}

// True when (x, z) is inside one of the rects (used by tests and the world's own checks).
export const insideAny = (rects, x, z) => rects.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
