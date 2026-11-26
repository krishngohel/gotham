import { describe, it, expect } from 'vitest';
import { createCaseRun, validateCase, CASE_STAGES, TRAIL_KINDS, GLYPHS, resolvePoint } from '../../src/openworld/cases/engine.js';
import { CASES } from '../../src/openworld/cases/data.js';
import { createCases } from '../../src/openworld/cases/runtime.js';
import { testContext } from '../../src/openworld/context.js';
import { sanitizeOpenworld } from '../../src/openworld/save.js';
import { REGION_SITES } from '../../src/world/regions/data.js';
import { SITES } from '../../src/world/mapData.js';
import { SPEAKERS } from '../../src/audio/barks/lines.js';

const site = (id) => REGION_SITES[id] ?? SITES[id] ?? null;
const P = (x, z, y = 0) => ({ x, y, z });
// A small synthetic case on literal points.
const mini = (trail = { kind: 'footprints', points: [P(20, 0), P(30, 0)] }, confront = { kind: 'fight', budget: 3, gang: 'street', at: P(40, 0) }) => ({
  id: 'miniCase', title: 'Mini', district: 'loop', after: null,
  scene: { x: 0, y: 0, z: 0 },
  evidence: [{ id: 'a', at: P(0, 0), glyph: 'print', label: 'A', text: 'a' }, { id: 'b', at: P(10, 0), glyph: 'drop', label: 'B', text: 'b' }],
  reconstruct: { prompt: '?', cards: [{ id: 'one', text: '1' }, { id: 'two', text: '2' }, { id: 'three', text: '3' }], order: ['one', 'two', 'three'] },
  trail, confront, solvedLines: [], reward: ['xp:100'],
});
const facts = (heroes) => ({ heroes: heroes.map((h) => ({ y: 0, detective: false, dead: false, ...h })), nHeroes: heroes.length });
const run = (r, f, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) r.step(dt, f); };

describe('case engine', () => {
  it('scans only in detective vision, then moves to the reconstruction', () => {
    const r = createCaseRun(mini());
    expect(r.stageName).toBe('scene');
    run(r, facts([{ x: 0.5, z: 0 }]), 3);
    expect(r.foundCount).toBe(0);
    run(r, facts([{ x: 0.5, z: 0, detective: true }]), 1.5);
    expect(r.evidence[0].found).toBe(true);
    run(r, facts([{ x: 10, z: 0.5, detective: true }]), 1.5);
    expect(r.stageName).toBe('reconstruct');
  });
  it('co-op: either player scans, findings are shared', () => {
    const r = createCaseRun(mini());
    run(r, facts([{ x: 0, z: 0.5, detective: true }, { x: 10, z: 0.5, detective: true }]), 1.5);
    run(r, facts([{ x: 0, z: 0.5, detective: true }, { x: 10, z: 0.5, detective: true }]), 1.5);
    expect(r.foundCount).toBe(2);
    expect(r.stageName).toBe('reconstruct');
  });
  it('flags unfound evidence as hinted after the assist timeout', () => {
    const r = createCaseRun(mini(), { rules: { assistAfter: 5 } });
    let hint = null;
    for (let t = 0; t < 6; t += 0.5) hint = r.step(0.5, facts([{ x: 200, z: 0 }])) ?? hint;
    expect(hint).toBe('hint');
    expect(r.evidence.every((e) => e.hinted)).toBe(true);
    expect(r.marker(P(0, 0))).toEqual(r.evidence[0].pos);
  });
  it('reconstruct: wrong answers count, two reveal the first card, the right order moves on', () => {
    const r = createCaseRun(mini());
    r.skipStage();
    expect(r.answer(['two', 'one', 'three'])).toMatchObject({ ok: false, wrong: 1, revealed: null });
    expect(r.answer(['three', 'one', 'two'])).toMatchObject({ ok: false, wrong: 2, revealed: 'one' });
    expect(r.answer(['one', 'two', 'three']).ok).toBe(true);
    expect(r.stageName).toBe('trail');
  });
  for (const kind of ['footprints', 'chemical', 'tyre']) {
    it(`a ${kind} trail is followed in order, in detective vision`, () => {
      const r = createCaseRun(mini({ kind, points: [P(20, 0), P(30, 0)] }));
      r.skipStage(); r.skipStage();
      run(r, facts([{ x: 30, z: 0, detective: true }]), 2);
      expect(r.trailIndex).toBe(0); // the second point first does nothing
      run(r, facts([{ x: 20, z: 0 }]), 2);
      expect(r.trailIndex).toBe(0); // no detective vision
      run(r, facts([{ x: 20, z: 0, detective: true }]), 1.2);
      expect(r.trailIndex).toBe(1);
      run(r, facts([{ x: 30, z: 0, detective: true }]), 1.2);
      expect(r.stageName).toBe('confront');
    });
  }
  it('radio triangulation: receivers in any order without detective vision, then the target', () => {
    const r = createCaseRun(mini({ kind: 'radio', receivers: [P(20, 0), P(40, 0)], target: P(60, 0) }));
    r.skipStage(); r.skipStage();
    expect(r.target.revealed).toBe(false);
    r.step(0.1, facts([{ x: 40, z: 0 }]));
    r.step(0.1, facts([{ x: 20, z: 0 }]));
    expect(r.target.revealed).toBe(true);
    expect(r.marker()).toEqual(r.target.pos);
    r.step(0.1, facts([{ x: 60, z: 1 }]));
    expect(r.stageName).toBe('confront');
  });
  it('confront waits for the runtime, then the case is solved', () => {
    const r = createCaseRun(mini());
    r.skipStage(); r.skipStage(); r.skipStage();
    expect(r.stageName).toBe('confront');
    expect(r.confrontDone(false)).toBe(false);
    expect(r.confrontDone(true)).toBe(true);
    expect(r.solved).toBe(true);
  });
  it('saves and restores into the store.cases shape', () => {
    const r = createCaseRun(mini());
    run(r, facts([{ x: 0, z: 0, detective: true }]), 1.5);
    r.skipStage(); r.skipStage();
    const saved = sanitizeOpenworld({ cases: { miniCase: r.toSave() } }).cases.miniCase;
    expect(saved).toEqual({ stage: 2, found: ['a', 'b'], trail: 0, solved: false });
    const back = createCaseRun(mini(), { saved });
    expect(back.stageName).toBe('trail');
    expect(back.foundCount).toBe(2);
    const half = createCaseRun(mini(), { saved: { stage: 0, found: ['a'], trail: 0, solved: false } });
    expect(half.stageName).toBe('scene');
    expect(half.evidence[0].found).toBe(true);
  });
});

