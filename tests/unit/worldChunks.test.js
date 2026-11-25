import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createChunkSet, chunkOf, detailCellOf, boxDistance } from '../../src/world/chunks.js';
import { createSpotIndex } from '../../src/world/staticBatches.js';
import { createRng } from '../../src/core/rng.js';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

const box = (x, z, s = 10, h = 20) => ({ minX: x, minY: 0, minZ: z, maxX: x + s, maxY: h, maxZ: z + s });

describe('chunk set culling', () => {
  it('shows near detail close, the LOD in the middle distance and nothing past the draw distance', () => {
    const set = createChunkSet();
    const near = { visible: true }, lod = { visible: true }, far = { visible: true };
    set.addNear(0, 0, near, box(0, 0));
    set.setLod(0, 0, lod, box(0, 0));
    set.addDetail(far, box(0, 0), 'lod');
    set.cull(5, 2, 5, 320, 160);
    expect([near.visible, lod.visible, far.visible]).toEqual([true, false, true]);
    set.cull(5, 2, 220, 320, 160);
    expect([near.visible, lod.visible, far.visible]).toEqual([false, true, false]);
    set.cull(5, 2, 500, 320, 160);
    expect([near.visible, lod.visible]).toEqual([false, false]);
    expect(set.visible.length).toBe(0);
  });

  it('has hysteresis on the LOD switch', () => {
    const set = createChunkSet();
    const near = { visible: true }, lod = { visible: false };
    set.addNear(0, 0, near, box(0, 0));
    set.setLod(0, 0, lod, box(0, 0));
    set.cull(5, 2, 10 + 162, 320, 160); // just past 160: still near (within hysteresis)
    expect(near.visible).toBe(true);
    set.cull(5, 2, 10 + 170, 320, 160);
    expect(lod.visible).toBe(true);
    set.cull(5, 2, 10 + 158, 320, 160); // back under 160 but inside hysteresis: stays LOD
    expect(lod.visible).toBe(true);
    set.cull(5, 2, 10 + 150, 320, 160);
    expect(near.visible).toBe(true);
  });

  it('applies the first cull even to a chunk that starts out of range', () => {
    const set = createChunkSet();
    const near = { visible: true };
    set.addNear(9, 9, near, box(1200, 1200));
    set.cull(0, 0, 0, 320, 160);
    expect(near.visible).toBe(false);
  });

  it('chunk and detail-cell maths', () => {
    expect(chunkOf(-0.1, 127.9)).toEqual([-1, 0]);
    // The whole original city is one detail cell.
    for (const [x, z] of [[-236, -236], [236, 205], [0, 0]]) expect(detailCellOf(x, z)).toEqual([0, 0]);
    expect(detailCellOf(0, -300)).toEqual([0, -1]);
    expect(boxDistance(box(0, 0), 5, 5, 5)).toBe(0);
    expect(boxDistance(box(0, 0), 13, 5, 14)).toBe(5);
  });
});

describe('light spot index', () => {
  it('gives the pool every spot it would have picked from the full list', () => {
    const rng = createRng(3);
    const spots = Array.from({ length: 400 }, () => ({ x: rng.range(-500, 500), y: 6, z: rng.range(-500, 500) }));
    const idx = createSpotIndex(spots);
    const out = [];
    for (let i = 0; i < 300; i++) {
      const fx = rng.range(-520, 520), fz = rng.range(-520, 520);
      idx.near(fx, fz, out);
      const inRange = (list) => list.filter((s) => (s.x - fx) ** 2 + (s.z - fz) ** 2 < 90 * 90);
      expect(inRange(out)).toEqual(inRange(spots));
    }
  });
});

