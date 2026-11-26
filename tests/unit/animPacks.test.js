import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ANIM_PACKS, loadAnimPack, mergePackClips } from '../../src/actors/animPacks.js';
import { PACKS, PACK_CLIPS, DROPPED, packClipNames } from '../../scripts/anim-packs.mjs';
import { MOCAP_DATA } from '../../src/config/mocapData.js';
import { CLIP_SET } from '../../src/config/clips.js';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const fetchBuffer = (url) => {
  const b = readFileSync(url);
  return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const opts = { base: 'public/assets/', fetchBuffer };

// The hero's skeleton as plain three bones, named like the skinned mesh's joints.
let skeletonRoot;
beforeAll(async () => {
  const doc = await io.read('public/assets/hero_m.glb');
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const bones = new Map();
  skeletonRoot = new THREE.Group();
  for (const j of joints) {
    const b = new THREE.Bone();
    b.name = j.getName();
    b.position.fromArray(j.getTranslation());
    b.quaternion.fromArray(j.getRotation());
    bones.set(j, b);
  }
  for (const j of joints) {
    const p = j.getParentNode();
    (bones.get(p) ?? skeletonRoot).add(bones.get(j));
  }
});

describe('animation pack manifest', () => {
  it('lists the same packs as the runtime loader', () => {
    expect([...ANIM_PACKS].sort()).toEqual([...PACKS].sort());
  });
  it('gives no new clip a name the preloaded packs already use', () => {
    const old = new Set([...Object.keys(MOCAP_DATA), ...CLIP_SET.anims1, ...CLIP_SET.anims2]);
    for (const p of PACKS) for (const n of packClipNames(p)) expect(old.has(n), n).toBe(false);
  });
  it('every entry names its Mixamo source, a kind and a use', () => {
    for (const [k, c] of Object.entries(PACK_CLIPS)) {
      expect(c.mixamo, k).toHaveLength(2);
      expect(['strike', 'react', 'knockdown', 'getup', 'loco', 'loop', 'action'], k).toContain(c.kind);
      expect(c.use, k).toBeTruthy();
    }
  });
});

describe.each(PACKS)('anims_%s pack', (pack) => {
  let doc, data;
  beforeAll(async () => {
    doc = await io.read(`public/assets/anims_${pack}.glb`);
    data = (await import(`../../src/config/mocapData.${pack}.js`)).MOCAP_DATA;
  });

  it('holds exactly the clips its data module describes, and the manifest minus dropped clips', () => {
    const clips = doc.getRoot().listAnimations().map((a) => a.getName()).sort();
    expect(clips).toEqual(Object.keys(data).sort());
    const expected = packClipNames(pack).filter((n) => !DROPPED[n] && !DROPPED[n.replace(/_M$/, '')]).sort();
    expect(clips).toEqual(expected);
    expect(doc.getRoot().listMeshes()).toHaveLength(0);
  });

  it('data matches the GLB: duration, root motion length, kind, events in range', () => {
    for (const anim of doc.getRoot().listAnimations()) {
      const d = data[anim.getName()];
      const dur = Math.max(...anim.listChannels().map((c) => c.getSampler().getInput().getMax([0])[0]));
      expect(Math.abs(dur - d.duration), anim.getName()).toBeLessThan(2e-3);
      expect(d.duration).toBeGreaterThan(0.25);
      // One-shots stay under 10 s; ambient loops (phone calls, chats) may run to a minute.
      expect(d.duration).toBeLessThan(d.loop ? 60 : 10);
      expect(d.root.length).toBe(2 * (Math.round(d.duration * d.fps) + 1));
      expect(d.contact).toBeLessThanOrEqual(d.duration);
      const ev = d.events;
      expect(ev.end).toBeCloseTo(d.duration, 3);
      for (const k of ['warpStart', 'contact', 'cancel', 'recover', 'down', 'getUpStart']) if (ev[k] != null) {
        expect(ev[k]).toBeGreaterThanOrEqual(0);
        expect(ev[k]).toBeLessThanOrEqual(d.duration + 1e-6);
      }
      if (d.kind === 'strike') {
        expect(ev.warpStart).toBeLessThan(ev.contact);
        expect(ev.cancel).toBeGreaterThan(ev.contact);
        expect(ev.recover).toBeGreaterThanOrEqual(ev.cancel);
      }
      if (d.kind === 'knockdown') expect(ev.down).toBeGreaterThanOrEqual(0);
      if (['react', 'action', 'getup', 'knockdown'].includes(d.kind)) expect(ev.recover).toBeGreaterThan(0);
      if (d.kind === 'loco') { expect(Array.isArray(ev.footL)).toBe(true); expect(Array.isArray(ev.footR)).toBe(true); }
      for (const c of anim.listChannels()) {
        expect(c.getTargetPath()).not.toBe('scale');
        expect(Array.from(c.getSampler().getOutput().getArray()).some(Number.isNaN)).toBe(false);
      }
    }
  });

  it('loads lazily through its loader and every track resolves onto the hero skeleton', async () => {
    const p = await loadAnimPack(pack, opts);
    expect([...p.clips.keys()].sort()).toEqual(Object.keys(data).sort());
    const mixer = new THREE.AnimationMixer(skeletonRoot);
    for (const clip of p.clips.values()) {
      for (const t of clip.tracks) {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
        expect(THREE.PropertyBinding.findNode(skeletonRoot, nodeName), `${clip.name}: ${nodeName}`).toBeTruthy();
        expect(['quaternion', 'position']).toContain(propertyName);
        if (propertyName === 'position') expect(nodeName).toBe('pelvis');
        // Normalised 16-bit rotations come back as floats in [-1, 1].
        if (propertyName === 'quaternion') expect(Math.max(...t.values.map(Math.abs))).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    // Play one clip on the skeleton: bones move, nothing goes NaN.
    const first = p.clips.values().next().value;
    const action = mixer.clipAction(first);
    action.play();
    mixer.update(first.duration / 2);
    skeletonRoot.traverse((o) => { if (o.isBone) expect(Number.isNaN(o.quaternion.x)).toBe(false); });
    mixer.stopAllAction();
    // The same promise is reused; merging never replaces an existing clip.
    expect(loadAnimPack(pack, opts)).toBe(loadAnimPack(pack, opts));
    const sentinel = new THREE.AnimationClip(first.name, 1, []);
    const map = mergePackClips(new Map([[first.name, sentinel]]), p);
    expect(map.get(first.name)).toBe(sentinel);
    expect(map.size).toBe(p.clips.size);
  });
});
