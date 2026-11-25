import { describe, it, expect } from 'vitest';
import { CHAINS, ALL_MISSIONS, CHAIN_SITES, CLAY_STAGES } from '../../src/openworld/chains/data.js';
import { CRIME_TYPE_IDS } from '../../src/openworld/crimeTypes.js';
import { STEALTH_IDS } from '../../src/openworld/stealth/encounters.js';
import { CASES } from '../../src/openworld/cases/data.js';
import { REGION_SITES, REGION_CRIME_SPOTS } from '../../src/world/regions/data.js';
import { SITES } from '../../src/world/mapData.js';
import { CRIME_SPOTS } from '../../src/game/crimes.js';
import { nightOrder, sideMissionsAvailable } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { registerChainMissions, CHAIN_SCENES } from '../../src/openworld/chains/runtime.js';
import { CHAIN_BOSS_IDS } from '../../src/openworld/chains/bosses.js';
import { VILLAINS } from '../../src/heroes/models/villains.js';
import { isRewardId } from '../../src/story/campaign.js';
import { arrivalReaction, lieutenantEntries, styleOf } from '../../src/openworld/reputationWorld.js';
import { createGeo } from '../../src/openworld/geo.js';
import { createStreetGraph } from '../../src/world/streetGraph.js';
import { createRng } from '../../src/core/rng.js';
import { ENEMY } from '../../src/combat/rules.js';
import { PORTRAIT_IDS } from '../../src/ui/radioPortraits.js';

const spotIds = new Set([...CRIME_SPOTS, ...REGION_CRIME_SPOTS].map((s) => s.id));
const resolves = (id) => !!(CHAIN_SITES[id] ?? REGION_SITES[id] ?? SITES[id]) || spotIds.has(id);
const STORY_VILLAINS = ['crimeBoss', 'puzzler', 'scarecrow', 'coldScientist']; // Nights 2-5 (Penguin, Riddler, Scarecrow, Freeze)

