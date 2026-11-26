import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';
import { createCityDirector, governor, HEAT, CAPS } from '../../src/openworld/director.js';
import { sanitizeOpenworld } from '../../src/openworld/save.js';
import { crimeType } from '../../src/openworld/crimeTypes.js';
import { REGION_CRIME_SPOTS, DISTRICT_IDS } from '../../src/world/regions/data.js';
import { CRIME_SPOTS } from '../../src/game/crimes.js';
import { sanitizeProgress } from '../../src/core/save.js';

const SPOTS = [...CRIME_SPOTS, ...REGION_CRIME_SPOTS];
const make = (seed = 1, store = sanitizeOpenworld({})) => createCityDirector({ store, rng: createRng(seed), spots: SPOTS });
const loopHero = { x: 0, z: -420 };

describe('heat', () => {
  it('starts every district warm but not hot, and the save keeps it', () => {
    const store = sanitizeOpenworld({});
    const d = make(1, store);
    for (const id of DISTRICT_IDS) expect(d.heat(id)).toBe(1);
    d.bump('loop', 1.5);
    const back = sanitizeOpenworld(JSON.parse(JSON.stringify(store)));
    expect(back.districts.loop.heat).toBe(2.5);
  });
  it('a stopped crime cools the district, more for a harder one; failures heat it', () => {
    const d = make();
    d.district('narrows').heat = 3;
    d.outcome('narrows', { outcome: 'stopped', tier: 2, gang: 'narrowsCrew' });
    expect(d.heat('narrows')).toBeCloseTo(3 + HEAT.stopped + 2 * HEAT.stoppedPerTier, 5);
    d.outcome('narrows', { outcome: 'expired', gang: 'narrowsCrew' });
    d.outcome('narrows', { outcome: 'getaway', gang: 'narrowsCrew' });
    expect(d.heat('narrows')).toBeGreaterThan(2);
    expect(d.district('narrows').failed).toBe(2);
  });
  it('walking away or the story calling it off is not neglect', () => {
    const d = make();
    d.outcome('loop', { outcome: 'abandoned' });
    d.outcome('loop', { outcome: 'cancelled' });
    expect(d.heat('loop')).toBe(1);
  });
  it('neglect at night warms a district slowly; daylight cools it', () => {
    const d = make();
    for (let i = 0; i < 600; i++) d.tick(1, { hour: 23, visited: [], gov: { spawn: false, age: true, cap: 0 } });
    expect(d.heat('loop')).toBeGreaterThan(1);
    expect(d.heat('loop')).toBeLessThan(HEAT.idleBase + 0.5);
    const e = make();
    e.district('loop').heat = 2;
    for (let i = 0; i < 600; i++) e.tick(1, { hour: 12, visited: [], gov: { spawn: false, age: true, cap: 0 } });
    expect(e.heat('loop')).toBeLessThan(2);
  });
  it('moods and civilian density follow heat; mood changes are announced', () => {
    const d = make();
    d.district('yards').heat = 0.2;
    expect(d.mood('yards')).toBe('safe');
    expect(d.densityScale('yards')).toBeGreaterThan(1);
    d.drain();
    d.bump('yards', 4.5);
    expect(d.mood('yards')).toBe('lawless');
    expect(d.densityScale('yards')).toBeLessThan(1);
    expect(d.drain().some((e) => e.type === 'mood' && e.district === 'yards' && e.mood === 'lawless')).toBe(true);
  });
});

