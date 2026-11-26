// Far-LOD silhouettes: per render chunk, one merged mesh of plain boxes (sides and top, no
// undersides) standing where the chunk's buildings stand, tinted with each facade style's wall
// colour and dotted with lit windows from a shared texture laid out on the same 3.4 m floor
// pitch as the real facades. Shown between quality.lodDistance and quality.drawDistance in
// place of the chunk's detailed meshes (src/world/chunks.js), where the fog already covers most
// of the difference. One material for every chunk of every region, so it never adds a compile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../render/toon.js';
import { createRng } from '../core/rng.js';
import { CHUNK_SIZE, chunkOf } from './chunks.js';
import { FACADE_WALL } from './textures.js';

const FLOOR = 3.4;      // metres per window row (FLOOR_METERS / 16 in materials.js)
const BAY = 3.5;        // metres per window column
const COLS = 8, ROWS = 16;
const NEUTRAL = 0x4d4f55;

let shared = null;
function lodMaterial() {
  if (shared) return shared;
  // Own rng: drawing from the city's would move every building built after this.
  const rng = createRng(4242);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 256, 512);
  const cw = 256 / COLS, rh = 512 / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < COLS; k++) {
      if (!rng.chance(0.26)) continue;
      g.fillStyle = rng.chance(0.7) ? '#e8b25a' : '#9fc4e8';
      g.globalAlpha = rng.range(0.55, 1);
      g.fillRect(k * cw + 9, r * rh + 8, cw - 18, rh - 16);
      g.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  shared = toonMaterial({ vertexColors: true, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0 });
  shared.name = 'farLod';
  return shared;
}

// A box with side UVs in window cells (u per BAY metres, v per FLOOR metres) and a top whose UV
// sits on the unlit gap between windows, and no bottom face.
function silhouetteBox(b, color) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.995); continue; }
      const span = f < 2 ? d : w;
      uv.setXY(i, (uv.getX(i) * span) / (BAY * COLS), (b.minY + uv.getY(i) * h) / (FLOOR * ROWS));
    }
  }
  // Drop the bottom face (indices 18..23 are face 3, -y).
  const idx = Array.from(g.index.array);
  idx.splice(18, 6);
  g.setIndex(idx);
  g.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  const col = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Collision tags that are never part of a skyline silhouette (small props, rooms inside hollow
// landmarks, stealth cover) or are already covered by a facade record ('building').
const SKIP = new Set(['building', 'prop', 'tree', 'sidewalk', 'furniture', 'office', 'ceiling', 'zipPost', 'gargoyle', 'plinth',
  'catwalk', 'mastTop', 'stackTop', 'breakable', 'shed', 'bound', 'stealthDeck', 'stealthCover', 'stealthPost', 'stealthColumn', 'stealthLamp']);

// The silhouette boxes of one build: every facade the builders recorded (with its style) plus
// tall solid collision boxes the facades do not cover (spires, stacks, pitched roofs, cranes).
export function silhouetteBoxes(facades, boxes) {
  const out = facades.map((f) => ({ ...f, color: FACADE_WALL[f.style] ?? NEUTRAL }));
  for (const b of boxes) {
    if (SKIP.has(b.tag) || b.tag.startsWith('stealth')) continue;
    const h = b.maxY - b.minY, area = (b.maxX - b.minX) * (b.maxZ - b.minZ);
    if (h < 2.5 || area < 3 || b.maxY < 6) continue;
    out.push({ minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ, color: NEUTRAL });
  }
  return out;
}

// Builds one LOD mesh per chunk from silhouette boxes and hands each to chunkSet.setLod.
export function buildLods(silhouettes, chunkSet, parent, region = null) {
  const per = new Map();
  for (const s of silhouettes) {
    const [cx, cz] = chunkOf((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, CHUNK_SIZE);
    const key = `${cx},${cz}`;
    if (!per.has(key)) per.set(key, { cx, cz, list: [] });
    per.get(key).list.push(silhouetteBox(s, s.color));
  }
  const mat = lodMaterial();
  const meshes = [];
  for (const [key, { cx, cz, list }] of per) {
    const geo = mergeGeometries(list, false);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `lod:${key}`;
    mesh.userData.chunk = key;
    if (region) mesh.userData.region = region;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    const bb = geo.boundingBox;
    chunkSet.setLod(cx, cz, mesh, { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z }, region);
    meshes.push(mesh);
  }
  return meshes;
}
