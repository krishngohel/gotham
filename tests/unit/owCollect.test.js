import { describe, it, expect, afterEach } from 'vitest';
import { REGION_SITES, districtAt } from '../../src/world/regions/data.js';
import { SPEAKERS } from '../../src/audio/barks/lines.js';
import { GADGET_IDS } from '../../src/gadgets/gadgetDefs.js';
import { RIDDLES, HIDES, LOGS, PHOTOS, TRIALS, HIDE_GADGETS, placeOf, PREDATOR_MAPS } from '../../src/openworld/collect/data.js';
import { createCollectibles } from '../../src/openworld/collect/runtime.js';
import { contractUnlocked, nextContract, recordContract, CONTRACT_SITES } from '../../src/openworld/collect/contracts.js';
import { CITY_COLLECT_CATEGORY, collectCount } from '../../src/openworld/collect/tracker.js';
import { tracker } from '../../src/game/progressTracker.js';
import { sanitizeOpenworld } from '../../src/openworld/save.js';
import { sanitizeProgress } from '../../src/core/save.js';
import { testContext } from '../../src/openworld/context.js';
import { createRng } from '../../src/core/rng.js';
import { registerNight, unregisterNight, nightOrder } from '../../src/story/campaign.js';

const ctx = (heroes = [{ x: 0, y: 0, z: 0 }], extra = {}) => {
  const ow = testContext({ heroes, store: sanitizeOpenworld({}) });
  ow.progress.gadgets = { unlocked: [] };
  ow.progress.finished = false;
  const begun = [];
  ow.encounters = { id: null, begin(id, f) { this.id = id; begun.push([id, f]); }, trigger() {}, end() { this.id = null; } };
  ow.begun = begun;
  Object.assign(ow, extra);
  return ow;
};
const put = (ow, i, p) => Object.assign(ow.players()[i].hero.pos, { x: p.x, y: p.y ?? 0, z: p.z });
const tick = (c, secs = 0.4) => { for (let t = 0; t < secs; t += 0.1) c.update(0.1); };
const ofType = (ow, type) => ow.emitted.filter((e) => e.type === type);

