// [verify] The GCPD online: the units' wire blob (src/wanted/netCodec.js) and the ability ids the
// wanted system and the sandbox gate on (src/abilities/abilityDefs.js).
import { describe, it, expect } from 'vitest';
import { packUnits, unpackUnits, officerPose, POSE, lerpAngle } from '../../src/wanted/netCodec.js';
import { deriveUnlocked, grantsForStep } from '../../src/abilities/abilities.js';
import { abilityById } from '../../src/abilities/abilityDefs.js';
import { STEPS } from '../../src/game/story.js';
import { STATE_MAX } from '../../src/net/game/contentNet.js';

const cruiser = (i, o = {}) => ({ i, active: true, type: 'police', x: 10.04 + i, y: 0.25, z: -20.5, yaw: 1.234, siren: true, stun: 0, ...o });
const officer = (i, o = {}) => ({ i, active: true, x: 3.33, y: 0, z: 4.44, yaw: -2.5, clip: 'Run_Loop', stun: 0, restrained: false, ...o });
const heli = { active: true, mode: 'track', x: 1, y: 60, z: 2, yaw: 0.5, light: { x: 5, y: 0.2, z: 6, r: 7 } };

describe('GCPD units on the wire', () => {
  it('round-trips cruisers, officers, the helicopter and props at 10 cm / 0.01 rad', () => {
    const blob = packUnits({
      cruisers: [cruiser(0), cruiser(1, { type: 'police_van', stun: 2 }), { i: 2, active: false }],
      officers: [officer(0), officer(3, { clip: null, stun: 1, restrained: true })],
      heli, roadblocks: [{ x: 50, y: 0, z: 60, yaw: 0, halfWidth: 7 }], spike: { active: true, hit: false, x: 1, y: 0, z: 2, yaw: 0, halfWidth: 5 },
    });
    const t = unpackUnits(JSON.parse(JSON.stringify(blob)));
    expect(t.cruisers.map((c) => c.slot)).toEqual([0, 1]);
    expect(t.cruisers[0].x).toBeCloseTo(10.0, 1);
    expect(t.cruisers[0].yaw).toBeCloseTo(1.23, 2);
    expect(t.cruisers[1]).toMatchObject({ van: true, stunned: true, siren: true });
    expect(t.officers.map((o) => [o.slot, o.pose])).toEqual([[0, POSE.run], [3, POSE.down]]);
    expect(t.heli).toMatchObject({ spot: true, light: { r: 7 } });
    expect(t.roadblocks[0].halfWidth).toBe(7);
    expect(t.spike.halfWidth).toBe(5);
  });
  it('an idle city packs to the same small blob every time (registerState only sends changes)', () => {
    const a = JSON.stringify(packUnits({ cruisers: [{ active: false }], officers: [{ active: false }], heli: { active: false }, roadblocks: [], spike: { active: false } }));
    expect(a).toBe(JSON.stringify(packUnits({})));
    expect(a.length).toBeLessThan(40);
  });
  it('a full pursuit (6 cruisers, 10 officers, the helicopter, 3 roadblocks, spikes) fits the 4 KiB state cap with room to spare', () => {
    const blob = packUnits({
      cruisers: Array.from({ length: 6 }, (_, i) => cruiser(i, { x: -1234.56 + i, z: 987.65 })),
      officers: Array.from({ length: 10 }, (_, i) => officer(i, { x: -1234.56, z: 987.65 })),
      heli, roadblocks: Array.from({ length: 3 }, () => ({ x: -1000, y: -7.5, z: 900, yaw: 3.1, halfWidth: 7 })), spike: { active: true, x: -1000, y: 0, z: 900, yaw: 1, halfWidth: 6 },
    });
    const n = JSON.stringify(blob).length;
    expect(n).toBeLessThan(STATE_MAX / 3);
  });
  it('malformed blobs never throw; slots outside the guest pool and duplicates are dropped', () => {
    for (const junk of [null, 7, 'x', { c: 'no' }, { c: [[0, 0, 'a']], o: [null, [99, 1, 2, 3, 4, 9]] }]) expect(() => unpackUnits(junk)).not.toThrow();
    const t = unpackUnits({ c: [[0, 0, 1, 1, 1, 0, 1], [0, 0, 2, 2, 2, 0, 1], [9, 0, 1, 1, 1, 0, 0]], o: [[1, 0, 0, 0, 0, 77]] }, { maxCruisers: 3, maxOfficers: 3 });
    expect(t.cruisers.length).toBe(1);
    expect(t.officers[0].pose).toBeLessThanOrEqual(5);
  });
  it('the guest plays the clip family the host plays', () => {
    expect(officerPose({ clip: 'Civ_Jog' })).toBe(POSE.run);
    expect(officerPose({ clip: 'Walk_Loop' })).toBe(POSE.walk);
    expect(officerPose({ clip: 'Pistol_Idle' })).toBe(POSE.aim);
    expect(officerPose({ clip: 'Civ_Argue' })).toBe(POSE.talk);
    expect(officerPose({ clip: 'Idle_Loop', stun: 1 })).toBe(POSE.down);
    expect(lerpAngle(3.1, -3.1, 0.5)).toBeCloseTo(Math.PI, 1);
  });
});

describe('police and sandbox abilities (onboarding layer)', () => {
  const idx = (id) => STEPS.findIndex((s) => s.id === id);
  it('takeCar, carRadio, hailTaxi and policeAttention exist and point at real Night One steps', () => {
    for (const id of ['takeCar', 'carRadio', 'hailTaxi', 'policeAttention']) {
      const a = abilityById(id);
      expect(a, id).toBeTruthy();
      expect(idx(a.grant.step), `${id} -> ${a.grant.step}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('a brand-new save has none of them; the GCPD is introduced mid Night One by Gordon; the free-roam ones after the credits', () => {
    const fresh = deriveUnlocked({}, { steps: STEPS });
    for (const id of ['takeCar', 'carRadio', 'hailTaxi', 'policeAttention']) expect(fresh.has(id)).toBe(false);
    expect(grantsForStep('toAce')).toContain('policeAttention');
    expect(abilityById('policeAttention').teach.line.speaker).toBe('gordon');
    const midNight = deriveUnlocked({ stepId: 'toAce' }, { steps: STEPS });
    expect(midNight.has('policeAttention') && midNight.has('carRadio') && !midNight.has('takeCar')).toBe(true);
    const finished = deriveUnlocked({ finished: true }, { steps: STEPS });
    for (const id of ['takeCar', 'carRadio', 'hailTaxi', 'policeAttention']) expect(finished.has(id)).toBe(true);
  });
});
