// Soft additive glow sprites for every lamp, sign and headlight.
//
// Until freeze() every halo lives in one Points object. freeze(chunkSet, parent) moves the static
// city's halos into one Points per 512 m detail cell (chunks.detailCellOf), so they frustum- and distance-cull with the rest
// of the chunk; halos added afterwards (traffic, the blimp, pickups, backdrop beacons) stay in the
// shared "loose" Points, which is never culled. Writes (set, setSize) only mark the touched range
// dirty, and update() uploads just that range (addUpdateRange) instead of the whole buffer: the
// old version re-uploaded all 6,000 slots every frame because a blinker or a car moved.
// Indices returned by add() stay valid across freeze().
import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';
import { detailCellOf } from './chunks.js';

const vertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
varying vec3 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}
`;
const fragmentShader = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.85, 1.0, d));
  float core = exp(-d * d * 40.0);
  gl_FragColor = vec4(vColor * a * 0.75 + vec3(core * 0.5), a);
}
`;

// One Points object over its own typed arrays, with a dirty range per frame.
function makeBatch(material, n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 3), aSize = new THREE.BufferAttribute(size, 1);
  for (const a of [aPos, aSize]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aColor', aCol);
  geo.setAttribute('aSize', aSize);
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(geo, material);
  points.layers.set(LAYER_FX);
  points.renderOrder = 5;
  return { pos, col, size, geo, points, lo: Infinity, hi: -1, colLo: Infinity, colHi: -1 };
}
function touch(b, i) { if (i < b.lo) b.lo = i; if (i > b.hi) b.hi = i; }
function upload(b) {
  if (b.hi >= 0) {
    for (const [name, k] of [['position', 3], ['aSize', 1]]) {
      const a = b.geo.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(b.lo * k, (b.hi - b.lo + 1) * k);
      a.needsUpdate = true;
    }
    b.lo = Infinity; b.hi = -1;
  }
  if (b.colHi >= 0) {
    const a = b.geo.attributes.aColor;
    a.clearUpdateRanges();
    a.addUpdateRange(b.colLo * 3, (b.colHi - b.colLo + 1) * 3);
    a.needsUpdate = true;
    b.colLo = Infinity; b.colHi = -1;
  }
}

export function createHalos(capacity = 4096) {
  const uniforms = { uScale: { value: 600 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const loose = makeBatch(material, capacity);
  loose.points.frustumCulled = false;
  let count = 0;      // halos ever added (global index space)
  let frozen = 0;     // indices below this live in chunk batches
  let batchOf = null; // global index -> chunk batch (only for i < frozen)
  let localOf = null; // global index -> slot in that batch
  const batches = [];
  const c = new THREE.Color();

  // Where halo i lives: the loose batch (slot i - frozen) or its chunk batch.
  const slot = (i) => (i < frozen ? localOf[i] : i - frozen);
  const owner = (i) => (i < frozen ? batchOf[i] : loose);

  return {
    points: loose.points,
    add(x, y, z, color, s = 2) {
      if (count >= capacity) return -1;
      const i = count++;
      const k = i - frozen;
      loose.pos[k * 3] = x; loose.pos[k * 3 + 1] = y; loose.pos[k * 3 + 2] = z;
      c.set(color);
      loose.col[k * 3] = c.r; loose.col[k * 3 + 1] = c.g; loose.col[k * 3 + 2] = c.b;
      loose.size[k] = s;
      loose.geo.setDrawRange(0, count - frozen);
      touch(loose, k);
      if (k < loose.colLo) loose.colLo = k;
      if (k > loose.colHi) loose.colHi = k;
      return i;
    },
    set(i, x, y, z, s) {
      if (i < 0) return;
      const b = owner(i), k = slot(i);
      b.pos[k * 3] = x; b.pos[k * 3 + 1] = y; b.pos[k * 3 + 2] = z;
      if (s !== undefined) b.size[k] = s;
      touch(b, k);
    },
    setSize(i, s) {
      if (i < 0) return;
      const b = owner(i), k = slot(i);
      if (b.size[k] === s) return;
      b.size[k] = s;
      touch(b, k);
    },
    // Uploads whatever changed since the last call (once per frame, before rendering).
    update() {
      upload(loose);
      for (let j = 0; j < batches.length; j++) upload(batches[j]);
    },
    // Splits every halo added so far into per-chunk Points under `parent`, registered with
    // `chunkSet` as detail members (culled at the draw distance). Call once, after the static city.
    freeze(chunkSet, parent, region = null) {
      if (frozen) return;
      const n = count;
      const groups = new Map();
      for (let i = 0; i < n; i++) {
        const [cx, cz] = detailCellOf(loose.pos[i * 3], loose.pos[i * 3 + 2]);
        const key = `${cx},${cz}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(i);
      }
      batchOf = new Array(n);
      localOf = new Int32Array(n);
      for (const [key, list] of groups) {
        const b = makeBatch(material, list.length);
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        list.forEach((i, k) => {
          for (let a = 0; a < 3; a++) { b.pos[k * 3 + a] = loose.pos[i * 3 + a]; b.col[k * 3 + a] = loose.col[i * 3 + a]; }
          b.size[k] = loose.size[i];
          batchOf[i] = b; localOf[i] = k;
          const x = b.pos[k * 3], y = b.pos[k * 3 + 1], z = b.pos[k * 3 + 2];
          if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
          if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
        });
        b.geo.setDrawRange(0, list.length);
        // A sprite reaches past its centre: pad the cull volume so edge halos do not pop.
        const pad = 12;
        b.geo.boundingBox = new THREE.Box3(new THREE.Vector3(minX - pad, minY - pad, minZ - pad), new THREE.Vector3(maxX + pad, maxY + pad, maxZ + pad));
        b.geo.boundingSphere = b.geo.boundingBox.getBoundingSphere(new THREE.Sphere());
        b.points.name = `halos:${key}`;
        b.points.userData.chunk = key;
        if (region) b.points.userData.region = region;
        b.points.matrixAutoUpdate = false;
        parent.add(b.points);
        batches.push(b);
        chunkSet?.addDetail(b.points, { minX: minX - pad, minY: minY - pad, minZ: minZ - pad, maxX: maxX + pad, maxY: maxY + pad, maxZ: maxZ + pad });
      }
      // The loose batch restarts empty; later halos take its slots from 0.
      frozen = n;
      loose.lo = Infinity; loose.hi = -1; loose.colLo = Infinity; loose.colHi = -1;
      loose.geo.setDrawRange(0, 0);
    },
    resize(height, fovDeg) { uniforms.uScale.value = height / (2 * Math.tan((fovDeg * Math.PI) / 360)); },
    get count() { return count; },
    get batches() { return batches.length; },
  };
}