describe('collectible data', () => {
  const all = [...RIDDLES, ...HIDES, ...LOGS, ...PHOTOS, ...TRIALS];
  it('has unique ids', () => {
    const ids = all.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('meets the minimum counts', () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(12);
    expect(LOGS.length).toBeGreaterThanOrEqual(10);
    expect(PHOTOS.length).toBeGreaterThanOrEqual(6);
    expect(TRIALS.filter((t) => t.kind === 'rings').length).toBeGreaterThanOrEqual(3);
    expect(TRIALS.filter((t) => t.kind === 'parkour').length).toBeGreaterThanOrEqual(2);
    expect(TRIALS.filter((t) => t.kind === 'arena').length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(PREDATOR_MAPS)).toBe(true);
  });
  it('covers every registered collectible site with a hide', () => {
    const cs = Object.entries(REGION_SITES).filter(([, s]) => s.kind === 'collectible').map(([id]) => id);
    for (const id of cs) expect(HIDES.map((h) => h.site), id).toContain(id);
    for (const id of ['quayBargeHide', 'narrowsHide', 'parkRowHide', 'chinatownHide', 'yardsHide']) expect(HIDES.map((h) => h.site)).toContain(id);
  });
  it('every site resolves, and named districts match the map', () => {
    for (const r of RIDDLES) { expect(REGION_SITES[r.answer.site], r.id).toBeTruthy(); const p = placeOf('riddles', r); expect(districtAt(p.x, p.z), r.id).toBe(r.district); }
    for (const h of HIDES) expect(REGION_SITES[h.site], h.id).toBeTruthy();
    for (const l of LOGS) { expect(REGION_SITES[l.site], l.id).toBeTruthy(); const p = placeOf('logs', l); expect(districtAt(p.x, p.z), l.id).toBe(l.district); }
    for (const p of PHOTOS) expect(REGION_SITES[p.site], p.id).toBeTruthy();
    for (const t of TRIALS) { expect(REGION_SITES[t.startSite], t.id).toBeTruthy(); expect(districtAt(t.start.x, t.start.z), t.id).toBe(t.district); }
  });
  it('every log speaker is a known speaker and every line is written', () => {
    for (const l of LOGS) for (const line of l.lines) { expect(SPEAKERS[line.speaker], `${l.id} ${line.speaker}`).toBeTruthy(); expect(line.text.length).toBeGreaterThan(10); }
  });
  it('gates are real gadget ids', () => {
    for (const g of HIDE_GADGETS) expect(GADGET_IDS).toContain(g);
  });
  it('ring courses start at their site and descend gently', () => {
    for (const t of TRIALS.filter((x) => x.rings)) {
      const s = REGION_SITES[t.startSite];
      expect(t.start.y).toBe(s.y);
      let prev = t.start;
      for (const r of t.rings) {
        const fwd = Math.hypot(r.x - prev.x, r.z - prev.z), drop = prev.y - r.y;
        expect(drop, t.id).toBeLessThanOrEqual(fwd / 2);
        expect(r.y, t.id).toBeGreaterThan(3);
        prev = r;
      }
      expect(t.medals.gold).toBeLessThan(t.medals.silver);
      expect(t.medals.silver).toBeLessThan(t.medals.bronze);
    }
  });
  it('arena maps have composed waves of real roles', () => {
    for (const t of TRIALS.filter((x) => x.kind === 'arena')) {
      expect(t.fight.waves.length).toBe(t.waves.length);
      for (const w of t.fight.waves) { expect(w.length).toBeGreaterThan(0); for (const e of w) expect(typeof e.type).toBe('string'); }
      expect(t.medals.gold).toBeGreaterThan(t.medals.silver);
    }
  });
});

describe('collectibles runtime', () => {
  it('picks up an open hide by walking onto it, once, with a hint pin first', () => {
    const h = HIDES.find((x) => !x.gate);
    const p = REGION_SITES[h.site];
    const ow = ctx([{ x: p.x + 60, y: p.y, z: p.z }]);
    const c = createCollectibles(ow);
    tick(c);
    expect(ofType(ow, 'collectibleHint').some((e) => e.data.id === h.id)).toBe(true);
    put(ow, 0, p);
    tick(c);
    expect(ow.store.collect.hides).toContain(h.id);
    expect(ofType(ow, 'collectible').filter((e) => e.data.id === h.id)).toHaveLength(1);
    tick(c);
    expect(ofType(ow, 'collectible').filter((e) => e.data.id === h.id)).toHaveLength(1);
  });
  it('a gated hide waits for its gadget', () => {
    const h = HIDES.find((x) => x.gate === 'gel');
    const p = REGION_SITES[h.site];
    const ow = ctx([p]);
    const c = createCollectibles(ow);
    tick(c);
    expect(ow.store.collect.hides).not.toContain(h.id);
    expect(ow.said.some((s) => s[0] === 'hint' && /Explosive Gel/.test(s[1]))).toBe(true);
    ow.progress.gadgets.unlocked.push('gel');
    tick(c);
    expect(ow.store.collect.hides).toContain(h.id);
  });
  it('a scan riddle needs detective vision held at the landmark', () => {
    const r = RIDDLES.find((x) => x.answer.scan);
    const p = REGION_SITES[r.answer.site];
    const ow = ctx([p]);
    const c = createCollectibles(ow);
    tick(c, 2);
    expect(ow.store.collect.riddles).not.toContain(r.id);
    ow.players()[0].det = true;
    tick(c, 1.6);
    expect(ow.store.collect.riddles).toContain(r.id);
    const plain = RIDDLES.find((x) => !x.answer.scan);
    put(ow, 0, REGION_SITES[plain.answer.site]);
    ow.players()[0].det = false;
    tick(c);
    expect(ow.store.collect.riddles).toContain(plain.id);
  });
  it('a log plays once', () => {
    const l = LOGS[0];
    const ow = ctx([REGION_SITES[l.site]]);
    const c = createCollectibles(ow);
    tick(c, 2);
    expect(ow.said.filter((s) => s[0] === 'say')).toHaveLength(1);
    expect(ow.store.collect.logs).toEqual([l.id]);
  });
  it('a photo spot counts on photoSaved with a hero in range', () => {
    const ph = PHOTOS[0];
    const ow = ctx([{ x: 0, y: 0, z: 0 }]);
    createCollectibles(ow);
    ow.events.emit('photoSaved', {});
    expect(ow.store.collect.photos).toEqual([]);
    put(ow, 0, REGION_SITES[ph.site]);
    ow.events.emit('photoSaved', {});
    expect(ow.store.collect.photos).toEqual([ph.id]);
  });
  it('a ring trial records its medal and keeps the best', () => {
    const t = TRIALS.find((x) => x.kind === 'rings');
    const ow = ctx([{ x: 0, y: 0, z: 0 }]);
    const c = createCollectibles(ow);
    const fly = () => {
      expect(c.startTrial(t.id)).toBe(true);
      expect(ow.players()[0].hero.pos.y).toBe(t.start.y);
      // Fly through each ring along its normal, quickly.
      for (const r of t.rings) {
        put(ow, 0, { x: r.x - r.nx, y: r.y - r.ny, z: r.z - r.nz });
        c.update(0.05);
        put(ow, 0, { x: r.x + r.nx, y: r.y + r.ny, z: r.z + r.nz });
        c.update(0.05);
      }
    };
    fly();
    expect(c.trial).toBe(null);
    const done = ofType(ow, 'trialDone')[0].data;
    expect(done.ok).toBe(true);
    expect(done.medal).toBe('gold');
    const best = ow.store.collect.trials[t.id].best;
    expect(ow.store.collect.trials[t.id].medal).toBe('gold');
    expect(c.startTrial(t.id)).toBe(true);
    for (let i = 0; i < 20; i++) c.update(0.5);
    for (const r of t.rings) { put(ow, 0, { x: r.x - r.nx, y: r.y - r.ny, z: r.z - r.nz }); c.update(0.05); put(ow, 0, { x: r.x + r.nx, y: r.y + r.ny, z: r.z + r.nz }); c.update(0.05); }
    expect(ow.store.collect.trials[t.id].best).toBe(best);
    expect(ow.store.collect.trials[t.id].medal).toBe('gold');
  });
  it('an arena trial runs through the encounter system and scores hits', () => {
    const t = TRIALS.find((x) => x.kind === 'arena');
    const ow = ctx();
    const c = createCollectibles(ow);
    c.startTrial(t.id);
    expect(ow.begun[0][0]).toBe(`trial:${t.id}`);
    for (let i = 0; i < 300; i++) ow.events.emit('impact', { move: i % 2 ? 'punch' : 'kick', outcome: 'hit' });
    ow.events.emit('fightDone', { id: `trial:${t.id}` });
    const done = ofType(ow, 'trialDone')[0].data;
    expect(done.value).toBeGreaterThan(0);
    expect(ow.store.collect.trials[t.id].best).toBe(done.value);
  });
  it('reports completion per district', () => {
    const ow = ctx();
    const c = createCollectibles(ow);
    c.debugCollectAll('riddles');
    const d = c.districtCompletion();
    const total = Object.values(d).reduce((n, r) => n + r.total, 0);
    expect(total).toBe(RIDDLES.length + HIDES.length + LOGS.length + PHOTOS.length + TRIALS.length);
    expect(d.amusementMile.parts.riddles.done).toBe(1);
    expect(c.list('hides').length).toBe(HIDES.length);
  });
});

describe('contracts', () => {
  const extra = [];
  afterEach(() => { for (const id of extra.splice(0)) unregisterNight(id); });
  it('lock until every night is done (or the dev switch)', () => {
    if (!nightOrder().length) { registerNight({ id: 'tstA', act: 'act1', number: 99, missions: [] }); extra.push('tstA'); }
    const order = nightOrder();
    expect(contractUnlocked({ campaign: { nightsDone: order.slice(1) } })).toBe(false);
    expect(contractUnlocked({ campaign: { nightsDone: order } })).toBe(true);
    expect(contractUnlocked({ campaign: { nightsDone: [] } }, { dev: true })).toBe(true);
  });
  it('escalates: budget, waves and difficulty grow with the tier, deterministic for a seed', () => {
    const store = sanitizeOpenworld({});
    const a = nextContract(store, createRng(5));
    expect(nextContract(store, createRng(5))).toEqual(a);
    recordContract(store, a, true);
    expect(store.contracts.tier).toBe(1);
    store.contracts.tier = 6;
    const b = nextContract(store, createRng(5));
    expect(b.budget).toBeGreaterThan(a.budget);
    expect(b.fight.waves.length).toBeGreaterThanOrEqual(a.fight.waves.length);
    expect(['hard', 'knightmare']).toContain(b.difficulty);
    for (const c of CONTRACT_SITES) expect(REGION_SITES[c.site], c.site).toBeTruthy();
    recordContract(store, b, false);
    expect(store.contracts.tier).toBe(6);
  });
  it('runs through the encounter system and a gadget breaks a no-gadgets contract', () => {
    const ow = ctx();
    const c = createCollectibles(ow, { devContracts: true });
    ow.store.contracts.tier = 0;
    let def = c.startContract();
    while (!def.modifiers.includes('noGadgets')) { c.quitContract(); ow.store.contracts.tier += 1; def = c.startContract(); }
    ow.events.emit('gadgetUse', {});
    expect(ofType(ow, 'contractDone').pop().data.ok).toBe(false);
    const d2 = c.startContract();
    ow.events.emit('fightDone', { id: d2.id });
    expect(ofType(ow, 'contractDone').pop().data.ok).toBe(true);
    expect(ow.store.contracts.done).toBe(1);
  });
});

describe('progress tracker and save', () => {
  it('stays out of the percentage for a Night One save, counts after', () => {
    const old = sanitizeProgress({ step: 3 });
    expect(CITY_COLLECT_CATEGORY.active(old)).toBe(false);
    expect(tracker.score(old).parts.some((p) => p.id === 'cityCollect')).toBe(false);
    const later = sanitizeProgress({ finished: true, campaign: { nightsDone: ['n1'] }, openworld: { collect: { riddles: [RIDDLES[0].id] } } });
    expect(CITY_COLLECT_CATEGORY.active(later)).toBe(true);
    const part = tracker.score(later).parts.find((p) => p.id === 'cityCollect');
    expect(part.done).toBe(1);
    expect(part.total).toBe(collectCount(later).total);
  });
  it('an old save without the field loads with empty collections', () => {
    const p = sanitizeProgress({ step: 5, trophies: [1, 2] });
    expect(p.openworld.collect).toEqual({ riddles: [], hides: [], logs: [], photos: [], trials: {} });
    expect(p.openworld.contracts).toEqual({ tier: 0, done: 0, best: 0 });
  });
});
