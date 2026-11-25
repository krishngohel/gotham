import { describe, it, expect } from 'vitest';
import { createTether, TETHER } from '../../src/coop/tether.js';
import { createReviveRules, REVIVE } from '../../src/players/coopRules.js';
import { reviveView, REVIVE_ACTION } from '../../src/coop/revive.js';
import { airJumpAction, canGlide, flightStep, regenStamina } from '../../src/heroes/traversal.js';
import { TRAVERSAL_PROFILES, KITS, kitById, kitInfo, ALL_KIT_IDS, HEROES, heroOfKit, isKitId, heroKits, kitProblems } from '../../src/heroes/roster.js';
import { sanitizeCoop } from '../../src/coop/coopSave.js';
import { sanitizeProgress, loadProgress, saveProgress, DEFAULT_PROGRESS } from '../../src/core/save.js';
import { SUIT_IDS } from '../../src/heroes/models/suits.js';

describe('the tether', () => {
  it('warns past the warn distance, regroups after the countdown, and clears when they come back', () => {
    const t = createTether();
    expect(t.update(1, { mission: true, dist: 40 }).warn).toBe(false);
    let r = t.update(1, { mission: true, dist: TETHER.warn + 5 });
    expect(r.warn).toBe(true);
    expect(r.left).toBeCloseTo(TETHER.warnTime - 1);
    r = t.update(TETHER.warnTime, { mission: true, dist: TETHER.warn + 5 });
    expect(r.regroup).toBe(true);
    // Come back together: it unwinds.
    t.update(3, { mission: true, dist: TETHER.warn + 5 });
    for (let i = 0; i < 10; i++) t.update(1, { mission: true, dist: 10 });
    expect(t.update(0.1, { mission: true, dist: TETHER.warn + 5 }).left).toBeGreaterThan(TETHER.warnTime - 1);
  });
  it('far beyond the hard limit regroups fast; height counts too', () => {
    const t = createTether();
    expect(t.update(TETHER.hardTime + 0.1, { mission: true, dist: TETHER.hard + 1 }).regroup).toBe(true);
    const u = createTether();
    expect(u.update(1, { mission: true, dist: 5, dy: TETHER.dy + 1 }).warn).toBe(true);
  });
  it('never fires outside a mission or with a player down (revive first)', () => {
    const t = createTether();
    expect(t.update(100, { mission: false, dist: 999 }).regroup).toBe(false);
    expect(t.update(100, { mission: true, dist: 999, anyDown: true }).regroup).toBe(false);
  });
});

describe('hold to revive', () => {
  const pos = (x) => ({ x, z: 0 });
  it('standing in the zone is not enough: the helper must hold the revive button', () => {
    const r = createReviveRules({ hold: true });
    r.down(0);
    const players = [{ id: 0, down: true, pos: pos(0) }, { id: 1, down: false, pos: pos(1), holding: false }];
    for (let i = 0; i < 10; i++) expect(r.update(0.5, players)).toEqual([]);
    players[1].holding = true;
    let out = [];
    for (let t = 0; t < REVIVE.time + 0.2 && !out.length; t += 0.1) out = r.update(0.1, players).slice();
    expect(out).toEqual([{ type: 'revived', id: 0, by: 1 }]);
  });
  it('holding from outside the zone does nothing; letting go drains the ring', () => {
    const r = createReviveRules({ hold: true });
    r.down(0);
    const far = [{ id: 0, down: true, pos: pos(0) }, { id: 1, down: false, pos: pos(REVIVE.radius + 1), holding: true }];
    r.update(1, far);
    expect(r.state(0).progress).toBe(0);
    const near = [{ id: 0, down: true, pos: pos(0) }, { id: 1, down: false, pos: pos(1), holding: true }];
    r.update(0.6, near);
    const p = r.state(0).progress;
    expect(p).toBeGreaterThan(0);
    near[1].holding = false;
    r.update(0.1, near);
    expect(r.state(0).progress).toBeLessThan(p);
  });
  it('without hold the old proximity rule is unchanged', () => {
    const r = createReviveRules();
    r.down(0);
    let out = [];
    for (let t = 0; t < REVIVE.time + 0.2 && !out.length; t += 0.1) out = r.update(0.1, [{ id: 0, down: true, pos: pos(0) }, { id: 1, down: false, pos: pos(1) }]).slice();
    expect(out[0].type).toBe('revived');
  });
  it('the view reads the revive button from each player input and reuses its entries', () => {
    const held = new Set([REVIVE_ACTION]);
    const players = [
      { id: 0, hero: { dead: true, pos: pos(0) }, input: { down: () => false } },
      { id: 1, hero: { dead: false, pos: pos(1) }, input: { down: (a) => held.has(a) } },
    ];
    const out = [];
    reviveView(players, out, () => false);
    const first = out[1];
    expect(out[1]).toMatchObject({ id: 1, down: false, holding: true });
    expect(out[0]).toMatchObject({ id: 0, down: true, holding: false });
    reviveView(players, out, () => false);
    expect(out[1]).toBe(first);
  });
});