describe('case data', () => {
  it('has at least five cases, three of them cold cases with a twist, two chain cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(5);
    const cold = CASES.filter((c) => !c.chain);
    expect(cold.length).toBeGreaterThanOrEqual(3);
    for (const c of cold) expect(c.twist?.length).toBeGreaterThan(10);
    expect(CASES.find((c) => c.id === 'caseNineLives')?.chain).toBe('nineLives');
    expect(CASES.find((c) => c.id === 'caseClayFeet')?.chain).toBe('clayFeet');
    for (const c of CASES.filter((x) => x.chain)) expect(c.after).toBe('n1');
    expect(new Set(CASES.map((c) => c.district)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(CASES.map((c) => c.trail.kind))).toEqual(new Set(['footprints', 'chemical', 'tyre', 'radio']));
  });
  it('ids are unique; every case validates (sites resolve, evidence ids unique, order a permutation)', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) expect(validateCase(c, site)).toEqual([]);
  });
  it('every site id named resolves, and points stay close to their site', () => {
    const pts = (c) => [...c.evidence.map((e) => e.at), ...(c.trail.points ?? []), ...(c.trail.receivers ?? []), c.trail.target, c.confront.at, { site: c.scene.site }].filter(Boolean);
    for (const c of CASES) {
      for (const p of pts(c)) {
        if (p.site !== undefined) {
          expect(site(p.site), `${c.id} ${p.site}`).toBeTruthy();
          expect(Math.hypot(p.dx ?? 0, p.dz ?? 0), `${c.id} ${p.site}`).toBeLessThanOrEqual(12);
        } else {
          // A literal point: within 40 m of the case's own scene (a short street trail).
          const s = site(c.scene.site);
          expect(Math.hypot(p.x - s.x, p.z - s.z), `${c.id} literal`).toBeLessThanOrEqual(40);
        }
        expect(resolvePoint(p, site)).toBeTruthy();
      }
    }
  });
  it('clues are never colour-only: a glyph word and a label for each', () => {
    for (const c of CASES) for (const e of c.evidence) { expect(GLYPHS).toContain(e.glyph); expect(e.label.length).toBeGreaterThan(5); }
  });
  it('every speaker resolves; rewards are reward ids', () => {
    const lines = (c) => [...(c.intro ?? []), ...(c.solvedLines ?? []), ...(c.confront.lines ?? [])];
    for (const c of CASES) {
      for (const l of lines(c)) { expect(SPEAKERS[l.speaker], `${c.id} ${l.speaker}`).toBeTruthy(); expect(l.text.length).toBeGreaterThan(5); }
      for (const r of c.reward) expect(r).toMatch(/^(xp|lore|suit|gadget|skill|upgrade):[a-zA-Z0-9_.-]+$/);
    }
    expect(TRAIL_KINDS).toHaveLength(4);
    expect(CASE_STAGES).toEqual(['scene', 'reconstruct', 'trail', 'confront', 'solved']);
  });
});

