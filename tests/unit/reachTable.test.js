import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildReachTable } from '../../src/combat/reach.js';
import { MOCAP_DATA } from '../../src/config/mocapData.js';

// A bare rig with the bones the reach sampler looks up, and clips with no tracks: enough to run
// buildReachTable without the real assets.
function rig() {
  const model = new THREE.Group();
  for (const n of ['pelvis', 'hand_l', 'hand_r', 'ball_l', 'ball_r', 'calf_l', 'calf_r', 'lowerarm_r', 'Head']) {
    const b = new THREE.Bone(); b.name = n; model.add(b);
  }
  return model;
}
const clipsFor = (names) => new Map(names.map((n) => [n, new THREE.AnimationClip(n, MOCAP_DATA[n]?.duration ?? 1, [])]));

describe('reach table (combat-findings finding 1)', () => {
  it('keeps the baked mocap contact and root motion for the punches the sampler also knows', () => {
    const names = ['Punch_Jab', 'Punch_Cross', 'Melee_Hook'];
    const table = buildReachTable(rig(), clipsFor(names));
    for (const n of names) {
      const d = MOCAP_DATA[n];
      expect(table[n].contact, n).toBe(d.contact);
      expect(table[n].root, n).toBe(d.root);
      expect(table[n].root.length, n).toBeGreaterThan(4);
      expect(table[n].limb, n).toBe(d.limb);
      expect(table[n].reach, n).toEqual(d.reach);
    }
  });
});
