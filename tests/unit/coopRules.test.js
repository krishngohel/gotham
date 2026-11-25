import { describe, it, expect } from 'vitest';
import { createReviveRules, REVIVE, coopScaling, scaledHealth, scaleWave, xpRecipients, creditsOwner } from '../../src/players/coopRules.js';
import { createDirector } from '../../src/combat/director.js';
import { createRng } from '../../src/core/rng.js';

const P = (id, x, { down = false, busy = false } = {}) => ({ id, down, busy, pos: { x, z: 0 } });

describe('downed and revive', () => {
  it('a partner standing next to a downed hero revives them after REVIVE.time', () => {
    const r = createReviveRules();
    r.down(1);
    let got = [];
    for (let i = 0; i < Math.floor(REVIVE.time / 0.1) - 1; i++) { got = r.update(0.1, [P(0, 1), P(1, 0, { down: true })]); expect(got).toEqual([]); }
    got = r.update(0.2, [P(0, 1), P(1, 0, { down: true })]);
    expect(got).toEqual([{ type: 'revived', id: 1, by: 0 }]);
    expect(r.isDown(1)).toBe(false);
  });
  it('too far away does nothing; stepping away drains the progress', () => {
    const r = createReviveRules();
    r.down(1);
    r.update(1, [P(0, 1), P(1, 0, { down: true })]);
    expect(r.state(1).progress).toBeCloseTo(1 / REVIVE.time);
    r.update(0.25, [P(0, 9), P(1, 0, { down: true })]);
    expect(r.state(1).progress).toBeCloseTo(0.5 / REVIVE.time);
    expect(r.state(1).by).toBe(null);
  });
  it('a busy partner cannot revive', () => {
    const r = createReviveRules();
    r.down(1);
    for (let i = 0; i < 40; i++) expect(r.update(0.1, [P(0, 1, { busy: true }), P(1, 0, { down: true })])).toEqual([]);
  });
  it('bleeding out after the window', () => {
    const r = createReviveRules({ window: 2 });
    r.down(1);
    expect(r.update(1.5, [P(0, 30), P(1, 0, { down: true })])).toEqual([]);
    expect(r.update(0.6, [P(0, 30), P(1, 0, { down: true })])).toEqual([{ type: 'expired', id: 1 }]);
  });
  it('everyone down is reported once (the checkpoint)', () => {
    const r = createReviveRules();
    r.down(0); r.down(1);
    expect(r.update(0.1, [P(0, 0, { down: true }), P(1, 1, { down: true })])).toEqual([{ type: 'allDown' }]);
    expect(r.update(0.1, [P(0, 0, { down: true }), P(1, 1, { down: true })])).toEqual([]);
    r.clear();
    expect(r.isDown(0)).toBe(false);
  });
});

describe('enemy scaling', () => {
  it('one player: no scaling at all', () => {
    expect(coopScaling(1)).toEqual({ enemyCount: 1, health: 1, tokensPerPlayer: 1, tokensTotal: 1 });
    const wave = [{ type: 'grunt', dx: 0, dz: 0 }];
    expect(scaleWave(wave, 1)).toBe(wave);
    expect(scaledHealth(4, 1)).toBe(4);
  });
  it('two players: half as many goons again, health capped at 1.25x', () => {
    expect(coopScaling(2).enemyCount).toBe(1.5);
    expect(coopScaling(2).health).toBe(1.25);
    expect(coopScaling(4).health).toBe(1.25);
    expect(scaledHealth(4, 2)).toBe(5);
    expect(scaledHealth(10, 3)).toBe(13);
  });
  it('extra goons copy the wave (never a brute) a step to the side', () => {
    const wave = [{ type: 'grunt', dx: 0, dz: 0 }, { type: 'brute', dx: 3, dz: 0 }, { type: 'knife', dx: -3, dz: 0 }, { type: 'grunt', dx: 0, dz: 4 }];
    const w2 = scaleWave(wave, 2);
    expect(w2).toHaveLength(6);
    expect(w2.slice(4).every((e) => e.type !== 'brute')).toBe(true);
    expect(w2[4].dx).not.toBe(wave[0].dx);
    expect(scaleWave([{ type: 'brute', dx: 0, dz: 0 }, { type: 'brute', dx: 1, dz: 0 }], 2)).toHaveLength(2);
  });
  it('attack tokens are per target player in the director', () => {
    const d = createDirector({ maxWindups: 2, minSpacing: 0.35, rng: createRng(1) });
    const c = (id, target) => ({ id, ready: true, target });
    const cands = [c('a', 'p0'), c('b', 'p0'), c('c', 'p0'), c('d', 'p1'), c('e', 'p1'), c('f', 'p1')];
    const started = [];
    for (let i = 0; i < 20; i++) started.push(...d.tick(0.4, cands));
    expect(d.activeOn('p0')).toBe(2);
    expect(d.activeOn('p1')).toBe(2);
    expect(started).toHaveLength(4);
  });
  it('without targets the director is the single shared pool it always was', () => {
    const a = createDirector({ maxWindups: 2, rng: createRng(4) }), b = createDirector({ maxWindups: 2, rng: createRng(4) });
    const cands = ['a', 'b', 'c', 'd'].map((id) => ({ id, ready: true }));
    for (let i = 0; i < 10; i++) expect(a.tick(0.4, cands)).toEqual(b.tick(0.4, cands.map((x) => ({ ...x, target: undefined }))));
    expect(a.active.size).toBe(2);
  });
});

describe('XP per player', () => {
  const players = [{ id: 0 }, { id: 1 }];
  it("a player's own KO, counter or chain is theirs alone", () => {
    expect(xpRecipients('ko', { player: { id: 1 } }, players)).toEqual([1]);
    expect(xpRecipients('counter', { player: { id: 0 } }, players)).toEqual([0]);
    expect(creditsOwner('ko', { player: { id: 1 } })).toBe(false);
    expect(creditsOwner('chainDone', { player: { id: 0 } })).toBe(true);
  });
  it('team events (a fight won, a trophy, a crime) credit everyone', () => {
    expect(xpRecipients('fightDone', { id: 'f1' }, players)).toEqual([0, 1]);
    expect(xpRecipients('trophy', undefined, players)).toEqual([0, 1]);
    expect(creditsOwner('fightDone', {})).toBe(true);
  });
  it('single player: every event with no player still credits the save', () => {
    expect(creditsOwner('ko', { target: {} })).toBe(true);
    expect(creditsOwner('ko', undefined)).toBe(true);
  });
});
