// Collects static geometry per material and per render chunk, then merges each group into one
// indexed mesh (Long Night 2, rendering-performance.md item 3). Two chunk sizes:
//   near materials (facades, trim, roofs, props: everything with real vertex cost) group in
//     CHUNK_SIZE (128 m) chunks and are swapped for the chunk's far-LOD silhouette past
//     quality.lodDistance (src/world/chunks.js);
//   detail materials (userData.detail: ground, lane paint, light pools, glow, cones) are cheap
//     overlays: they group in 512 m cells (chunks.detailCellOf) and cull on their own box at
//     drawDistance.
// Geometry stays indexed (the old toNonIndexed() ran the vertex shader 36 times per box instead
// of 24); a non-indexed input (extrusions) gets a plain 0..n-1 index, so its triangles are
// exactly the ones it had.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE, chunkOf, detailCellOf } from './chunks.js';

const ATTRS = ['position', 'normal', 'uv', 'color'];

export function createBuckets(materials, { region = null } = {}) {
  const groups = new Map();
  const tmp = new THREE.Vector3();

  // geometry must already be in world space. color (hex) fills a vertex color attribute when the
  // material uses vertex colors.
  function add(key, geometry, color = null) {
    if (!materials[key]) throw new Error(`Unknown material ${key}`);
    // A plain-colour material folds into its vertex-coloured twin (one draw per chunk fewer; the
    // shading maths is identical: material colour x vertex colour).
    const fold = materials[key].userData.foldInto;
    if (fold) { color = materials[key].color.getHex(); key = fold; }
    const mat = materials[key];
    const g = geometry;
    for (const name of Object.keys(g.attributes)) if (!ATTRS.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (mat.vertexColors) {
      if (!g.attributes.color) {
        const c = new THREE.Color(color ?? 0xffffff);
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    } else if (g.attributes.color) g.deleteAttribute('color');
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    g.computeBoundingBox();
    g.boundingBox.getCenter(tmp);
    const detail = !!mat.userData.detail;
    // Heavy prop materials group finer (userData.subChunk, 64 m) for tighter frustum culling,
    // and still belong to their 128 m chunk for the distance and LOD switch.
    const [sx, sz] = detail ? detailCellOf(tmp.x, tmp.z) : chunkOf(tmp.x, tmp.z, mat.userData.subChunk ?? CHUNK_SIZE);
    const [cx, cz] = detail ? [sx, sz] : chunkOf(tmp.x, tmp.z, CHUNK_SIZE);
    const id = `${key}|${sx},${sz}`;
    let grp = groups.get(id);
    if (!grp) groups.set(id, grp = { key, cx, cz, detail, list: [] });
    grp.list.push(g);
  }

  // Merges every group into a mesh under `parent` and registers it with `chunkSet` (when given)
  // as a near member of its chunk or as a detail overlay. Returns the meshes.
  function flush(parent, { castShadow = true, receiveShadow = true, chunkSet = null } = {}) {
    const meshes = [];
    for (const { key, cx, cz, detail, list } of groups.values()) {
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn('merge failed for', key); continue; }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = castShadow && !materials[key].userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.name = key;
      mesh.userData.chunk = `${cx},${cz}`;
      if (region) mesh.userData.region = region;
      if (materials[key].userData.layer) mesh.layers.set(materials[key].userData.layer);
      parent.add(mesh);
      meshes.push(mesh);
      if (chunkSet) {
        const bb = merged.boundingBox;
        const box = { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z };
        if (detail) chunkSet.addDetail(mesh, box);
        else chunkSet.addNear(cx, cz, mesh, box, region);
      }
    }
    groups.clear();
    return meshes;
  }

  // [polish] Takes back geometry added earlier whose world bounding box passes `test(bb)` (any
  // material). For removing a prop after a frozen build without touching its rng draws. Returns
  // how many geometries went.
  function remove(test) {
    let n = 0;
    for (const grp of groups.values()) {
      const keep = grp.list.filter((g) => !test(g.boundingBox));
      n += grp.list.length - keep.length;
      grp.list = keep;
    }
    for (const [id, grp] of groups) if (!grp.list.length) groups.delete(id);
    return n;
  }

  return { add, flush, remove };
}

// ---- geometry helpers (all return world-space BufferGeometry) ----

// A box with per-face UV scaling so textures tile in meters. uvScale: [metersPerU, metersPerV].
export function tiledBox(w, h, d, x, y, z, { uvScale = [1, 1], uOffset = 0, faces = 'all' } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const [su, sv] = uvScale;
  for (let f = 0; f < 6; f++) {
    const spanU = f < 2 ? d : w;
    const spanV = f === 2 || f === 3 ? d : h;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uOffset + (uv.getX(i) * spanU) / su, (uv.getY(i) * spanV) / sv);
    }
  }
  if (faces !== 'all') {
    // Keep only the listed faces (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z).
    const keep = new Set(faces);
    const index = [];
    for (let f = 0; f < 6; f++) if (keep.has(f)) index.push(...g.index.array.slice(f * 6, f * 6 + 6));
    g.setIndex(index);
  }
  return g.translate(x, y, z);
}

export function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

export function cylinder(rTop, rBottom, h, x, y, z, seg = 12, open = false) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open).translate(x, y, z);
}

// Triangular prism along x (ridge on top), used for pitched and sawtooth roofs.
export function prism(w, h, d, x, y, z, { sawtooth = false } = {}) {
  const shape = new THREE.Shape();
  if (sawtooth) { shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(d / 2, h); shape.lineTo(-d / 2, 0); }
  else { shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, h); shape.lineTo(-d / 2, 0); }
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g.translate(x, y, z);
}

export function rotatedY(g, angle, cx, cz) {
  return g.translate(-cx, 0, -cz).rotateY(angle).translate(cx, 0, cz);
}
