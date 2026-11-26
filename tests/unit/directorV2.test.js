import { describe, it, expect } from 'vitest';
import { createDirector, PRESSURE_AFTER } from '../../src/combat/director.js';
import { createRng } from '../../src/core/rng.js';

const c = (id, o = {}) => ({ id, ready: true, ...o });

describe('director v2: token budgets', () => {
  it('without a budget it behaves as before (cap only)', () => {
    const d = createDirector({ maxWindups: 2, minSpacing: 0, rng: createRng(1) });
    expect(d.tick(0.1, [c('a', { cost: 2 }), c('b', { cost: 2 }), c('c')]).length).toBe(2);
    expect(d.budgetFor(undefined)).toBe(Infinity);
  });
  it('the summed cost of melee wind-ups on one target never exceeds the budget', () => {
    const d = createDirector({ maxWindups: 5, minSpacing: 0, budget: 3, rng: createRng(2) });
    d.tick(0.1, [c('a', { cost: 2, target: 'p' }), c('b', { cost: 2, target: 'p' }), c('c', { cost: 1, target: 'p' })]);
    expect(d.tokensOn('p')).toBeLessThanOrEqual(3);
    expect(d.tokensOn('p')).toBeGreaterThanOrEqual(2);
  });
  it('an attack dearer than the whole budget may still go alone', () => {
    const d = createDirector({ maxWindups: 2, minSpacing: 0, budget: 1, rng: createRng(3) });
    expect(d.tick(0.1, [c('brute', { cost: 2, target: 'p' })])).toEqual(['brute']);
    expect(d.tick(0.1, [c('g', { cost: 1, target: 'p' })])).toEqual([]);
  });
  it('budgets are per target player', () => {
    const d = createDirector({ maxWindups: 4, minSpacing: 0, budget: 2, rng: createRng(4) });
    d.tick(0.1, [c('a', { cost: 2, target: 'p0' }), c('b', { cost: 2, target: 'p1' })]);
    expect(d.held('a')).toBe(true);
    expect(d.held('b')).toBe(true);
  });
  it('configure updates the budgets', () => {
    const d = createDirector({ maxWindups: 4, minSpacing: 0, rng: createRng(5) });
    d.configure({ budget: 1, rangedBudget: 2 });
    expect(d.budgetFor('p')).toBe(1);
  });
});

describe('director v2: ranged pool', () => {
  it('ranged tokens do not count against the melee cap, and are capped by rangedBudget', () => {
    const d = createDirector({ maxWindups: 1, minSpacing: 0, budget: 3, rangedBudget: 1, rng: createRng(6) });
    const got = d.tick(0.1, [c('m', { target: 'p' }), c('r1', { target: 'p', ranged: true }), c('r2', { target: 'p', ranged: true })]);
    expect(got).toContain('m');
    expect(got.filter((x) => x.startsWith('r')).length).toBe(1);
    expect(d.activeOn('p')).toBe(1);
  });
});

describe('director v2: pressure valve', () => {
  it('a target left alone for 2.5 s gets one extra token until the next start', () => {
    const d = createDirector({ maxWindups: 5, minSpacing: 0, budget: 1, rng: createRng(7) });
    d.tick(0.1, [c('a', { target: 'p', ready: false })]);
    expect(d.budgetFor('p')).toBe(1);
    d.tick(PRESSURE_AFTER, []);
    expect(d.budgetFor('p')).toBe(2);
    const got = d.tick(0.01, [c('a', { target: 'p' }), c('b', { target: 'p' })]);
    expect(got.length).toBe(2);
    expect(d.budgetFor('p')).toBe(1);
  });
});

describe('director v2: steal', () => {
  it('hands a token over without a cooldown for the giver', () => {
    const d = createDirector({ maxWindups: 1, minSpacing: 0, budget: 3, rng: createRng(8) });
    d.tick(0.1, [c('far', { target: 'p' })]);
    expect(d.steal('far', 'near')).toBe(true);
    expect(d.held('near')).toBe(true);
    expect(d.held('far')).toBe(false);
    expect(d.tokensOn('p')).toBe(1);
    d.release('near');
    // the giver was never put on cooldown: it can go again at once
    expect(d.tick(0.1, [c('far', { target: 'p' })])).toEqual(['far']);
  });
  it('refuses when the giver holds nothing or the taker already holds one', () => {
    const d = createDirector({ maxWindups: 2, minSpacing: 0, rng: createRng(9) });
    expect(d.steal('x', 'y')).toBe(false);
    d.tick(0.1, [c('a'), c('b')]);
    expect(d.steal('a', 'b')).toBe(false);
  });
});