describe('kit traversal', () => {
  const G = TRAVERSAL_PROFILES;
  it('the Bat family glides and has no air jump (today\'s hero)', () => {
    expect(canGlide(G.glide)).toBe(true);
    expect(airJumpAction(G.glide, { airT: 1, flipsUsed: 0, stamina: 0, canFly: true, heightAboveGround: 5 })).toBe(null);
    expect(G.glide.jump).toBe(1);
    expect(G.glide.run).toBe(1);
    expect(kitInfo(kitById('m')).traversal).toBe(G.glide);
  });
  it('acrobats flip once per jump and never glide', () => {
    expect(canGlide(G.acrobat)).toBe(false);
    expect(airJumpAction(G.acrobat, { airT: 0.3, flipsUsed: 0 })).toBe('flip');
    expect(airJumpAction(G.acrobat, { airT: 0.3, flipsUsed: 1 })).toBe(null);
    expect(airJumpAction(G.acrobat, { airT: 0.05, flipsUsed: 0 })).toBe(null);
    expect(G.acrobat.jump).toBeGreaterThan(1);
  });
  it('flight takes off only with stamina, where allowed, off the ground', () => {
    const o = { airT: 0.3, flipsUsed: 0, stamina: 5, canFly: true, heightAboveGround: 2 };
    expect(airJumpAction(G.flight, o)).toBe('fly');
    expect(airJumpAction(G.flight, { ...o, canFly: false })).toBe(null);
    expect(airJumpAction(G.flight, { ...o, stamina: 0.5 })).toBe(null);
    expect(airJumpAction(G.flight, { ...o, heightAboveGround: 0.2 })).toBe(null);
  });
  it('flight burns stamina, is faster with sprint, and is capped below the ceiling', () => {
    const f = G.flight.flight;
    const hover = flightStep(f, { stamina: 10, dt: 1, height: 5 });
    expect(hover.stamina).toBeCloseTo(10 - f.hoverDrain);
    const fast = flightStep(f, { wishX: 1, mag: 1, fast: true, stamina: 10, dt: 1, height: 5 });
    expect(fast.vx).toBe(f.fast);
    const slow = flightStep(f, { wishX: 1, mag: 1, stamina: 10, dt: 1, height: 5 });
    expect(slow.vx).toBe(f.speed);
    expect(flightStep(f, { climb: true, stamina: 10, dt: 0.1, height: f.ceiling }).vy).toBe(0);
    expect(flightStep(f, { climb: true, stamina: 10, dt: 0.1, height: f.ceiling + 5 }).vy).toBeLessThan(0);
    expect(flightStep(f, { climb: true, stamina: 10, dt: 0.1, height: 3 }).vy).toBe(f.climb);
    expect(flightStep(f, { stamina: 0.1, dt: 1, height: 5 }).done).toBe(true);
    expect(regenStamina(f, 0, 1, true)).toBe(f.regen);
    expect(regenStamina(f, f.stamina, 10, true)).toBe(f.stamina);
  });
});