describe('gang control and lieutenants', () => {
  it('stopping a gang takes territory from it; siding with one gives it territory', () => {
    const d = make();
    const c = d.district('chinatown').control;
    const triad = c.triad;
    d.outcome('chinatown', { outcome: 'stopped', tier: 1, gang: 'triad', gangs: ['triad'] });
    expect(c.triad).toBeLessThan(triad);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const before = c.odessaMob ?? 0;
    d.outcome('chinatown', { outcome: 'stopped', tier: 1, gangs: ['triad', 'odessaMob'], sided: 'odessaMob' });
    expect(c.odessaMob).toBeGreaterThan(before);
  });
  it('a boiling district dominated by one gang gets a lieutenant, who remembers how he lost', () => {
    const d = make(4);
    d.district('parkRow').heat = 4.8;
    d.shift('parkRow', 'parkRowCrew', 0.6);
    d.tick(0.1, { hour: 23, visited: [], gov: { spawn: false, age: true, cap: 0 } });
    const lt = d.district('parkRow').lt;
    expect(lt?.name).toBeTruthy();
    expect(lt.gang).toBe('parkRowCrew');
    expect(d.drain().some((e) => e.type === 'lieutenant')).toBe(true);
    d.lieutenantBeaten('parkRow', ['gadgets']);
    expect(d.district('parkRow').lt.memory).toEqual(['gadgets']);
    expect(d.heat('parkRow')).toBeLessThan(4.8);
    d.lieutenantBeaten('parkRow', ['counters']);
    expect(d.district('parkRow').lt).toBe(null);
  });
  it('cocky: hot districts whose gang does not fear the Bat', () => {
    const d = make();
    d.district('narrows').heat = 4.5;
    expect(d.cocky('narrows', { value: 30, gangs: {} })).toBeGreaterThan(0.5);
    expect(d.cocky('narrows', { value: 90, gangs: {} })).toBe(0);
    expect(d.cocky('loop', { value: 30, gangs: {} })).toBe(0);
  });
});

describe('spawn selection', () => {
  it('picks a visited district near a hero, a type that fits, and a spot not on top of anyone', () => {
    const d = make(2);
    let req = null;
    for (let i = 0; i < 200 && !req; i++) req = d.tick(1, { hour: 23, visited: ['loop'], heroes: [loopHero], live: [] });
    expect(req.district).toBe('loop');
    expect(crimeType(req.type)).toBeTruthy();
    const dist = Math.hypot(req.spot.x - loopHero.x, req.spot.z - loopHero.z);
    expect(dist).toBeGreaterThan(35);
    expect(req.life).toBeGreaterThan(100);
  });
  it('never repeats a type three times running, and spreads crimes out', () => {
    const d = make(3);
    const types = [];
    const live = [];
    for (let i = 0; i < 2000 && types.length < 12; i++) {
      const r = d.tick(1, { hour: 23, visited: ['loop', 'gothamMile', 'river', 'lowerGotham'], heroes: [loopHero], live });
      if (r) { types.push(r.type); live.push(r.spot); if (live.length > 3) live.shift(); }
    }
    for (let i = 2; i < types.length; i++) expect(types[i] === types[i - 1] && types[i] === types[i - 2]).toBe(false);
    expect(new Set(types).size).toBeGreaterThan(5);
  });
  it('several crimes can be live at once, up to the quality cap', () => {
    const d = make(5);
    const live = [];
    for (let i = 0; i < 3000; i++) {
      const r = d.tick(1, { hour: 23, visited: ['loop', 'gothamMile'], heroes: [loopHero], live, quality: 'low' });
      if (r) live.push(r.spot);
    }
    expect(live.length).toBe(CAPS.low);
  });
  it('heat changes the mix: hot districts get hostages, bombs and gang wars; cool ones get muggings', () => {
    const count = (heat, seed) => {
      const store = sanitizeOpenworld({});
      const d = make(seed, store);
      d.district('loop').heat = heat;
      const seen = {};
      const live = [];
      for (let i = 0; i < 6000; i++) {
        const r = d.tick(1, { hour: 23, visited: ['loop'], heroes: [loopHero], live });
        if (r) { seen[r.type] = (seen[r.type] ?? 0) + 1; d.district('loop').heat = heat; }
      }
      return seen;
    };
    const cool = count(0.2, 7), hot = count(4.6, 7);
    expect(cool.bomb ?? 0).toBe(0);
    expect(cool.gangWar ?? 0).toBe(0);
    expect((hot.bomb ?? 0) + (hot.gangWar ?? 0) + (hot.hostageStore ?? 0)).toBeGreaterThan(0);
    expect(hot.mugging ?? 0).toBe(0);
  });
  it('steers clear of the story objective', () => {
    const d = make(8);
    const avoid = { x: 0, z: -420 };
    for (let i = 0; i < 3000; i++) {
      const r = d.tick(1, { hour: 23, visited: ['loop'], heroes: [loopHero], live: [], avoid });
      if (r) expect(Math.hypot(r.spot.x - avoid.x, r.spot.z - avoid.z)).toBeGreaterThanOrEqual(70);
    }
  });
});

