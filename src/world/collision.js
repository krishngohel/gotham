// Axis-aligned box world with a dense spatial grid. Characters are vertical cylinders (feet
// position, radius, height). Pure data: no three.js, so it is unit-tested.
//
// Storage (Long Night 2, rendering-performance.md item 7): box bounds live in one Float64Array,
// the grid covering `bounds` is a dense CSR table (cellStart/cellBoxes, Uint32) rebuilt by
// freeze(), and boxes added after the last freeze go into small per-cell lists until the next one.
// Cells outside `bounds` (the harbour freighter, invisible walls) fall back to a Map. The old
// 8 m hash de-duplicated with a fixed Uint32Array(1 << 16) and silently scanned every box past
// 65,536 boxes; `seen` here grows with the box count. Queries visit cells in the same order and
// each cell's boxes in insertion order, exactly as the old hash did, so every answer (including
// which of two equally near boxes a ray reports) is unchanged: tests/unit/collisionGrid.test.js
// checks that against a copy of the old code on the real core city.
//
// Allocation: query/groundBelow/resolveCylinder/raycast use module scratch. resolveCylinder and
// raycast return a fresh result object unless the caller passes `out` (then nothing is allocated).
export function createCollision({ cell = 8, floor = () => 0, bounds = null } = {}) {
  const boxes = [];
  let B = new Float64Array(6 * 4096); // minX, minY, minZ, maxX, maxY, maxZ per box
  let removed = new Uint8Array(4096);
  let seen = new Uint32Array(4096);
  let stamp = 0;

  // Dense grid over `bounds` (in cells). Without bounds everything uses the Map.
  const gi0 = bounds ? Math.floor(bounds.minX / cell) : 0;
  const gj0 = bounds ? Math.floor(bounds.minZ / cell) : 0;
  const GW = bounds ? Math.floor(bounds.maxX / cell) - gi0 + 1 : 0;
  const GH = bounds ? Math.floor(bounds.maxZ / cell) - gj0 + 1 : 0;
  const NC = GW * GH;
  let cellStart = new Uint32Array(NC + 1);
  let cellBoxes = new Uint32Array(0);
  const dyn = new Array(NC).fill(null); // ids added since the last freeze, per cell
  let dynCount = 0;
  const far = new Map(); // cells outside the dense grid: exact key -> ids
  // Movers (Long Night 2, the El trains): boxes that change place every frame. They never enter
  // the grid; each group (one train) keeps an xz bound and a query visits a group's boxes only when
  // that bound overlaps it, so a still city pays one bound test per group per query.
  const moverGroups = [];
  let groundBox = null; // the box groundBelow's answer came from (null: the floor), for carriers
  const farKey = (i, j) => (i + 524288) * 1048576 + (j + 524288);
  const cellOf = (i, j) => {
    const a = i - gi0, b = j - gj0;
    return a >= 0 && a < GW && b >= 0 && b < GH ? a * GH + b : -1;
  };

  function grow(n) {
    if (n <= removed.length) return;
    let cap = removed.length;
    while (cap < n) cap *= 2;
    const nb = new Float64Array(cap * 6); nb.set(B); B = nb;
    const nr = new Uint8Array(cap); nr.set(removed); removed = nr;
    seen = new Uint32Array(cap); stamp = 0;
  }

  function addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = '') {
    const id = boxes.length;
    const box = { minX, minY, minZ, maxX, maxY, maxZ, tag, id };
    boxes.push(box);
    grow(id + 1);
    const o = id * 6;
    B[o] = minX; B[o + 1] = minY; B[o + 2] = minZ; B[o + 3] = maxX; B[o + 4] = maxY; B[o + 5] = maxZ;
    for (let i = Math.floor(minX / cell); i <= Math.floor(maxX / cell); i++) {
      for (let j = Math.floor(minZ / cell); j <= Math.floor(maxZ / cell); j++) {
        const c = cellOf(i, j);
        if (c >= 0) { (dyn[c] ??= []).push(id); dynCount++; }
        else {
          const k = farKey(i, j);
          let list = far.get(k);
          if (!list) far.set(k, list = []);
          list.push(id);
        }
      }
    }
    return box;
  }

  // Packs every per-cell list into the CSR table (counting pass, then fill in id order, so each
  // cell keeps insertion order). Called once the city is built; cheap enough to call again.
  function freeze() {
    if (!NC) return;
    const count = new Uint32Array(NC + 1);
    const lists = new Array(NC);
    for (let c = 0; c < NC; c++) {
      // Old CSR entries first (lower ids), then the newer dynamic ones: insertion order.
      const s = cellStart[c], e = cellStart[c + 1], d = dyn[c];
      let n = 0;
      for (let k = s; k < e; k++) if (!removed[cellBoxes[k]]) n++;
      if (d) for (const id of d) if (!removed[id]) n++;
      count[c] = n;
      lists[c] = d;
    }
    const start = new Uint32Array(NC + 1);
    for (let c = 0; c < NC; c++) start[c + 1] = start[c] + count[c];
    const packed = new Uint32Array(start[NC]);
    for (let c = 0; c < NC; c++) {
      let w = start[c];
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) { const id = cellBoxes[k]; if (!removed[id]) packed[w++] = id; }
      const d = lists[c];
      if (d) for (const id of d) if (!removed[id]) packed[w++] = id;
      dyn[c] = null;
    }
    cellStart = start;
    cellBoxes = packed;
    dynCount = 0;
  }

  // Takes a box out of the world (a cracked wall blown open, a railing torn down). Its id stays
  // reserved so the query stamps stay valid; the grid skips it from now on.
  function removeBox(box) {
    if (!box || box.removed) return false;
    box.removed = true;
    removed[box.id] = 1;
    return true;
  }

  function nextStamp() {
    stamp = (stamp + 1) >>> 0;
    if (stamp === 0) { seen.fill(0); stamp = 1; }
  }

  // Visits one id: skips removed and already-seen boxes, keeps it when its xz box overlaps.
  let qMinX = 0, qMinZ = 0, qMaxX = 0, qMaxZ = 0, qOut = null;
  function visit(id) {
    if (removed[id] || seen[id] === stamp) return;
    seen[id] = stamp;
    const o = id * 6;
    if (B[o + 3] >= qMinX && B[o] <= qMaxX && B[o + 5] >= qMinZ && B[o + 2] <= qMaxZ) qOut.push(boxes[id]);
  }

  function query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    nextStamp();
    qMinX = minX; qMinZ = minZ; qMaxX = maxX; qMaxZ = maxZ; qOut = out;
    const i0 = Math.floor(minX / cell), i1 = Math.floor(maxX / cell);
    const j0 = Math.floor(minZ / cell), j1 = Math.floor(maxZ / cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = cellOf(i, j);
        if (c >= 0) {
          for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) visit(cellBoxes[k]);
          const d = dyn[c];
          if (d) for (let k = 0; k < d.length; k++) visit(d[k]);
        } else {
          const list = far.get(farKey(i, j));
          if (list) for (let k = 0; k < list.length; k++) visit(list[k]);
        }
      }
    }
    for (let g = 0; g < moverGroups.length; g++) {
      const G = moverGroups[g];
      if (G.maxX < minX || G.minX > maxX || G.maxZ < minZ || G.minZ > maxZ) continue;
      for (let k = 0; k < G.ids.length; k++) visit(G.ids[k]);
    }
    qOut = null;
    return out;
  }

  const near = [];
  const rayList = [];

  // Highest walkable surface at or below `y` under a disc of radius r.
  function groundBelow(x, y, z, r = 0.3) {
    let best = floor(x, z);
    if (best > y) best = -Infinity;
    groundBox = null;
    query(x - r, z - r, x + r, z + r, near);
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      if (b.maxY <= y + 1e-6 && b.maxY > best && overXZ(b, x, z, r)) { best = b.maxY; groundBox = b; }
    }
    return best;
  }

  // prevY: feet height last frame. A box whose top was at or below it is floor we fell onto,
  // never a wall, so fast falls land on roofs instead of being shoved out the side.
  // `out` (optional) receives { grounded, groundY, hitWall, ceiling } instead of a new object.
  function resolveCylinder(p, radius, height, opts, out) {
    const stepUp = opts?.stepUp ?? 0.45;
    const prevY = opts?.prevY ?? -Infinity;
    let hitWall = false;
    let ceiling = false;
    query(p.x - radius, p.z - radius, p.x + radius, p.z + radius, near);
    let landing = -Infinity;
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      if (b.maxY <= prevY + 1e-4 && b.maxY > p.y && (b.obb ? overXZ(b, p.x, p.z, radius * 0.6) : p.x > b.minX - radius * 0.6 && p.x < b.maxX + radius * 0.6 && p.z > b.minZ - radius * 0.6 && p.z < b.maxZ + radius * 0.6)) landing = Math.max(landing, b.maxY);
    }
    if (landing > -Infinity) p.y = landing;
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      // Step onto anything low enough; walls are everything taller than a step at the feet.
      if (b.maxY <= p.y + stepUp || b.minY >= p.y + height) continue;
      if (b.obb) { if (pushOutOriented(p, b.obb, radius)) hitWall = true; continue; }
      const cx = Math.min(Math.max(p.x, b.minX), b.maxX);
      const cz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * radius;
        p.z = cz + (dz / d) * radius;
      } else {
        // Center inside the box: leave through the nearest side (first one on a tie).
        const e0 = p.x - b.minX, e1 = b.maxX - p.x, e2 = p.z - b.minZ, e3 = b.maxZ - p.z;
        let m = 0, best = e0;
        if (e1 < best) { m = 1; best = e1; }
        if (e2 < best) { m = 2; best = e2; }
        if (e3 < best) { m = 3; best = e3; }
        if (m === 0) p.x = b.minX - radius;
        else if (m === 1) p.x = b.maxX + radius;
        else if (m === 2) p.z = b.minZ - radius;
        else p.z = b.maxZ + radius;
      }
      hitWall = true;
    }
    // groundBelow re-fills `near` with the boxes under the (pushed) feet; the ceiling check reads
    // that list, as it always has.
    const groundY = groundBelow(p.x, p.y + stepUp, p.z, radius * 0.6);
    let grounded = false;
    if (groundY > -Infinity && p.y <= groundY + 1e-4) { p.y = groundY; grounded = true; }
    // Standing on a mover (a train roof or floor): its carrier moves this body with it next update.
    if (grounded && groundBox && groundBox.carrier) {
      const riders = groundBox.carrier.riders;
      if (riders.indexOf(p) < 0) riders.push(p);
    }
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      if (b.minY > p.y + 0.5 && b.minY < p.y + height && (b.obb ? overXZ(b, p.x, p.z, 0) : p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ)) {
        p.y = b.minY - height;
        ceiling = true;
      }
    }
    const r = out ?? {};
    r.grounded = grounded; r.groundY = groundY; r.hitWall = hitWall; r.ceiling = ceiling;
    return r;
  }

  // Slab test against boxes near the segment. Returns { t, box, normal } or null. With `out`
  // (shaped like the result, normal included) nothing is allocated.
  function raycast(o, d, maxDist, out) {
    const ex = o.x + d.x * maxDist, ez = o.z + d.z * maxDist;
    query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), rayList);
    let bestT = Infinity, bestBox = null, bestAxis = -1, bestSign = 0;
    for (let k = 0; k < rayList.length; k++) {
      const b = rayList[k];
      let tmin = 0, tmax = maxDist, axis = -1, sign = 0;
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
        const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
        const lo = a === 0 ? b.minX : a === 1 ? b.minY : b.minZ;
        const hi = a === 0 ? b.maxX : a === 1 ? b.maxY : b.maxZ;
        if (Math.abs(da) < 1e-9) {
          if (oa < lo || oa > hi) { miss = true; break; }
          continue;
        }
        let t1 = (lo - oa) / da, t2 = (hi - oa) / da, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || axis < 0) continue;
      if (!bestBox || tmin < bestT) { bestT = tmin; bestBox = b; bestAxis = axis; bestSign = sign; }
    }
    rayList.length = 0;
    if (!bestBox) return null;
    const r = out ?? { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
    r.t = bestT; r.box = bestBox;
    r.normal.x = bestAxis === 0 ? bestSign : 0;
    r.normal.y = bestAxis === 1 ? bestSign : 0;
    r.normal.z = bestAxis === 2 ? bestSign : 0;
    return r;
  }

  // A mover group (one train): { minX, minZ, maxX, maxZ, ids }. Keep its bound around its boxes
  // with setGroupBounds whenever they move.
  function addMoverGroup() {
    const G = { minX: 0, minZ: 0, maxX: -1, maxZ: -1, ids: [] };
    moverGroups.push(G);
    return G;
  }
  // A box in a mover group. `carrier` (optional): { riders: [] } that bodies grounded on it join.
  function addMover(group, minX, minY, minZ, maxX, maxY, maxZ, tag = '', carrier = null) {
    const id = boxes.length;
    const box = { minX, minY, minZ, maxX, maxY, maxZ, tag, id, mover: true, carrier };
    boxes.push(box);
    grow(id + 1);
    group.ids.push(id);
    moveBox(box, minX, minY, minZ, maxX, maxY, maxZ);
    return box;
  }
  // Moves a mover box (allocation-free).
  function moveBox(box, minX, minY, minZ, maxX, maxY, maxZ) {
    box.minX = minX; box.minY = minY; box.minZ = minZ; box.maxX = maxX; box.maxY = maxY; box.maxZ = maxZ;
    const o = box.id * 6;
    B[o] = minX; B[o + 1] = minY; B[o + 2] = minZ; B[o + 3] = maxX; B[o + 4] = maxY; B[o + 5] = maxZ;
  }
  // [polish] Moves a mover box that is a rectangle turned by a yaw (an El car in a curve): centre
  // (cx, cz), local x maps to world (cos, -sin) and local z to (sin, cos) (three.js rotation.y),
  // half sizes hx (local x) and hz (local z). The grid and the ray test see its axis-aligned
  // bound; standing, landing, walls and ceilings test the turned rectangle itself, so a curve
  // neither swells a car's floor over its neighbour's nor drops the walls.
  function moveBoxOriented(box, cx, cz, sn, cs, hx, hz, minY, maxY) {
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    const o = box.obb ?? (box.obb = { x: 0, z: 0, s: 0, c: 1, hx: 0, hz: 0 });
    o.x = cx; o.z = cz; o.s = sn; o.c = cs; o.hx = hx; o.hz = hz;
    moveBox(box, cx - ex, minY, cz - ez, cx + ex, maxY, cz + ez);
  }
  function setGroupBounds(G, minX, minZ, maxX, maxZ) { G.minX = minX; G.minZ = minZ; G.maxX = maxX; G.maxZ = maxZ; }

  return {
    addMoverGroup, addMover, moveBox, moveBoxOriented, setGroupBounds,
    addBox, removeBox, freeze, groundBelow, resolveCylinder, raycast, boxes,
    // query(minX, minZ, maxX, maxZ, out?): a new array unless `out` is given (then it is reused).
    query: (a, b, c, d, out) => query(a, b, c, d, out ?? []),
    stats: () => ({ boxes: boxes.length, cells: NC, packed: cellBoxes.length, dynamic: dynCount, farCells: far.size }),
  };
}