describe('the co-op roster', () => {
  it('keeps the legacy kits as they were and adds every co-op hero', () => {
    expect(KITS.map((k) => k.id)).toEqual(['m', 'f', 'gold']);
    expect(kitById('m')).toBe(KITS[0]);
    const heroes = HEROES.map((h) => h.id);
    for (const id of ['batman', 'batwoman', 'nightwing', 'robin', 'robin-modern', 'robin-staff', 'batgirl', 'red-hood', 'future-bat', 'gaslight-bat', 'superman']) expect(heroes).toContain(id);
    for (const id of ALL_KIT_IDS) {
      expect(isKitId(id)).toBe(true);
      expect(kitById(id).id).toBe(id);
      expect(kitProblems(kitById(id))).toEqual([]);
    }
  });
  it('every Batman suit in the suit table is a kit; every hero has two signature moves', () => {
    for (const id of SUIT_IDS) expect(isKitId(id)).toBe(true);
    for (const h of HEROES) {
      expect(h.signature.length).toBeGreaterThanOrEqual(2);
      for (const s of h.signature) if (!s.native) { expect(typeof s.clip).toBe('string'); expect(h.packs).toContain(s.pack); expect(s.contact).toBeGreaterThan(0); }
    }
    expect(heroOfKit(kitById('robin-winter')).id).toBe('robin');
    expect(heroOfKit(kitById('f')).id).toBe('batwoman');
  });
  it('kits play differently: traversal styles and stats differ', () => {
    const styles = new Set(HEROES.map((h) => kitInfo(kitById((h.suits ?? [h.id])[0])).traversal.style));
    expect([...styles].sort()).toEqual(['acrobat', 'flight', 'glide', 'grapple', 'wings']);
    expect(kitInfo(kitById('superman')).stats.toughness).toBeGreaterThan(1);
    expect(kitInfo(kitById('robin')).stats.speed).toBeGreaterThan(1);
  });
  it('locked suits stay locked for a fresh save; heroes without suits are open', () => {
    const locked = heroKits('batman', (id) => id === 'm');
    expect(locked.find((k) => k.kit.id === 'm').locked).toBe(false);
    expect(locked.find((k) => k.kit.id === 'noir').locked).toBe(true);
    expect(heroKits('superman', () => false)[0].locked).toBe(false);
  });
});

describe('co-op save data', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  it('old saves keep loading: m, f and gold suits, and no co-op field', () => {
    for (const suit of ['m', 'f', 'gold']) {
      const st = store();
      st.setItem('gotham-progress-v1', JSON.stringify({ step: 4, suit }));
      const p = loadProgress(st);
      expect(p.suit).toBe(suit);
      expect(p.step).toBe(4);
      expect(p.coop).toEqual({ picks: [null, null], split: 'vertical' });
    }
  });
  it('the new suits persist; junk does not', () => {
    expect(sanitizeProgress({ suit: 'year-one' }).suit).toBe('year-one');
    expect(sanitizeProgress({ suit: 'robin-winter' }).suit).toBe('robin-winter');
    expect(sanitizeProgress({ suit: 'zzz' }).suit).toBe(null);
    expect(sanitizeProgress({ suit: 7 }).suit).toBe(null);
  });
  it('remembers each player pick and the layout, sanitised', () => {
    expect(sanitizeCoop({ picks: ['superman', 'robin-winter'], split: 'horizontal' })).toEqual({ picks: ['superman', 'robin-winter'], split: 'horizontal' });
    expect(sanitizeCoop({ picks: ['nope', 42], split: 'diagonal' })).toEqual({ picks: [null, null], split: 'vertical' });
    const st = store();
    saveProgress(st, { ...DEFAULT_PROGRESS, coop: { picks: ['batgirl', null], split: 'vertical' } });
    expect(loadProgress(st).coop.picks[0]).toBe('batgirl');
  });
});