describe('the chunked core city', () => {
  let city;
  // [perf3] Each chunk's near meshes hang under one 'chunk:x,z' group (cityBuilder.groupChunkMembers).
  const kids = () => city.scene.children.flatMap((o) => (o.name.startsWith('chunk:') ? o.children : [o]));
  beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

  it('every bucket mesh is indexed, chunked and registered', () => {
    const meshes = kids().filter((o) => o.isMesh && o.userData.chunk && !o.name.startsWith('lod') && !o.name.startsWith('signs'));
    expect(meshes.length).toBeGreaterThan(100);
    for (const m of meshes) expect(m.geometry.index).toBeTruthy();
    // Old city-wide meshes are gone: no single facade mesh spans the city.
    for (const m of meshes.filter((o) => o.name.startsWith('facade'))) {
      const bb = m.geometry.boundingBox;
      expect(bb.max.x - bb.min.x).toBeLessThan(128 + 70);
    }
    const stats = city.ctx.chunks.stats();
    expect(stats.chunks).toBeGreaterThanOrEqual(16);
  });

  it('every chunk with buildings has a far-LOD silhouette', () => {
    let withLod = 0;
    for (const c of city.ctx.chunks.chunks.values()) if (c.lod) withLod++;
    expect(withLod).toBeGreaterThanOrEqual(14);
  });

  it('keeps the triangle count of the old merge (indexing changes vertex count, not triangles)', () => {
    let tris = 0;
    for (const o of kids()) {
      if (!o.isMesh || !o.userData.chunk || o.name.startsWith('lod')) continue;
      tris += o.geometry.index.count / 3;
    }
    expect(tris).toBeGreaterThan(300000);
  });

  it('folds ink lines and sign planes into chunk batches', () => {
    const loose = city.scene.children.filter((o) => (o.isLine || o.isLineSegments) && !o.userData.chunk);
    expect(loose.length).toBe(0);
    expect(city.scene.children.filter((o) => o.name.startsWith('signs:')).length).toBeGreaterThan(2);
  });

  it('halo indices survive the per-chunk split', () => {
    const h = city.ctx.halos;
    expect(h.batches).toBeGreaterThan(0);
    // Writing a frozen halo marks only its own batch; a later add lands in the loose batch.
    const i = h.add(1, 2, 3, 0xffffff, 2);
    expect(i).toBe(h.count - 1);
    h.setSize(0, 0.5);
    h.set(i, 4, 5, 6, 1);
    expect(() => h.update()).not.toThrow();
  });
});

describe('buckets fold plain-colour materials', () => {
  it('trim, steel and rust ride in painted with their own colour', async () => {
    const { createBuckets } = await import('../../src/world/buckets.js');
    const mats = {
      painted: new THREE.MeshToonMaterial({ vertexColors: true }),
      trim: new THREE.MeshToonMaterial({ color: 0x336699 }),
    };
    mats.painted.userData = { subChunk: 64 };
    mats.trim.userData = { foldInto: 'painted' };
    const b = createBuckets(mats);
    b.add('trim', new THREE.BoxGeometry(1, 1, 1).translate(10, 0, 10));
    b.add('painted', new THREE.BoxGeometry(1, 1, 1).translate(12, 0, 10), 0xff0000);
    const set = createChunkSet();
    const scene = new THREE.Scene();
    const meshes = b.flush(scene, { chunkSet: set });
    expect(meshes.length).toBe(1);
    expect(meshes[0].material).toBe(mats.painted);
    const col = meshes[0].geometry.attributes.color;
    const c = new THREE.Color(0x336699);
    expect(col.getX(0)).toBeCloseTo(c.r, 6);
    expect(meshes[0].geometry.index.count).toBe(72);
  });
});

// [perf3] A chunk's near meshes show and hide as one group.
describe('chunk groups', () => {
  it('toggles the group, not each member, and keeps loose members working', async () => {
    const { createChunkSet } = await import('../../src/world/chunks.js');
    const set = createChunkSet();
    const box = { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 };
    const a = { visible: true }, b = { visible: true }, c = { visible: true }, lod = { visible: false };
    set.addNear(0, 0, a, box); set.addNear(0, 0, b, box); set.addNear(0, 0, c, box);
    set.setLod(0, 0, lod, box);
    const group = { visible: true };
    set.groupNear((ch, members) => ({ group, loose: members.filter((m) => m === c) }));
    set.cull(5, 5, 5, 400, 100);
    expect(group.visible).toBe(true); expect(c.visible).toBe(true); expect(lod.visible).toBe(false);
    set.cull(300, 5, 5, 400, 100);
    expect(group.visible).toBe(false); expect(c.visible).toBe(false); expect(lod.visible).toBe(true);
    expect(a.visible).toBe(true); // members inside the group keep their own flag
    set.cull(5000, 5, 5, 400, 100);
    expect(group.visible).toBe(false); expect(lod.visible).toBe(false);
  });
});
