import { describe, it, expect } from 'vitest';
import { KITS, kitById, availableKits, kitProblems, buildKitModel, registerModelBuilder, hasModelBuilder, DEFAULT_KIT } from '../../src/heroes/roster.js';

describe('hero kits', () => {
  it('the roster is the three existing suits, each a complete kit', () => {
    expect(KITS.map((k) => k.id)).toEqual(['m', 'f', 'gold']);
    for (const k of KITS) expect(kitProblems(k)).toEqual([]);
  });
  it('unknown ids (an odd save) fall back to the default kit', () => {
    expect(kitById('f').id).toBe('f');
    expect(kitById('nope').id).toBe(DEFAULT_KIT);
  });
  it('the gold suit needs its unlock', () => {
    expect(availableKits({}).map((k) => k.id)).toEqual(['m', 'f']);
    expect(availableKits({ goldUnlocked: true }).map((k) => k.id)).toEqual(['m', 'f', 'gold']);
  });
  it('kits are data: frozen, with gadget and move names only', () => {
    for (const k of KITS) {
      expect(Object.isFrozen(k)).toBe(true);
      expect(k.gadgets.every((g) => typeof g === 'string')).toBe(true);
      expect(k.moves.counters.length).toBeGreaterThan(0);
    }
    expect(kitProblems({ id: 'x' }).length).toBeGreaterThan(0);
  });
  it('builds the bat body for the built-in builder, a registered one for others, and falls back safely', () => {
    const calls = [];
    const createBat = (assets, suit) => { calls.push(suit); return { suit }; };
    expect(buildKitModel(kitById('f'), {}, { createBat })).toEqual({ suit: 'f' });
    const robin = { ...kitById('m'), id: 'robin', model: { builder: 'robinTest', suit: 'm' } };
    expect(buildKitModel(robin, {}, { createBat })).toEqual({ suit: 'm' }); // not registered yet
    expect(hasModelBuilder('robinTest')).toBe(false);
    registerModelBuilder('robinTest', (assets, kit) => ({ built: kit.id }));
    expect(hasModelBuilder('robinTest')).toBe(true);
    expect(buildKitModel(robin, {}, { createBat })).toEqual({ built: 'robin' });
    expect(calls).toEqual(['f', 'm']);
  });
});