describe('side chains (data)', () => {
  it('four chains of 3 to 5 missions, unique ids, gated by campaign night', () => {
    expect(CHAINS.length).toBeGreaterThanOrEqual(4);
    for (const c of CHAINS) {
      expect(c.missions.length).toBeGreaterThanOrEqual(3);
      expect(c.missions.length).toBeLessThanOrEqual(5);
      expect(nightOrder()).toContain(c.after);
    }
    const ids = ALL_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('each chain is about a rogue the campaign nights 2-5 do not use, with a villain model', () => {
    for (const c of CHAINS) {
      expect(STORY_VILLAINS).not.toContain(c.villain);
      expect(VILLAINS[c.villain], c.villain).toBeTruthy();
    }
    expect(new Set(CHAINS.map((c) => c.villain)).size).toBe(CHAINS.length);
  });
  it('every step names things that exist: sites, crime types, stealth encounters, cases, bosses, scenes', () => {
    const caseIds = CASES.map((c) => c.id);
    for (const m of ALL_MISSIONS) {
      expect(resolves(m.start), `${m.id} start ${m.start}`).toBe(true);
      for (const s of m.steps) {
        if (s.do === 'crime') { expect(CRIME_TYPE_IDS).toContain(s.type); expect(resolves(s.spot), `${m.id} ${s.spot}`).toBe(true); }
        if (s.do === 'stealth') expect(STEALTH_IDS).toContain(s.id);
        if (s.do === 'case') expect(caseIds).toContain(s.id);
        if (s.do === 'boss') expect(CHAIN_BOSS_IDS).toContain(s.id);
        if (s.do === 'comic') expect(CHAIN_SCENES).toContain(s.scene);
        if (s.do === 'fight') expect(resolves(s.at)).toBe(true);
        if (s.do === 'talk') for (const l of s.lines) { expect(l.text.length).toBeGreaterThan(5); expect(PORTRAIT_IDS).toContain(l.portrait); }
      }
      for (const r of m.reward ?? []) expect(isRewardId(r), r).toBe(true);
    }
  });
  it('every chain ends in its own boss; two chains run through a detective case', () => {
    for (const c of CHAINS) expect(c.missions.at(-1).steps.some((s) => s.do === 'boss')).toBe(true);
    const withCase = CHAINS.filter((c) => c.missions.some((m) => m.steps.some((s) => s.do === 'case')));
    expect(withCase.length).toBeGreaterThanOrEqual(2);
    for (const c of CASES.filter((x) => x.chain)) expect(CHAINS.map((ch) => ch.id)).toContain(c.chain);
  });
  it('the clay man fights in three places, each with a hazard and a lever a few metres apart', () => {
    expect(CLAY_STAGES.length).toBe(3);
    for (const s of CLAY_STAGES) {
      const d = Math.hypot(s.hazard.x - s.lever.x, s.hazard.z - s.lever.z);
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThan(7);
    }
  });
  it('registers with the campaign and unlocks by night', () => {
    registerChainMissions();
    const none = sideMissionsAvailable({ nightsDone: [] }).filter((m) => ALL_MISSIONS.some((x) => x.id === m.id));
    expect(none).toEqual([]);
    const afterOne = sideMissionsAvailable({ nightsDone: ['n1'] }).map((m) => m.id);
    expect(afterOne).toContain('nineLives1');
    expect(afterOne).not.toContain('theContract1');
    const all = sideMissionsAvailable({ nightsDone: ['n1', 'n2', 'n3', 'n4'] }).map((m) => m.id);
    for (const m of ALL_MISSIONS) expect(all).toContain(m.id);
  });
});

describe('fear and reputation in the street', () => {
  it('a feared Bat in a quiet district: some of the crew surrender, a couple run', () => {
    let s = 0, f = 0;
    for (let i = 1; i <= 50; i++) { const r = arrivalReaction({ fearBias: 0.9, heat: 0.5, cocky: 0, n: 6, rng: createRng(i) }); s += r.surrender; f += r.flee; expect(r.surrender).toBeLessThan(6); }
    expect(s).toBeGreaterThan(50);
    expect(f).toBeGreaterThan(10);
  });
  it('an unknown Bat gets nothing for free; heat stiffens a crew', () => {
    for (let i = 1; i <= 20; i++) expect(arrivalReaction({ fearBias: 0, heat: 1, n: 6, rng: createRng(i) })).toEqual({ surrender: 0, flee: 0, trap: false });
    let hot = 0, cool = 0;
    for (let i = 1; i <= 50; i++) { hot += arrivalReaction({ fearBias: 0.6, heat: 5, n: 6, rng: createRng(i) }).surrender; cool += arrivalReaction({ fearBias: 0.6, heat: 0, n: 6, rng: createRng(i) }).surrender; }
    expect(hot).toBeLessThan(cool);
  });
  it('a cocky crew springs a trap instead', () => {
    let traps = 0;
    for (let i = 1; i <= 40; i++) if (arrivalReaction({ fearBias: 0.9, heat: 4, cocky: 0.9, n: 5, rng: createRng(i) }).trap) traps++;
    expect(traps).toBeGreaterThan(25);
  });
  it('a lieutenant brings counters for how he lost', () => {
    const fresh = lieutenantEntries({ gang: 'triad', memory: [] }, 'blackMask');
    expect(fresh.map((e) => e.type)).toEqual(['lieutenant']);
    const burned = lieutenantEntries({ gang: 'triad', memory: ['gadgets', 'counters'] }, 'blackMask');
    expect(burned.filter((e) => e.type === 'shield').length).toBe(2);
    expect(burned.some((e) => e.type === 'brute')).toBe(true);
    for (const e of burned) expect(ENEMY[e.type]).toBeTruthy();
    expect(styleOf({ gadgets: 5 })).toEqual(['gadgets']);
    expect(styleOf({})).toEqual(['brawling']);
  });
});

describe('geo (world queries for the composer)', () => {
  const g = createStreetGraph();
  g.addStreet([{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 120, z: 0 }], { width: 10, lanes: 2 });
  g.addStreet([{ x: 60, z: 0 }, { x: 60, z: 60 }], { width: 10, lanes: 2 });
  const roofs = [{ x: 0, z: 0, w: 20, d: 20, y: 14 }, { x: 30, z: 0, w: 20, d: 20, y: 16 }, { x: 60, z: 0, w: 20, d: 20, y: 15 }, { x: 30, z: 45, w: 20, d: 20, y: 30 }];
  const bridges = { list: [{ id: 'b', x: 200, z0: -10, z1: 10 }, { id: 'w', axis: 'x', z: 300, x0: 0, x1: 30 }] };
  const el = { state: [{ id: 'loopOuter0', line: 'loop', x: 5, y: 9, z: 5, stopped: false }, { id: 'westNorth', line: 'west', x: 0, y: 9, z: 0 }] };
  const geo = createGeo({ graph: g, roofs, el, bridges, rng: createRng(1) });
  it('street paths follow the graph and never double back', () => {
    const p = geo.streetPath({ x: 2, y: 0, z: 1 }, 100);
    expect(p.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < p.length; i++) expect(Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z)).toBeGreaterThan(0.4);
  });
  it('roof paths hop between neighbouring roofs at roof height', () => {
    const p = geo.roofPath({ x: 1, z: 1 }, 3);
    expect(p[0].y).toBe(14);
    expect(p.slice(1).every((q) => q.hop)).toBe(true);
    expect(p.some((q) => q.y === 30)).toBe(false); // too high a jump
  });
  it('sniper nests on the highest nearby roofs; the El train; the nearest bridge (either axis)', () => {
    const n = geo.roofsNear({ x: 0, z: 0 }, 2);
    expect(n[0].y).toBe(30);
    expect(geo.train({ x: 0, z: 0 })).toBe('loopOuter0');
    expect(geo.bridge({ x: 190, z: 0 }).id).toBe('b');
    expect(geo.bridge({ x: 15, z: 290 }).id).toBe('w');
    expect(geo.bridge({ x: 2000, z: 0 })).toBe(null);
  });
});
