// [prog] suits: data consistency for the wardrobe (src/progress/suitData.js) and the run-time
// wardrobe (src/progress/wardrobe.js): unlocks, perks, NG+ rewards, the saved field and toasts.
import { describe, it, expect } from 'vitest';
import { SUITS, SUIT_IDS, suitUnlocked } from '../../src/heroes/models/suits.js';
import { HEROES } from '../../src/heroes/roster.js';
import { BASE_EFFECTS } from '../../src/progress/upgrades.js';
import {
  WARDROBE_ALL, WARDROBE_IDS, NEW_BATMAN_SUITS, NG_PLUS_REWARDS, PERK_OPS, wardrobeEntry, wardrobeFor,
  isSuitUnlocked, conditionMet, unlockText, suitPerkOps, activeSuitPerkOps, perkText, applyPerkOps, ngPlusRewards,
  sanitizeWardrobe, WARDROBE_DEFAULTS, LOCKABLE_IDS,
} from '../../src/progress/suitData.js';
import { createWardrobe, listNames } from '../../src/progress/wardrobe.js';
import { sanitizeProgress, loadProgress, newGameProgress } from '../../src/core/save.js';
import { createEvents } from '../../src/core/events.js';

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

// Sample saves covering every condition kind.
const SAMPLES = [
  {}, null, undefined, { finished: true }, { trophies: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], goldUnlocked: true },
  { crimes: { stopped: 50 } }, { challenges: { a: { best: 1, medal: 'gold' }, b: { best: 1, medal: 'gold' }, c: { best: 2, medal: 'gold' } } },
  { mode: { ngPlus: 1 } }, { mode: { ngPlus: 2 } }, { mode: 'junk' }, { wardrobe: { rewarded: ['noir'] } },
];