// [polish] Is (x, z) over box b's footprint, grown by r? Oriented movers test their own rectangle.
function overXZ(b, x, z, r) {
  const o = b.obb;
  if (!o) return x >= b.minX - r && x <= b.maxX + r && z >= b.minZ - r && z <= b.maxZ + r;
  const dx = x - o.x, dz = z - o.z;
  const u = dx * o.c - dz * o.s, w = dx * o.s + dz * o.c;
  return u >= -o.hx - r && u <= o.hx + r && w >= -o.hz - r && w <= o.hz + r;
}
// [polish] Pushes a cylinder (feet p, radius) out of an oriented rectangle; true if it moved.
function pushOutOriented(p, o, radius) {
  const dx = p.x - o.x, dz = p.z - o.z;
  const u = dx * o.c - dz * o.s, w = dx * o.s + dz * o.c;
  const cu = Math.min(Math.max(u, -o.hx), o.hx), cw = Math.min(Math.max(w, -o.hz), o.hz);
  const du = u - cu, dw = w - cw, d2 = du * du + dw * dw;
  if (d2 >= radius * radius) return false;
  let nu = u, nw = w;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nu = cu + (du / d) * radius; nw = cw + (dw / d) * radius;
  } else {
    const e0 = u + o.hx, e1 = o.hx - u, e2 = w + o.hz, e3 = o.hz - w;
    let m = 0, best = e0;
    if (e1 < best) { m = 1; best = e1; }
    if (e2 < best) { m = 2; best = e2; }
    if (e3 < best) { m = 3; best = e3; }
    if (m === 0) nu = -o.hx - radius; else if (m === 1) nu = o.hx + radius;
    else if (m === 2) nw = -o.hz - radius; else nw = o.hz + radius;
  }
  p.x = o.x + nu * o.c + nw * o.s;
  p.z = o.z - nu * o.s + nw * o.c;
  return true;
}
