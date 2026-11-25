import { describe, it, expect } from 'vitest';
import { impactSpec, classifyImpact, IMPACT_KINDS, VARIANTS } from '../../src/audio/impacts.js';
import { footstepSpec, normalizeSurface, normalizeGait, SURFACES, GAITS } from '../../src/audio/footsteps.js';
import { SFX, SFX_NAMES } from '../../src/audio/sfx.js';

describe('impact recipes', () => {
  it('every kind has a transient or swell, a body or metal layer, and a positive length', () => {
    for (const k of IMPACT_KINDS) {
      const s = impactSpec(k);
      expect(s.kind).toBe(k);
      expect(s.duration).toBeGreaterThan(0);
      expect(s.layers.length).toBeGreaterThanOrEqual(3);
      const types = new Set(s.layers.map((l) => l.type));
      expect(types.has('transient') || types.has('swell') || types.has('body')).toBe(true);
    }
  });
  it('strikes layer a CC0 sample on top of the synth (the synth alone must still be complete)', () => {
    for (const k of ['jab', 'cross', 'hook', 'kick', 'heavy', 'counter', 'takedown', 'armour', 'shield', 'blade', 'bodyFall']) {
      const s = impactSpec(k);
      expect(s.layers.some((l) => l.type === 'sample')).toBe(true);
      expect(s.layers.filter((l) => l.type !== 'sample').length).toBeGreaterThanOrEqual(2);
    }
  });
  it('round-robin variants change the layer parameters', () => {
    const sig = (s) => JSON.stringify(s.layers.map((l) => [l.freq, l.from, l.index]));
    const seen = new Set();
    for (let v = 0; v < VARIANTS; v++) seen.add(sig(impactSpec('cross', { variant: v })));
    expect(seen.size).toBe(VARIANTS);
  });
  it('more power is louder but compressed, and pitches recordings down', () => {
    const a = impactSpec('cross', { power: 1 });
    const b = impactSpec('cross', { power: 2.5 });
    expect(b.gain).toBeGreaterThan(a.gain);
    expect(b.gain / a.gain).toBeLessThan(1.4);
    const rate = (s) => s.layers.find((l) => l.type === 'sample').rate;
    expect(rate(b)).toBeLessThan(rate(a));
  });
  it('a KO adds a sub and a body fall later on', () => {
    const s = impactSpec('cross', { ko: true });
    const fall = s.layers.find((l) => l.type === 'fall');
    expect(fall.at).toBeGreaterThan(0.25);
    expect(s.duration).toBeGreaterThan(impactSpec('cross').duration);
  });
  it('unknown kinds fall back to a cross instead of throwing', () => {
    expect(impactSpec('nope').kind).toBe('cross');
    expect(impactSpec('jab', { power: NaN, variant: -3 }).layers.length).toBeGreaterThan(0);
  });
  it('registers one sfx per impact kind and per surface', () => {
    for (const k of IMPACT_KINDS) expect(SFX[`hit_${k}`]).toBeTruthy();
    for (const s of SURFACES) expect(SFX[`step_${s}`]).toBeTruthy();
    for (const n of ['ventOpen', 'railingDown', 'clawRip', 'waypointSet', 'caseSolved', 'missionComplete', 'fearRising']) expect(SFX_NAMES).toContain(n);
  });
});

describe('classifyImpact (event payload -> impact kind)', () => {
  it('reads what combat emits today', () => {
    expect(classifyImpact({ move: 'kick', outcome: 'hit' }).kind).toBe('kick');
    expect(classifyImpact({ move: 'counter', outcome: 'hit' }).kind).toBe('counter');
    expect(classifyImpact({ move: 'heavy', outcome: 'knockdown' })).toMatchObject({ kind: 'heavy', knockdown: true });
    expect(classifyImpact({ move: 'special', outcome: 'ko' })).toMatchObject({ kind: 'takedown', ko: true, crit: true });
    expect(classifyImpact({ move: 'cape', outcome: 'stun' }).kind).toBe('stun');
    expect(classifyImpact({ move: 'punch', outcome: 'immune', target: { type: 'brute' } }).kind).toBe('armour');
    expect(classifyImpact({ move: 'punch', outcome: 'parried', target: { type: 'knife' } }).kind).toBe('blade');
    expect(classifyImpact({ move: 'punch', outcome: 'parried', target: { type: 'grunt', shield: true } }).kind).toBe('shield');
    expect(classifyImpact({ move: 'punch', outcome: 'parried', target: { type: 'grunt' } }).kind).toBe('blocked');
  });
  it('alternates jab / cross / hook for plain punches', () => {
    const kinds = new Set();
    for (let i = 0; i < 5; i++) kinds.add(classifyImpact({ move: 'punch', outcome: 'hit' }, i).kind);
    expect([...kinds].sort()).toEqual(['cross', 'hook', 'jab']);
  });
  it('prefers the richer fields when another workstream sends them', () => {
    expect(classifyImpact({ move: 'punch', strike: 'hook', power: 2.2 })).toMatchObject({ kind: 'hook', power: 2.2 });
    expect(classifyImpact({ move: 'punch', outcome: 'immune', material: 'shield' }).kind).toBe('shield');
  });
  it('never throws on missing payloads', () => {
    for (const p of [undefined, null, {}, { target: 5 }, { move: 42 }]) expect(IMPACT_KINDS).toContain(classifyImpact(p).kind);
  });
});

describe('footsteps', () => {
  it('normalises surfaces and gaits', () => {
    expect(normalizeSurface('grate')).toBe('metal');
    expect(normalizeSurface('puddle')).toBe('water');
    expect(normalizeSurface('roof')).toBe('gravel');
    expect(normalizeSurface('lava')).toBe('concrete');
    expect(normalizeSurface(undefined)).toBe('concrete');
    expect(normalizeGait('crouch')).toBe('crouch');
    expect(normalizeGait(null, { sprint: true })).toBe('sprint');
    expect(normalizeGait(null, { speed: 2 })).toBe('walk');
    expect(normalizeGait(null, { speed: 6 })).toBe('run');
  });
  it('every surface x gait x walker makes a spec; crouch is quiet and filtered, land is loud', () => {
    for (const s of SURFACES) for (const g of GAITS) for (const w of ['hero', 'goon', 'civilian']) {
      const f = footstepSpec(s, g, w, 2);
      expect(f.layers.length).toBeGreaterThan(0);
      expect(f.duration).toBeGreaterThan(0);
    }
    expect(footstepSpec('concrete', 'crouch').gain).toBeLessThan(footstepSpec('concrete', 'walk').gain);
    expect(footstepSpec('concrete', 'crouch').lowpass).toBeGreaterThan(0);
    expect(footstepSpec('concrete', 'land').gain).toBeGreaterThan(footstepSpec('concrete', 'sprint').gain);
    expect(footstepSpec('concrete', 'run', 'civilian').pitch).toBeGreaterThan(footstepSpec('concrete', 'run', 'hero').pitch);
  });
  it('surfaces sound different from each other (different layer recipes)', () => {
    const sigs = new Set(SURFACES.map((s) => footstepSpec(s).layers.map((l) => l.type + (l.group ?? '')).join()));
    expect(sigs.size).toBe(SURFACES.length);
  });
});