describe('pacing governor', () => {
  it('free roam gets the full cap; a waiting story objective at most two, after a quiet spell', () => {
    expect(governor({ freeRoam: true, quality: 'high' })).toEqual({ spawn: true, age: true, cap: CAPS.high });
    expect(governor({ stepType: 'reach', sinceStep: 5 }).spawn).toBe(false);
    expect(governor({ stepType: 'reach', sinceStep: 60 })).toEqual({ spawn: true, age: true, cap: 2 });
  });
  it('fights, bosses, cutscenes, chases, challenges, photo mode and side missions stop the clock', () => {
    for (const stepType of ['fight', 'boss', 'cutscene', 'chase', 'puzzle', 'fear']) expect(governor({ stepType })).toEqual({ spawn: false, age: false, cap: 0 });
    expect(governor({ freeRoam: true, challenge: true }).age).toBe(false);
    expect(governor({ freeRoam: true, photo: true }).age).toBe(false);
    expect(governor({ freeRoam: true, mission: true }).age).toBe(false);
    expect(governor({ mode: 'cutscene' }).age).toBe(false);
  });
  it('a forced crime (the dev hook) still respects a fight but skips the quiet spell', () => {
    const d = make(1);
    expect(d.tick(0.1, { stepType: 'reach', sinceStep: 1, visited: ['neon'], heroes: [{ x: 150, z: 60 }], forced: { type: 'robbery', spot: CRIME_SPOTS.find((s) => s.id === 'neonNorth') } })?.type).toBe('robbery');
    expect(d.tick(0.1, { stepType: 'fight', forced: { type: 'robbery', spot: CRIME_SPOTS[0] } })).toBe(null);
  });
});

describe('soak: 20 simulated minutes, no input', () => {
  it('runs a whole night on every district without growing state or getting stuck', () => {
    const store = sanitizeOpenworld({});
    const d = make(11, store);
    const live = [];
    let spawned = 0;
    const heroes = [{ x: 0, z: -420 }, { x: -400, z: -300 }];
    for (let t = 0; t < 1200; t += 0.25) {
      // Crimes nobody answers expire after their life: the city heats up.
      for (let i = live.length - 1; i >= 0; i--) if ((live[i].age += 0.25) > live[i].life) { d.outcome(live[i].district, { outcome: 'expired', gang: 'street' }); live.splice(i, 1); }
      const r = d.tick(0.25, { hour: 23, visited: DISTRICT_IDS, heroes, live: live.map((l) => l.spot), quality: 'medium' });
      if (r) { spawned++; live.push({ ...r, age: 0 }); }
      expect(live.length).toBeLessThanOrEqual(CAPS.medium);
      d.drain();
    }
    expect(spawned).toBeGreaterThan(15);
    for (const id of DISTRICT_IDS) expect(d.heat(id)).toBeLessThanOrEqual(5);
    expect(JSON.stringify(store).length).toBeLessThan(20000);
    // The save still loads.
    const p = sanitizeProgress({ openworld: JSON.parse(JSON.stringify(store)) });
    expect(Object.keys(p.openworld.districts).length).toBe(Object.keys(store.districts).length);
  });
});

describe('save', () => {
  it('an old save without the field loads with an empty open world', () => {
    const p = sanitizeProgress({ step: 3, trophies: [1, 2] });
    expect(p.openworld.districts).toEqual({});
    expect(p.openworld.collect.riddles).toEqual([]);
    expect(p.openworld.contracts.tier).toBe(0);
  });
  it('junk is dropped, numbers are clamped', () => {
    const s = sanitizeOpenworld({ districts: { loop: { heat: 99, control: { triad: 3, '!!': 1 } }, 'bad id': {} }, arrests: -4, types: { robbery: 2.7 }, rep: { value: 140, gangs: { triad: 20 } } });
    expect(s.districts.loop.heat).toBe(5);
    expect(s.districts.loop.control).toEqual({ triad: 1 });
    expect(s.districts['bad id']).toBeUndefined();
    expect(s.arrests).toBe(0);
    expect(s.types.robbery).toBe(2);
    expect(s.rep.value).toBe(100);
  });
});
