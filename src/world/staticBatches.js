// Folds the city's loose per-object draws into chunked batches once a region is built:
//   - ink lines (roof-to-roof wires, string-light cables, zip-line cables, Neon Row's strings):
//     every static Line/LineSegments of one colour and layer becomes one LineSegments per chunk,
//     culled at the LOD distance (a 1-pixel line past 160 m is invisible in the fog anyway);
//   - textured sign planes (neon signs, graffiti, wanted posters): planes that share every material
//     setting but their texture are packed into one atlas per setting, then merged into one mesh
//     per chunk (signs whose material flickers stay separate, the flicker animates their opacity);
//   - light spots (the points the light pool parks its real lights on) get a chunk index, so the
//     pool looks at the spots around the player instead of scanning the whole city.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE, chunkOf } from './chunks.js';

const v = new THREE.Vector3();

// Static lines added to `scene` from child index `from` on (one region's build).
export function mergeStaticLines(scene, from, chunkSet, region = null) {
  const groups = new Map();
  const victims = [];
  const kids = scene.children.slice(from);
  for (const o of kids) {
    if (!(o.isLine || o.isLineSegments) || o.userData.dynamic || o.children.length) continue;
    const m = o.material;
    if (!m || !m.isLineBasicMaterial || m.transparent || m.vertexColors) continue;
    const pos = o.geometry.attributes.position;
    if (!pos || o.geometry.index) continue;
    o.updateMatrixWorld(true);
    const segs = [];
    const n = pos.count;
    const push = (i) => { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); segs.push(v.x, v.y, v.z); };
    if (o.isLineSegments) for (let i = 0; i + 1 < n; i += 2) { push(i); push(i + 1); }
    else for (let i = 0; i + 1 < n; i++) { push(i); push(i + 1); }
    if (!segs.length) continue;
    let sx = 0, sz = 0;
    for (let i = 0; i < segs.length; i += 3) { sx += segs[i]; sz += segs[i + 2]; }
    const k = segs.length / 3;
    const [cx, cz] = chunkOf(sx / k, sz / k, CHUNK_SIZE);
    const key = `${m.color.getHex()}|${o.layers.mask}|${cx},${cz}`;
    if (!groups.has(key)) groups.set(key, { color: m.color.getHex(), mask: o.layers.mask, chunk: `${cx},${cz}`, segs: [] });
    const g = groups.get(key);
    for (let i = 0; i < segs.length; i++) g.segs.push(segs[i]);
    victims.push(o);
  }
  for (const o of victims) { scene.remove(o); o.geometry.dispose(); }
  const mats = new Map();
  const out = [];
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.segs, 3));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    if (!mats.has(g.color)) mats.set(g.color, new THREE.LineBasicMaterial({ color: g.color }));
    const line = new THREE.LineSegments(geo, mats.get(g.color));
    line.layers.mask = g.mask;
    line.name = `lines:${g.chunk}`;
    line.userData.chunk = g.chunk;
    if (region) line.userData.region = region;
    line.matrixAutoUpdate = false;
    scene.add(line);
    const bb = geo.boundingBox;
    chunkSet?.addDetail(line, { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z }, 'lod');
    out.push(line);
  }
  return { merged: victims.length, batches: out.length };
}

