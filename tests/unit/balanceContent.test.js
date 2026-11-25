import { describe, it, expect } from 'vitest';
import { allNights, stepsOf } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { buildFight } from '../../src/story/fightBuilder.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';
import { pacingReport } from '../../src/story/pacing.js';
import { STEPS } from '../../src/game/story.js';
import { campaign } from '../../scripts/economy-sim.mjs';

// [balance] The content the balance pass added (docs/design/balance.md 5) stays consistent.
const TRAVEL = new Set([undefined, 'reach', 'interior', 'board', 'collect']);
const ADDED = new Set(['n2Valet', 'n2Bouncers', 'n3Quiz', 'n3Riddlers', 'n3Couriers', 'n4Masks', 'n4Carriers', 'n5Siphon', 'n5Pickets', 'n6Pruners', 'n6Seeds', 'n7Torches', 'n7Looters', 'n8Collectors', 'n9Escapees']);
describe('interrupt fights on travel steps', () => {
  for (const n of allNights().filter((x) => x.id !== 'n1')) {
    it(`${n.id}: every interrupt names a fight and a site that exist, on a travel step`, () => {
      const ids = new Set();
      for (const s of stepsOf(n)) {
        for (const it of s.interrupts ?? []) {
          if (ADDED.has(it.id)) expect(TRAVEL.has(s.type), `${s.id} is a travel step`).toBe(true);
          expect(ids.has(it.id), `unique ${it.id}`).toBe(false);
          ids.add(it.id);
          const def = n.fights[it.fight];
          expect(def, `fight ${it.fight}`).toBeTruthy();
          const site = typeof it.at === 'string' ? n.sites?.[it.at] ?? SITES[it.at] ?? REGION_SITES[it.at] : it.at;
          expect(site, `site ${it.at}`).toBeTruthy();
          const f = buildFight(it.fight, def, { difficulty: 'normal' });
          const goons = f.waves.flat().length;
          expect(goons).toBeGreaterThan(ADDED.has(it.id) ? 1 : 0);
          expect(goons).toBeLessThanOrEqual(8); // an interrupt is a skirmish, not a set piece
          expect(it.xp).toBeGreaterThan(0);
        }
      }
      expect([...ids].filter((i) => ADDED.has(i)).length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('pacing did not get worse', () => {
  it('Night One: the opening is shorter and the hard stops did not grow', () => {
    const r = pacingReport(STEPS);
    expect(r.hardStops).toBeLessThanOrEqual(8);
    expect(r.noAgencySeconds).toBeLessThanOrEqual(72);
    expect(r.stops.find((s) => s.id === 'intro').seconds).toBeLessThanOrEqual(12);
  });
  it('later nights keep at most four hard stops', () => {
    for (const n of allNights().filter((x) => x.id !== 'n1')) expect(pacingReport(stepsOf(n)).hardStops).toBeLessThanOrEqual(4);
  });
});

describe('economy over the campaign (scripts/economy-sim.mjs)', () => {
  const c = campaign();
  it('a typical player can afford most of the act-gated tree by the finale, not all of it', () => {
    const end = c.rows.at(-1).points;
    expect(end).toBeGreaterThan(c.xpCost * 0.45);
    expect(end).toBeLessThan(c.xpCost);
  });
  it('every night pays at least three points', () => {
    for (let i = 1; i < c.rows.length; i++) expect(c.rows[i].points - c.rows[i - 1].points).toBeGreaterThanOrEqual(3);
  });
  it('Wayne credit buys about half the Wayne branch over the campaign', () => {
    expect(c.creditTotal / c.wayneCost).toBeGreaterThan(0.35);
    expect(c.creditTotal / c.wayneCost).toBeLessThan(0.8);
  });
});
