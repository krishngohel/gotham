// The city's render chunks: a square grid (128 m by default) that every static mesh belongs to,
// so the renderer only touches what is near the camera. Each frame cull(camera position) shows a
// chunk's full-detail meshes within lodDistance, its merged far-LOD silhouette out to
// drawDistance, and nothing past that (the fog has swallowed it by then: FogExp2 0.0062 is 98 %
// fog at 320 m). Frustum culling is three.js's own, per mesh, on the tight bounding spheres the
// chunked merge produces. Collision is not chunked (see collision.js).
//
// Three kinds of member:
//   near   full detail, swapped for the chunk's LOD past lodDistance (facades, props, trim...)
//   lod    the chunk's far silhouette (one draw), shown between lodDistance and drawDistance
//   detail cheap overlays culled on their own box at their own range (ground, lane paint,
//          light pools, halos, ink lines); range 'draw' (default) or 'lod'
// Pure bookkeeping on plain numbers, so it is unit-tested without a GPU; members only need
// `visible` and, for registerBox, a box.
export const CHUNK_SIZE = 128;
const HYST = 6; // metres of hysteresis on the LOD switch, so a chunk does not flicker on the line

export function chunkKey(cx, cz) { return `${cx},${cz}`; }
export function chunkOf(x, z, size = CHUNK_SIZE) { return [Math.floor(x / size), Math.floor(z / size)]; }
// Cheap overlays (ground, lane paint, light pools, glow, halos) group in big 512 m cells offset
// by 256 m, so the whole original city (x +-236, z -236..205) is one cell: one draw per overlay
// material there, as before chunking, while the 4x city still culls them by cell.
export const DETAIL_CELL = 512;
export function detailCellOf(x, z) { return [Math.floor((x + DETAIL_CELL / 2) / DETAIL_CELL), Math.floor((z + DETAIL_CELL / 2) / DETAIL_CELL)]; }

// Distance from a point to an axis-aligned box (0 inside).
export function boxDistance(b, x, y, z) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const emptyBox = () => ({ minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
function grow(b, o) {
  if (o.minX < b.minX) b.minX = o.minX; if (o.minY < b.minY) b.minY = o.minY; if (o.minZ < b.minZ) b.minZ = o.minZ;
  if (o.maxX > b.maxX) b.maxX = o.maxX; if (o.maxY > b.maxY) b.maxY = o.maxY; if (o.maxZ > b.maxZ) b.maxZ = o.maxZ;
}

export function createChunkSet({ size = CHUNK_SIZE } = {}) {
  const chunks = new Map(); // key -> chunk
  const details = [];       // { obj, box, range }
  const visible = [];       // chunks drawn this frame (near or lod), for world.visibleChunks

  function chunk(cx, cz, region = null) {
    const key = chunkKey(cx, cz);
    let c = chunks.get(key);
    if (!c) {
      c = { key, cx, cz, region, near: [], lod: null, box: emptyBox(), state: 'init', distance: Infinity };
      chunks.set(key, c);
    }
    if (region && !c.region) c.region = region;
    return c;
  }

  return {
    size,
    chunks,
    visible,
    chunk,
    // A full-detail member of chunk (cx, cz) with its world box.
    addNear(cx, cz, obj, box, region) { const c = chunk(cx, cz, region); c.near.push(obj); grow(c.box, box); return c; },
    setLod(cx, cz, obj, box, region) { const c = chunk(cx, cz, region); c.lod = obj; grow(c.box, box); obj.visible = false; return c; },
    addDetail(obj, box, range = 'draw') { details.push({ obj, box, range }); },
    // [perf3] Puts each chunk's near members under one container (wrap(chunk, members) moves the
    // ones it can and returns { group, loose }), so the chunk shows and hides as one object: three's
    // scene walk and the ink pipeline's matrix walk then step over a hidden chunk with one check
    // instead of visiting each of its meshes (about 1,500 hidden meshes city-wide). Members it
    // could not move stay in c.near and are toggled one by one as before.
    groupNear(wrap) {
      for (const c of chunks.values()) {
        if (c.group || c.near.length < 2) continue;
        const r = wrap(c, c.near);
        if (!r?.group) continue;
        c.group = r.group;
        c.grouped = { group: r.group, moved: c.near.filter((m) => !r.loose.includes(m)), loose: r.loose, scene: r.group.parent };
        c.near = r.loose;
        c.group.visible = c.state !== 'lod' && c.state !== 'hidden';
      }
    },
    // [perf3] Measurement only (src/dev/perfToggles.js 'chunkGroups'): undo / redo the grouping.
    setGrouped(on) {
      for (const c of chunks.values()) {
        const gi = c.grouped;
        if (!gi || !!c.group === on) continue;
        const shown = c.state !== 'lod' && c.state !== 'hidden';
        if (on) {
          for (const m of gi.moved) { gi.scene.remove(m); m.visible = true; gi.group.add(m); }
          gi.group.visible = shown; c.group = gi.group; c.near = gi.loose;
        } else {
          for (const m of gi.moved) { gi.group.remove(m); m.visible = shown; gi.scene.add(m); }
          c.group = null; c.near = gi.loose.concat(gi.moved);
        }
      }
    },
    // Shows and hides members for a camera at (x, y, z). Allocation-free.
    cull(x, y, z, drawDistance, lodDistance) {
      visible.length = 0;
      for (const c of chunks.values()) {
        const d = boxDistance(c.box, x, y, z);
        c.distance = d;
        let state;
        if (d > drawDistance) state = 'hidden';
        else if (!c.lod) state = 'near';
        else if (c.state === 'lod') state = d < lodDistance - HYST ? 'near' : 'lod';
        else state = d > lodDistance + HYST ? 'lod' : 'near';
        if (state !== c.state) {
          const showNear = state === 'near';
          if (c.group) c.group.visible = showNear;
          for (let i = 0; i < c.near.length; i++) c.near[i].visible = showNear;
          if (c.lod) c.lod.visible = state === 'lod';
          c.state = state;
        }
        if (state !== 'hidden') visible.push(c);
      }
      for (let i = 0; i < details.length; i++) {
        const e = details[i];
        e.obj.visible = boxDistance(e.box, x, y, z) <= (e.range === 'lod' ? lodDistance : drawDistance);
      }
      return visible;
    },
    stats() {
      let near = 0, lod = 0, hidden = 0;
      for (const c of chunks.values()) { if (c.state === 'near') near++; else if (c.state === 'lod') lod++; else hidden++; }
      return { chunks: chunks.size, near, lod, hidden, details: details.length };
    },
  };
}
