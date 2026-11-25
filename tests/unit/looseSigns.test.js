// [perf2] Sign planes the atlases leave alone join the chunk detail list at the LOD range.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { cullLooseSigns } from '../../src/world/cityBuilder.js';
import { createChunkSet } from '../../src/world/chunks.js';

const sign = (x) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture({ width: 4, height: 4 }) }));
  m.position.set(x, 5, 0);
  return m;
};

describe('cullLooseSigns', () => {
  it('hides a loose sign past lodDistance and shows it within, leaving dynamic and untextured planes alone', () => {
    const scene = new THREE.Scene();
    const chunks = createChunkSet();
    const near = sign(0), dyn = sign(0), plain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    dyn.userData.dynamic = true;
    scene.add(near, dyn, plain);
    cullLooseSigns({ scene, sceneStart: 0, chunks });
    chunks.cull(300, 5, 0, 420, 240);
    expect(near.visible).toBe(false);
    expect(dyn.visible).toBe(true);
    expect(plain.visible).toBe(true);
    chunks.cull(100, 5, 0, 420, 240);
    expect(near.visible).toBe(true);
  });
});
