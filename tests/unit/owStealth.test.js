import { describe, it, expect, beforeAll } from 'vitest';
import { STEALTH_ENCOUNTERS, STEALTH_IDS, OPTIONAL_IDS, stealthMedal, encounterById } from '../../src/openworld/stealth/encounters.js';
import { createStealthEncounters, detectorPing, DETECTOR } from '../../src/openworld/stealth/runtime.js';
import { testContext } from '../../src/openworld/context.js';
import { REGION_SITES, DISTRICT_IDS, districtAt } from '../../src/world/regions/data.js';
import { SITES } from '../../src/world/mapData.js';
import { ENEMY } from '../../src/combat/rules.js';
import { GANGS } from '../../src/heroes/models/enemies.js';
import { sanitizeOpenworld } from '../../src/openworld/save.js';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

const siteOf = (s) => (typeof s === 'string' ? REGION_SITES[s] ?? SITES[s] ?? null : s);

describe('stealth encounter data', () => {
  it('has at least ten, with unique ids, in known districts', () => {
    expect(STEALTH_ENCOUNTERS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(STEALTH_IDS).size).toBe(STEALTH_IDS.length);
    for (const e of STEALTH_ENCOUNTERS) {
      expect(DISTRICT_IDS, e.id).toContain(e.district);
      expect(GANGS[e.gang], e.id).toBeTruthy();
      expect(e.title && e.blurb, e.id).toBeTruthy();
      expect(e.lines.length, e.id).toBeGreaterThan(0);
    }
  });
  it('every site resolves and sits in the district it claims', () => {
    for (const e of STEALTH_ENCOUNTERS) {
      const s = siteOf(e.site);
      expect(s, e.id).toBeTruthy();
      expect(districtAt(s.x, s.z), e.id).toBe(e.district);
      expect(Math.hypot(e.entry.x - s.x, e.entry.z - s.z), `${e.id} entry near the site`).toBeLessThan(e.radius + 12);
    }
  });
  it('squads use known roles on routes of two or more points; each has a detector lieutenant', () => {
    for (const e of STEALTH_ENCOUNTERS) {
      expect(e.squad.length, e.id).toBeGreaterThanOrEqual(4);
      for (const g of e.squad) {
        expect(ENEMY[g.type], `${e.id} ${g.type}`).toBeTruthy();
        expect(g.route.points.length).toBeGreaterThanOrEqual(2);
        expect(['pingpong', 'loop']).toContain(g.route.mode);
      }
      expect(e.squad.filter((g) => g.detector && g.type === 'lieutenant'), e.id).toHaveLength(1);
    }
  });
  it('medals are ordered and optional objectives are known', () => {
    for (const e of STEALTH_ENCOUNTERS) {
      expect(e.medals.gold).toBeLessThan(e.medals.silver);
      expect(e.medals.silver).toBeLessThan(e.medals.bronze);
      for (const o of e.optional) expect(OPTIONAL_IDS).toContain(o.id);
      const t = e.optional.find((o) => o.id === 'time');
      expect(t.limit, e.id).toBeGreaterThan(e.medals.gold);
    }
    const e = STEALTH_ENCOUNTERS[0];
    expect(stealthMedal(e, e.medals.gold)).toBe('gold');
    expect(stealthMedal(e, e.medals.silver)).toBe('silver');
    expect(stealthMedal(e, e.medals.bronze + 1)).toBe(null);
  });
  it('stays out of the story rooms (Night Four rookery, Night Five roundhouse)', () => {
    for (const e of STEALTH_ENCOUNTERS) {
      const s = siteOf(e.site);
      expect(Math.hypot(s.x + 340, s.z + 451), e.id).toBeGreaterThan(40);
      expect(Math.hypot(s.x + 530, s.z - 160), e.id).toBeGreaterThan(40);
    }
  });
});

describe('the detector lieutenant', () => {
  const heroes = [{ pos: { x: 0, y: 0, z: 5 }, crouched: false, dead: false }];
  it('hears a standing hero inside its range after a moment, not a crouched one', () => {
    const st = { t: 0 };
    expect(detectorPing({ x: 0, y: 0, z: 0 }, heroes, 0.2, st)).toBe(null);
    expect(detectorPing({ x: 0, y: 0, z: 0 }, heroes, DETECTOR.dwell, st)).toBe(heroes[0]);
    const st2 = { t: 0 };
    const quiet = [{ ...heroes[0], crouched: true }];
    expect(detectorPing({ x: 0, y: 0, z: 0 }, quiet, 5, st2)).toBe(null);
    const far = [{ ...heroes[0], pos: { x: 0, y: 0, z: DETECTOR.range + 1 } }];
    expect(detectorPing({ x: 0, y: 0, z: 0 }, far, 5, { t: 0 })).toBe(null);
  });
});

function fakeWorld(ow) {
  const began = [];
  let fight = null;
  ow.encounters = {
    begin(id, def) { began.push({ id, def }); fight = id; },
    end() { fight = null; },
    get id() { return fight; },
    get enemies() { return []; },
  };
  ow.stealth = { noise: () => 1, active: false };
  ow.combat = { enemies: [] };
  return began;
}