describe('suit data', () => {
  it('every suit in suits.js and every roster hero look has exactly one wardrobe entry', () => {
    expect(new Set(WARDROBE_IDS).size).toBe(WARDROBE_IDS.length);
    for (const id of SUIT_IDS) expect(wardrobeEntry(id), id).not.toBeNull();
    for (const h of HEROES) {
      for (const id of h.suits ?? [h.id]) expect(wardrobeEntry(id)?.hero, `${h.id}/${id}`).toBe(h.id);
      expect(wardrobeFor(h.id).length).toBeGreaterThan(0);
    }
  });

  it('keeps the suits.js conditions identical (same unlock object, same answers)', () => {
    for (const s of SUITS) {
      expect(wardrobeEntry(s.id).unlock).toBe(s.unlock);
      for (const p of SAMPLES) if (!p?.wardrobe) expect(conditionMet(s.id, p), `${s.id}`).toBe(suitUnlocked(s, p));
    }
    // Heroes without suits stay open, as the roster has them.
    for (const h of HEROES.filter((x) => !x.suits)) expect(isSuitUnlocked(h.id, {})).toBe(true);
  });

  it('every unlock condition is a pure function of progress: boolean, never throws, no mutation', () => {
    for (const w of WARDROBE_ALL) {
      for (const p of SAMPLES) {
        const before = JSON.stringify(p ?? null);
        const a = isSuitUnlocked(w.id, p), b = isSuitUnlocked(w.id, p);
        expect(typeof a).toBe('boolean');
        expect(a).toBe(b);
        expect(JSON.stringify(p ?? null)).toBe(before);
      }
      if (w.unlock) expect(unlockText(w.id).length, w.id).toBeGreaterThan(5);
    }
    // A fresh save has every lockable look still locked.
    for (const id of LOCKABLE_IDS) expect(isSuitUnlocked(id, sanitizeProgress({})), id).toBe(false);
  });

  it('a campaign reward unlocks any look', () => {
    expect(isSuitUnlocked('noir', {})).toBe(false);
    expect(isSuitUnlocked('noir', { wardrobe: { rewarded: ['noir'] } })).toBe(true);
    expect(isSuitUnlocked('nope', { wardrobe: { rewarded: ['nope'] } })).toBe(false);
  });

  it('new Batman suits: 2-4 original looks with full palettes, new ids, one NG+ reward', () => {
    expect(NEW_BATMAN_SUITS.length).toBeGreaterThanOrEqual(2);
    expect(NEW_BATMAN_SUITS.length).toBeLessThanOrEqual(4);
    for (const s of NEW_BATMAN_SUITS) {
      expect(s.hero).toBe('batman');
      for (const k of ['suit', 'dark', 'accent', 'emblem', 'line', 'cape', 'lens', 'skin']) expect(typeof s.look.palette[k], `${s.id}.${k}`).toBe('number');
      expect(typeof s.unlock.test).toBe('function');
    }
    expect(conditionMet('sentinel', { mode: { ngPlus: 1 } })).toBe(true);
    expect(conditionMet('sentinel', { mode: { ngPlus: 0 } })).toBe(false);
    expect(conditionMet('ashen', { mode: { ngPlus: 2 } })).toBe(true);
    expect(conditionMet('harbour', SAMPLES[6])).toBe(true);
    expect(conditionMet('field-repair', { crimes: { stopped: 30 } })).toBe(true);
  });

  it('perk ops reference BASE_EFFECTS number keys with valid ops; text for every perk', () => {
    let withPerk = 0;
    for (const w of WARDROBE_ALL) {
      const ops = suitPerkOps(w.id);
      for (const [key, op, v] of ops) {
        expect(key in BASE_EFFECTS, `${w.id}: ${key}`).toBe(true);
        expect(PERK_OPS).toContain(op);
        expect(typeof BASE_EFFECTS[key]).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
      if (ops.length) { withPerk++; expect(perkText(w.id)).toMatch(/: /); } else expect(perkText(w.id)).toBe('');
    }
    expect(withPerk).toBeGreaterThan(10);
    expect(suitPerkOps('nope')).toEqual([]);
  });

  it('perks are light and only apply with settings.suitPerks', () => {
    expect(activeSuitPerkOps('stealth', { suitPerks: false })).toEqual([]);
    expect(activeSuitPerkOps('stealth', {})).toEqual([]);
    expect(activeSuitPerkOps('stealth', { suitPerks: true })).toEqual([['footstepNoise', 'mul', 0.85]]);
    const e = applyPerkOps({ ...BASE_EFFECTS }, activeSuitPerkOps('armoured', { suitPerks: true }));
    expect(e.damageMult).toBeCloseTo(0.95);
    expect(e.glideMax).toBe(BASE_EFFECTS.glideMax - 2);
    expect(applyPerkOps({ ...BASE_EFFECTS }, activeSuitPerkOps('arctic', { suitPerks: true })).coldMult).toBeCloseTo(0.6);
    // Light: every multiplier within 15% (arctic/robin-winter cold resist up to 40%), adds small.
    for (const w of WARDROBE_ALL) {
      for (const [key, op, v] of suitPerkOps(w.id)) {
        if (op === 'mul') expect(Math.abs(1 - v), `${w.id} ${key}`).toBeLessThanOrEqual((['coldMult', 'fireMult', 'gasMult'].includes(key) ? 0.4 : 0.15) + 1e-9);
        if (op === 'add') expect(Math.abs(v) / Math.max(1, Math.abs(BASE_EFFECTS[key])), `${w.id} ${key}`).toBeLessThanOrEqual(0.1);
      }
    }
    // The ops array returned is a copy.
    suitPerkOps('stealth')[0][2] = 0;
    expect(suitPerkOps('stealth')[0][2]).toBe(0.85);
  });

  it('NG+ rewards resolve to wardrobe looks unlocked at that level', () => {
    expect(ngPlusRewards(0)).toEqual([]);
    expect(ngPlusRewards(1)).toEqual([{ kind: 'suit', id: 'sentinel', name: 'Sentinel' }]);
    expect(ngPlusRewards(2).map((r) => r.id)).toEqual(['ashen']);
    expect(ngPlusRewards(99)).toEqual([]);
    expect(ngPlusRewards(NaN)).toEqual([]);
    for (const r of NG_PLUS_REWARDS) {
      expect(wardrobeEntry(r.id)).not.toBeNull();
      expect(isSuitUnlocked(r.id, { mode: { ngPlus: r.level } })).toBe(true);
      expect(isSuitUnlocked(r.id, { mode: { ngPlus: r.level - 1 } })).toBe(false);
    }
  });
});

describe('wardrobe save field', () => {
  it('sanitises junk to safe defaults', () => {
    expect(sanitizeWardrobe(undefined)).toEqual({ ...WARDROBE_DEFAULTS, rewarded: [], seen: [], equipped: {} });
    expect(sanitizeWardrobe('x')).toEqual({ rewarded: [], seen: [], equipped: {}, primed: false });
    const w = sanitizeWardrobe({ rewarded: ['noir', 'noir', 'zzz', 5], seen: ['stealth', null], equipped: { nightwing: 'nightwing-red', robin: 'nightwing', zzz: 'm', batman: 'robin' }, primed: true });
    expect(w).toEqual({ rewarded: ['noir'], seen: ['stealth'], equipped: { nightwing: 'nightwing-red' }, primed: true });
  });

  it('an old save (no wardrobe field) loads, and the field survives a new game', () => {
    const st = memoryStorage();
    st.setItem('gotham-progress-v1', JSON.stringify({ step: 4, suit: 'gold', goldUnlocked: true, trophies: [1, 2] }));
    const p = loadProgress(st);
    expect(p.suit).toBe('gold');
    expect(p.goldUnlocked).toBe(true);
    expect(p.wardrobe).toEqual({ rewarded: [], seen: [], equipped: {}, primed: false });
    p.wardrobe.rewarded.push('noir');
    expect(newGameProgress(p).wardrobe.rewarded).toEqual(['noir']);
    expect(sanitizeProgress(JSON.parse(JSON.stringify(p))).wardrobe.rewarded).toEqual(['noir']);
  });
});

describe('run-time wardrobe', () => {
  const setup = (progress) => {
    const events = createEvents();
    const cards = [], unlocked = [];
    let saves = 0;
    const hud = { card: (t, x) => cards.push([t, x]) };
    events.on('suitUnlocked', ({ id }) => unlocked.push(id));
    const w = createWardrobe({ events, getProgress: () => progress, save: () => { saves++; }, getHud: () => hud });
    return { events, cards, unlocked, w, get saves() { return saves; } };
  };

  it('a returning save gets one batched card, no events; then new unlocks toast once each', () => {
    const p = sanitizeProgress({ finished: true, trophies: [0, 1, 2] });
    const t = setup(p);
    t.w.check();
    expect(t.cards.length).toBe(1);
    expect(t.cards[0][0]).toBe('NEW SUITS IN THE VAULT');
    expect(t.cards[0][1]).toMatch(/Armoured, .* and /);
    expect(t.unlocked).toEqual([]);
    expect(p.wardrobe.primed).toBe(true);
    t.w.check();
    expect(t.cards.length).toBe(1);
    p.crimes.stopped = 5;
    t.events.emit('crimeStopped', { count: 5 });
    t.w.update(2.1);
    expect(t.unlocked).toEqual(['stealth']);
    expect(t.cards[1][0]).toBe('NEW SUIT: STEALTH');
    t.w.update(2.1);
    expect(t.cards.length).toBe(2);
  });

  it('a fresh save primes silently; a campaign reward unlocks and toasts', () => {
    const p = sanitizeProgress({});
    const t = setup(p);
    t.w.check();
    expect(t.cards).toEqual([]);
    t.events.emit('campaignReward', { id: 'suit.noir' });
    expect(p.wardrobe.rewarded).toEqual(['noir']);
    expect(t.unlocked).toEqual(['noir']);
    expect(t.cards[0][0]).toBe('NEW SUIT: NOIR');
    t.events.emit('campaignReward', { id: 'suit.noir' });
    t.events.emit('campaignReward', { id: 'suit.bogus' });
    t.events.emit('campaignReward', { id: 'gadget.emp' });
    expect(t.cards.length).toBe(1);
  });

  it('a reward as the very first check is a real toast, not part of the returning-save batch', () => {
    const p = sanitizeProgress({});
    const t = setup(p);
    t.events.emit('campaignReward', { id: 'suit.field-repair' });
    expect(t.unlocked).toEqual(['field-repair']);
    expect(t.cards).toEqual([['NEW SUIT: FIELD REPAIR', expect.stringContaining('Batcave suit vault')]]);
  });

  it('equips: Batman sets progress.suit; others set wardrobe.equipped; locked looks refuse', () => {
    const p = sanitizeProgress({ crimes: { stopped: 10 } });
    const t = setup(p);
    expect(t.w.equip('stealth')).toBe(true);
    expect(p.suit).toBe('stealth');
    expect(t.w.wearing('batman')).toBe('stealth');
    expect(t.w.equip('noir')).toBe(false);
    expect(t.w.equip('nightwing-tactical')).toBe(true);
    expect(p.wardrobe.equipped.nightwing).toBe('nightwing-tactical');
    expect(p.suit).toBe('stealth');
    expect(t.w.wearing('nightwing')).toBe('nightwing-tactical');
    expect(t.w.equip('sentinel')).toBe(false); // tailored later (not in suits.js yet), and locked
    expect(t.w.wearing('superman')).toBe('superman');
  });

  it('no HUD (title screen): nothing is marked seen', () => {
    const p = sanitizeProgress({ finished: true });
    const w = createWardrobe({ events: createEvents(), getProgress: () => p, getHud: () => null });
    w.check();
    expect(p.wardrobe?.primed ?? false).toBe(false);
  });

  it('lists names in comic English', () => {
    expect(listNames(['A'])).toBe('A');
    expect(listNames(['A', 'B'])).toBe('A and B');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