// Light spots by chunk. near(x, z, out) fills `out` with every spot in the 3 x 3 chunks around
// (x, z), in their original order (so the pool's distance sort breaks ties exactly as before);
// the pool only uses spots within 90 m, which a 128 m chunk ring always covers.
export function createSpotIndex(spots, size = CHUNK_SIZE) {
  const cells = new Map();
  spots.forEach((s, i) => {
    const [cx, cz] = chunkOf(s.x, s.z, size);
    const k = `${cx},${cz}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  });
  let lastKey = '';
  const ids = [];
  return {
    // Refills `out` only when (x, z) moved to another chunk. Returns true when it changed.
    near(x, z, out) {
      const [cx, cz] = chunkOf(x, z, size);
      const key = `${cx},${cz}|${spots.length}`;
      if (key === lastKey) return false;
      lastKey = key;
      ids.length = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = cells.get(`${cx + a},${cz + b}`);
        if (list) for (const i of list) ids.push(i);
      }
      ids.sort((p, q) => p - q);
      out.length = 0;
      for (const i of ids) out.push(spots[i]);
      return true;
    },
  };
}

// ---- textured planes into atlases ----

const PAD = 16; // texels around each packed image; positions are multiples of 16 so mips stay clean
const ATLAS_W = 2048;

function signature(o) {
  const m = o.material;
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || o.userData.dynamic) return null;
  if (o.geometry?.type !== 'PlaneGeometry' || o.geometry.index?.count !== 6) return null;
  if (!(m?.isMeshBasicMaterial || m?.isMeshToonMaterial) || !m.map?.image || m.alphaMap || m.normalMap) return null;
  if (m.emissiveMap && m.emissiveMap !== m.map) return null;
  const t = m.map;
  if (!t.isCanvasTexture || t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x || t.offset.y || t.rotation || !t.flipY) return null;
  return [m.type, m.side, m.transparent, m.depthWrite, m.depthTest, m.blending, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits,
    m.color.getHex(), m.opacity, m.alphaTest, m.fog, m.vertexColors, m.emissive?.getHex(), m.emissiveIntensity, m.emissiveMap ? 1 : 0,
    m.gradientMap ? 1 : 0, t.colorSpace, o.layers.mask, o.renderOrder, o.castShadow, o.receiveShadow].join('|');
}

// Shelf-packs images (each { w, h }) into rows of ATLAS_W; returns positions and the atlas height.
function pack(images) {
  const order = images.map((im, i) => i).sort((a, b) => images[b].h - images[a].h);
  const at = new Array(images.length);
  let x = 0, y = 0, rowH = 0;
  const up16 = (v) => Math.ceil(v / 16) * 16;
  for (const i of order) {
    const w = up16(images[i].w + PAD * 2), h = up16(images[i].h + PAD * 2);
    if (x + w > ATLAS_W) { x = 0; y += rowH; rowH = 0; }
    at[i] = { x: x + PAD, y: y + PAD };
    x += w; rowH = Math.max(rowH, h);
  }
  return { at, height: y + rowH };
}

// Folds static textured sign planes added from scene child `from` on into atlas batches.
// `skipMaterials` (a Set) keeps animated ones (flickering neon) out.
export function batchTexturedPlanes(scene, from, chunkSet, skipMaterials = new Set(), region = null) {
  const sets = new Map();
  for (const o of scene.children.slice(from)) {
    const sig = signature(o);
    if (!sig || skipMaterials.has(o.material)) continue;
    if (!sets.has(sig)) sets.set(sig, []);
    sets.get(sig).push(o);
  }
  let merged = 0, batches = 0;
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    const images = [...new Set(list.map((o) => o.material.map.image))];
    const dims = images.map((im) => ({ w: im.width, h: im.height }));
    const { at, height } = pack(dims);
    if (height > 4096) continue; // too big for one atlas: leave this set alone
    const H = Math.max(16, 2 ** Math.ceil(Math.log2(height)));
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W; canvas.height = H;
    const g = canvas.getContext('2d');
    images.forEach((im, i) => {
      // Edge texels smeared into the padding, so filtering at the border sees the image's own edge.
      const { x, y } = at[i], w = dims[i].w, h = dims[i].h;
      g.drawImage(im, 0, 0, w, 1, x, y - PAD, w, PAD);
      g.drawImage(im, 0, h - 1, w, 1, x, y + h, w, PAD);
      g.drawImage(im, 0, 0, 1, h, x - PAD, y, PAD, h);
      g.drawImage(im, w - 1, 0, 1, h, x + w, y, PAD, h);
      g.drawImage(im, 0, 0, w, h, x, y, w, h);
    });
    const src = list[0].material.map;
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = src.colorSpace;
    atlas.anisotropy = src.anisotropy;
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
    const mat = list[0].material.clone();
    mat.map = atlas;
    if (mat.emissiveMap) mat.emissiveMap = atlas;
    const slot = new Map(images.map((im, i) => [im, i]));
    const perChunk = new Map();
    for (const o of list) {
      o.updateMatrixWorld(true);
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const i = slot.get(o.material.map.image);
      const { x, y } = at[i], w = dims[i].w, h = dims[i].h;
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k), vv = uv.getY(k);
        uv.setXY(k, (x + u * w) / ATLAS_W, 1 - (y + (1 - vv) * h) / H);
      }
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(v);
      const [cx, cz] = chunkOf(c.x, c.z, CHUNK_SIZE);
      const key = `${cx},${cz}`;
      if (!perChunk.has(key)) perChunk.set(key, []);
      perChunk.get(key).push(geo);
      scene.remove(o);
      merged++;
    }
    for (const [key, geos] of perChunk) {
      const geo = mergeGeometries(geos, false);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `signs:${key}`;
      mesh.userData.chunk = key;
      if (region) mesh.userData.region = region;
      mesh.layers.mask = list[0].layers.mask;
      mesh.renderOrder = list[0].renderOrder;
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      const bb = geo.boundingBox;
      chunkSet?.addDetail(mesh, { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z });
      batches++;
    }
  }
  return { merged, batches };
}