describe('the encounter runtime', () => {
  it('starts one, records the time, medal and optional objectives, and rewards it', () => {
    const ow = testContext({ store: sanitizeOpenworld({}) });
    const began = fakeWorld(ow);
    const enc = createStealthEncounters(ow);
    expect(enc.list()).toHaveLength(STEALTH_ENCOUNTERS.length);
    const e = encounterById('heraldNests');
    expect(enc.start('heraldNests')).toBe(true);
    expect(began[0].id).toBe('stealth:heraldNests');
    expect(began[0].def.stealth).toBe('heraldNests');
    expect(ow.players()[0].hero.pos.x).toBe(e.entry.x);
    enc.update(e.medals.gold - 5);
    ow.events.emit('fightDone', { id: 'stealth:heraldNests' });
    const r = ow.store.stealth.heraldNests;
    expect(r.medal).toBe('gold');
    expect(r.opts.sort()).toEqual(['noGadgets', 'time', 'unseen']);
    expect(enc.active).toBe(null);
    expect(ow.emitted.some((x) => x.type === 'stealthEncounterDone' && x.data.medal === 'gold')).toBe(true);
    expect(ow.emitted.some((x) => x.type === 'storyReward')).toBe(true);
    expect(sanitizeOpenworld(ow.store).stealth.heraldNests.medal).toBe('gold');
  });
  it('an alarm or a gadget costs the optional objectives; a slower run keeps the better best', () => {
    const ow = testContext({ store: sanitizeOpenworld({ stealth: { clinicHostages: { best: 60, medal: 'gold', opts: ['unseen'] } } }) });
    fakeWorld(ow);
    const enc = createStealthEncounters(ow);
    enc.start('clinicHostages');
    ow.events.emit('stealthAlarm', {});
    ow.events.emit('gadgetUse', { id: 'batarang' });
    enc.update(100);
    ow.events.emit('fightDone', { id: 'stealth:clinicHostages' });
    const r = ow.store.stealth.clinicHostages;
    expect(r.best).toBe(60);
    expect(r.medal).toBe('gold');
    expect(r.opts).toEqual(expect.arrayContaining(['unseen', 'time']));
    expect(r.opts).not.toContain('noGadgets');
  });
  it('quitting fails it cleanly; a fight that is not ours is ignored', () => {
    const ow = testContext({ store: sanitizeOpenworld({}) });
    fakeWorld(ow);
    const enc = createStealthEncounters(ow);
    enc.start('countingHouse');
    ow.events.emit('fightDone', { id: 'crime:3' });
    expect(enc.active?.id).toBe('countingHouse');
    enc.quit();
    expect(enc.active).toBe(null);
    expect(ow.emitted.some((x) => x.type === 'stealthEncounterFailed')).toBe(true);
    expect(ow.store.stealth.countingHouse).toBeUndefined();
  });
  it('announces an unplayed encounter once when a hero comes near', () => {
    const e = encounterById('arkhamWing');
    const ow = testContext({ heroes: [{ x: e.entry.x + 20, y: 5, z: e.entry.z }], store: sanitizeOpenworld({}) });
    fakeWorld(ow);
    const enc = createStealthEncounters(ow);
    enc.update(0.5);
    enc.update(0.5);
    expect(ow.emitted.filter((x) => x.type === 'stealthEncounterNear' && x.data.id === 'arkhamWing')).toHaveLength(1);
    expect(enc.marker()?.id).toBe('arkhamWing');
  });
});

// Every point a body stands on, checked against the real city's collision: patrol points and
// the walk between them (sampled every metre), cover crates, hostages, entries.
describe('encounters stand on real ground', () => {
  let city;
  beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);
  const problems = (C, p, what, out) => {
    const g = C.groundBelow(p.x, p.y + 0.6, p.z, 0.3);
    if (!(g > -Infinity)) { out.push(`${what}: no ground`); return; }
    if (p.y - g > 1.2) out.push(`${what}: ground ${g.toFixed(2)} is ${(p.y - g).toFixed(2)} m below`);
    const r = C.resolveCylinder({ x: p.x, y: g + 0.05, z: p.z }, 0.35, 1.7, { prevY: g + 0.05 });
    if (r.hitWall) out.push(`${what}: inside a wall`);
  };
  it('patrol points and routes, cover, hostages and entries', () => {
    const C = city.collision;
    const out = [];
    for (const e of STEALTH_ENCOUNTERS) {
      e.squad.forEach((g, i) => {
        const pts = g.route.points;
        const legs = g.route.mode === 'loop' ? pts.length : pts.length - 1;
        for (let k = 0; k < legs; k++) {
          const a = pts[k], b = pts[(k + 1) % pts.length];
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
          for (let s = 0; s <= n; s++) {
            const t = s / n;
            problems(C, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, `${e.id} squad ${i} leg ${k} at ${t.toFixed(2)}`, out);
          }
        }
      });
      // Cover is checked before the crates exist (they add their own boxes at run time).
      e.cover.forEach((c, i) => problems(C, c, `${e.id} cover ${i}`, out));
      (e.hostages ?? []).forEach((h, i) => problems(C, h, `${e.id} hostage ${i}`, out));
      problems(C, e.entry, `${e.id} entry`, out);
    }
    expect(out).toEqual([]);
  });
  it('no patrol route walks through one of its own cover crates', () => {
    const out = [];
    for (const e of STEALTH_ENCOUNTERS) {
      for (const [i, g] of e.squad.entries()) {
        const pts = g.route.points;
        const legs = g.route.mode === 'loop' ? pts.length : pts.length - 1;
        for (let k = 0; k < legs; k++) {
          const a = pts[k], b = pts[(k + 1) % pts.length];
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2));
          for (let s = 0; s <= n; s++) {
            const x = a.x + (b.x - a.x) * (s / n), z = a.z + (b.z - a.z) * (s / n), y = a.y + (b.y - a.y) * (s / n);
            for (const c of e.cover) {
              if (Math.abs(x - c.x) < (c.w ?? 1.6) / 2 + 0.4 && Math.abs(z - c.z) < (c.d ?? 1.6) / 2 + 0.4 && Math.abs(y - c.y) < 1) out.push(`${e.id} squad ${i} leg ${k} hits the crate at ${c.x},${c.z}`);
            }
          }
        }
      }
    }
    expect([...new Set(out)]).toEqual([]);
  });
});