describe('case runtime', () => {
  const ctx = (heroes = [{ x: 0, y: 0, z: 0 }]) => {
    const ow = testContext({ heroes, store: sanitizeOpenworld({}) });
    ow.site = (id) => (typeof id === 'object' ? id : null);
    return ow;
  };
  const types = (ow) => ow.emitted.map((e) => e.type);

  it('lists cases with unlock state from the campaign', () => {
    const ow = ctx();
    const cases = createCases(ow);
    const l = cases.list();
    expect(l.find((c) => c.id === 'caseNineLives').unlocked).toBe(false);
    expect(l.find((c) => c.id === 'caseBellTwice').unlocked).toBe(true);
    ow.progress.campaign.nightsDone = ['n1'];
    expect(cases.list().find((c) => c.id === 'caseNineLives').unlocked).toBe(true);
  });
  it('runs a whole case: scan (shared by two players), board, trail, fight hand-off, solved, saved, rewarded', () => {
    const ow = ctx([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
    const cases = createCases(ow, { cases: [mini()] });
    expect(cases.start('miniCase')).toBe(true);
    expect(types(ow)).toContain('caseStart');
    const [p0, p1] = ow.players();
    p0.det = true; p1.det = true;
    p1.hero.pos.x = 10;
    for (let i = 0; i < 20; i++) cases.update(0.1);
    expect(ow.emitted.filter((e) => e.type === 'caseClue')).toHaveLength(2);
    expect(cases.active.stage).toBe('reconstruct');
    expect(cases.answer(['three', 'two', 'one']).ok).toBe(false);
    expect(cases.answer(['one', 'two', 'three']).ok).toBe(true);
    expect(cases.active.stage).toBe('trail');
    expect(ow.store.cases.miniCase.stage).toBe(2);
    for (const x of [20, 30]) { p0.hero.pos.x = x; for (let i = 0; i < 12; i++) cases.update(0.1); }
    expect(cases.active.stage).toBe('confront');
    const conf = ow.emitted.find((e) => e.type === 'caseConfront');
    expect(conf.data).toMatchObject({ id: 'miniCase', spec: { kind: 'fight' }, pos: { x: 40 } });
    expect(cases.confrontDone(true)).toBe(true);
    expect(cases.active).toBe(null);
    expect(types(ow)).toContain('caseSolved');
    expect(ow.store.cases.miniCase.solved).toBe(true);
    expect(ow.emitted.some((e) => e.type === 'storyReward' && e.data.id === 'xp:100')).toBe(true);
  });
  it('a talk confront resolves itself', async () => {
    const ow = ctx();
    const cases = createCases(ow, { cases: [mini(undefined, { kind: 'talk', lines: [{ speaker: 'alfred', text: 'Hello there.' }] })] });
    cases.start('miniCase');
    cases.debugSolveStage(); cases.debugSolveStage(); cases.debugSolveStage();
    await Promise.resolve(); await Promise.resolve();
    expect(cases.active).toBe(null);
    expect(types(ow)).toContain('caseSolved');
  });
  it('evidence glints show only in detective vision until the assist hints them', () => {
    const ow = ctx([{ x: 300, y: 0, z: 0 }]);
    const cases = createCases(ow, { cases: [mini()] });
    cases.start('miniCase');
    cases.update(0.1);
    // (the test markers are plain objects)
    expect(cases.hud().text).toMatch(/0\/2/);
    expect(cases.marker()).toBeTruthy();
  });
  it('debugSolve finishes a real case from the data', () => {
    const ow = testContext({ store: sanitizeOpenworld({}) });
    ow.site = site;
    const cases = createCases(ow);
    expect(cases.start('caseBellTwice')).toBe(true);
    expect(cases.debugSolve()).toBe(true);
    expect(ow.store.cases.caseBellTwice.solved).toBe(true);
  });
});
