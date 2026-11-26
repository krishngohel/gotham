import { describe, it, expect } from 'vitest';
import { STATIONS, CAR_BANDS, NEWS, WEATHER, ADS, ALFRED } from '../../src/sandbox/radio/stations.js';
import { DISTRICT_THEMES } from '../../src/audio/music/director.js';
import { THEMES } from '../../src/audio/music/themes.js';
import { createDrift, driftStep, jumpScore, DRIFT, JUMP } from '../../src/sandbox/stunts.js';
import { slotsForEdge, pickKind, PROP_KINDS } from '../../src/sandbox/furniture.js';
import { createStreetGraph } from '../../src/world/streetGraph.js';
import { sanitizeSandboxSave } from '../../src/sandbox/save.js';
import { sanitizeWantedSave } from '../../src/wanted/save.js';
import { sanitizeProgress, saveProgress, loadProgress } from '../../src/core/save.js';
import { BARKS, DISPATCH, TEACH, compass, fill } from '../../src/wanted/lines.js';
import { LEVELS } from '../../src/wanted/rules.js';

describe('car radio stations', () => {
  it('five original music stations, each on a real theme of the score, with talk', () => {
    expect(STATIONS.length).toBe(5);
    const ids = new Set();
    for (const s of STATIONS) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      const cue = DISTRICT_THEMES[s.theme];
      expect(cue, s.id).toBeTruthy();
      expect(THEMES[cue], cue).toBeTruthy();
      expect(s.talk.length).toBeGreaterThanOrEqual(3);
      expect(s.short.length).toBeLessThanOrEqual(12);
    }
    // Every station sounds different: no two share a theme.
    expect(new Set(STATIONS.map((s) => s.theme)).size).toBe(STATIONS.length);
  });
  it('the Batmobile gets the police band and Alfred, no music', () => {
    expect(CAR_BANDS.map((b) => b.id)).toEqual(['policeBand', 'alfred']);
    for (const b of CAR_BANDS) expect(b.theme).toBeUndefined();
    expect(ALFRED.length).toBeGreaterThan(2);
  });
  it('news reacts to the police, the weather has a line per state, ads exist', () => {
    for (const k of ['wanted', 'manhunt', 'clear', 'menace']) expect(NEWS[k].length).toBeGreaterThan(0);
    for (const w of ['clear', 'drizzle', 'rain', 'storm', 'fog', 'snow']) expect(WEATHER[w]).toBeTruthy();
    expect(ADS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('wanted lines', () => {
  it('teaching for each level, dispatch for each level id, barks for each unit job', () => {
    for (let lv = 1; lv <= 5; lv++) expect(TEACH[lv]?.text).toBeTruthy();
    for (const L of LEVELS.slice(1)) expect(DISPATCH[L.id] ?? DISPATCH.noticed).toBeTruthy();
    for (const k of ['question', 'chase', 'box', 'restrained', 'stunned', 'search', 'swat', 'lost', 'traffic']) expect(BARKS[k].length).toBeGreaterThan(0);
  });
  it('compass directions (x east, z south) and the formatter', () => {
    expect(compass(0, -1)).toBe('north');
    expect(compass(1, 0)).toBe('east');
    expect(compass(0, 1)).toBe('south');
    expect(compass(-1, -1)).toBe('north-west');
    expect(fill('heading {dir} {street}.', { dir: 'west', street: '' })).toBe('heading west .'.replace(' .', ' .'));
  });
});

describe('stunt scoring', () => {
  it('banks a held drift, with a multiplier for holding it', () => {
    const d = createDrift();
    let out = null;
    for (let i = 0; i < 40; i++) out = driftStep(d, { dt: 0.1, speed: 18, slip: 5 }) ?? out;
    expect(out).toBeNull();
    expect(d.mult).toBeGreaterThan(1);
    for (let i = 0; i < 12 && !out; i++) out = driftStep(d, { dt: 0.1, speed: 18, slip: 0 });
    expect(out.banked).toBeGreaterThan(DRIFT.MIN_BANK);
  });
  it('a crash loses the drift; a short wiggle is not a drift', () => {
    const d = createDrift();
    for (let i = 0; i < 20; i++) driftStep(d, { dt: 0.1, speed: 20, slip: 5 });
    const r = driftStep(d, { dt: 0.1, speed: 4, slip: 5 });
    expect(r.lost).toBeGreaterThan(0);
    const e = createDrift();
    driftStep(e, { dt: 0.1, speed: 20, slip: 5 });
    let out = null;
    for (let i = 0; i < 12; i++) out = driftStep(e, { dt: 0.1, speed: 20, slip: 0 }) ?? out;
    expect(out).toBeNull();
  });
  it('jumps: nothing for a bump, double for a clean fast landing', () => {
    expect(jumpScore({ air: JUMP.MIN_AIR - 0.1, dist: 20 })).toBe(0);
    const slow = jumpScore({ air: 1.5, dist: 30, land: 5 });
    const fast = jumpScore({ air: 1.5, dist: 30, land: 20 });
    expect(fast).toBe(slow * 2);
  });
});

describe('street furniture', () => {
  const g = createStreetGraph();
  const a = g.addNode(0, 0), b = g.addNode(120, 0), c = g.addNode(0, 60);
  const e = g.edges[g.addEdge(a, b, { width: 14, lanes: 2, sidewalk: 3 })];
  const bare = g.edges[g.addEdge(a, c, { width: 14, lanes: 2, sidewalk: 0 })];
  it('stands at the kerb along sidewalks, the same every time, never at junction mouths', () => {
    const s1 = slotsForEdge(g, e), s2 = slotsForEdge(g, e);
    expect(s1.length).toBeGreaterThan(2);
    expect(s2).toEqual(s1);
    for (const s of s1) {
      expect(Math.abs(Math.abs(s.z) - (14 / 2 + 0.75))).toBeLessThan(1e-6);
      expect(s.x).toBeGreaterThan(8);
      expect(s.x).toBeLessThan(112);
      expect(PROP_KINDS[s.kind]).toBeTruthy();
    }
    expect(slotsForEdge(g, bare)).toEqual([]);
  });
  it('picks every kind somewhere', () => {
    const kinds = new Set();
    for (let i = 0; i < 200; i++) kinds.add(pickKind(i / 200));
    expect(kinds.size).toBe(Object.keys(PROP_KINDS).length);
  });
});

describe('saves', () => {
  it('an old save without wanted or sandbox loads with the defaults', () => {
    const old = sanitizeProgress({ step: 12, trophies: [1, 2], districts: ['gcpd'] });
    expect(old.wanted).toEqual(sanitizeWantedSave({}));
    expect(old.sandbox).toEqual(sanitizeSandboxSave({}));
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    old.wanted.menace = true; old.wanted.taught.push('2'); old.sandbox.drift = 1200; old.sandbox.found.push('bridge:bridgeE');
    saveProgress(storage, old);
    const back = loadProgress(storage);
    expect(back.wanted.menace).toBe(true);
    expect(back.wanted.taught).toContain('2');
    expect(back.sandbox.drift).toBe(1200);
    expect(back.sandbox.found).toContain('bridge:bridgeE');
  });
  it('sanitizes junk', () => {
    const w = sanitizeWantedSave({ taught: ['2', 'nope', 3], menace: 'yes', record: -4, level: 99, nights: { peak: 12 } });
    expect(w.taught).toEqual(['2', '3']);
    expect(w.menace).toBe(false);
    expect(w.record).toBe(0);
    expect(w.level).toBe(5);
    expect(w.nights.peak).toBe(5);
    const s = sanitizeSandboxSave({ station: '<script>', drift: 'lots', found: ['ok', 7, 'ok'] });
    expect(s.station).toBe('nightOwl');
    expect(s.drift).toBe(0);
    expect(s.found).toEqual(['ok']);
  });
});
