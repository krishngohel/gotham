// Workstream K: the double life as rules (src/bruce/doubleLife.js), the calendar and its clock,
// the morning paper and the save fields.
import { describe, it, expect } from 'vitest';
import {
  createDoubleLife, softAdd, applyEffects, useExcuse, excuseWear, optionAvailable, applyNight, sleep, patchUp,
  keepCommitment, missCommitment, dayDrift, nightStart, dayStart, suspicionEvents, spendCredit, rndBudget,
  sanitizeDoubleLife, injuryLook, visibleInjuries, SHARP_FATIGUE,
} from '../../src/bruce/doubleLife.js';
import { generateWeek, fixedDay, overlaps, COMMITMENT_TYPES, clockText } from '../../src/bruce/calendar.js';
import { createDayClock, DAY_RATE } from '../../src/bruce/clock.js';
import { headlines } from '../../src/bruce/newspaper.js';
import { pickLine, ALFRED_LINES } from '../../src/bruce/lines.js';
import { sanitizeBatcave } from '../../src/bruce/save.js';
import { sanitizeProgress, newGameProgress } from '../../src/core/save.js';

describe('meters: soft caps and cause -> effect', () => {
  it('gains past the soft line shrink and never reach the max; losses are plain', () => {
    expect(softAdd(50, 10)).toBe(60);
    const a = softAdd(78, 10);
    expect(a).toBeGreaterThan(80);
    expect(a).toBeLessThan(88);
    let v = 50;
    for (let i = 0; i < 40; i++) v = softAdd(v, 10);
    expect(v).toBeLessThan(100);
    expect(v).toBeGreaterThan(97);
    expect(softAdd(90, -15)).toBe(75);
    expect(softAdd(5, -15)).toBe(0);
  });
  it('applyEffects reports every change with its reason and clamps threads and suspicion', () => {
    const s = createDoubleLife();
    const ch = applyEffects(s, { standing: 5, city: -10, suspicion: { reporter: 200 }, threads: { alfred: 9 } }, 'test');
    expect(ch.map((c) => c.what)).toEqual(['standing', 'city', 'suspicion.reporter', 'thread.alfred']);
    expect(ch.every((c) => c.reason === 'test')).toBe(true);
    expect(s.suspicion.reporter).toBe(100);
    expect(s.threads.alfred).toBe(5);
    expect(s.log.length).toBe(4);
  });
  it("Alfred's patience running out flags his breaking point once", () => {
    const s = createDoubleLife({ patience: 5 });
    const ch = applyEffects(s, { patience: -10 }, 'cover');
    expect(s.flags.alfredBreak).toBe(true);
    expect(ch.some((c) => c.what === 'alfredBreak')).toBe(true);
    expect(applyEffects(s, { patience: -1 }).some((c) => c.what === 'alfredBreak')).toBe(false);
  });
});

describe('excuses are remembered by id and by who heard them', () => {
  it('first telling is free, the same person twice costs, a third telling is a Gazette running joke', () => {
    const s = createDoubleLife();
    const r0 = s.suspicion.reporter;
    expect(useExcuse(s, 'sailing', 'reporter').delta).toBe(0);
    expect(s.suspicion.reporter).toBe(r0);
    expect(excuseWear(s, 'sailing', 'reporter')).toBe('worn');
    expect(excuseWear(s, 'sailing', 'love')).toBe('heard');
    const r2 = useExcuse(s, 'sailing', 'reporter');
    expect(r2.delta).toBe(12);
    const r3 = useExcuse(s, 'sailing', 'mayor');
    expect(r3.joke).toBe(true);
    expect(s.flags['excuseJoke.sailing']).toBe(true);
    expect(s.excuses.sailing).toEqual({ n: 3, who: ['reporter', 'mayor'] });
    // A detective hears it on the detective's meter.
    expect(useExcuse(s, 'polo', 'detective').watcher).toBe('detective');
  });
  it('a worn excuse is still offered, marked worn', () => {
    const s = createDoubleLife();
    useExcuse(s, 'polo', 'reporter');
    const a = optionAvailable(s, { excuse: 'polo', tag: 'deflect' }, { who: 'reporter' });
    expect(a.ok).toBe(true);
    expect(a.worn).toBe(true);
  });
});

describe('fatigue dulls dialogue, gates are explained', () => {
  it('sharp options grey out when tired; requirements say why', () => {
    const s = createDoubleLife({ fatigue: SHARP_FATIGUE });
    expect(optionAvailable(s, { tag: 'sharp' }).ok).toBe(false);
    s.fatigue = 20;
    expect(optionAvailable(s, { tag: 'sharp' }).ok).toBe(true);
    expect(optionAvailable(s, { tag: 'honest', req: { thread: { lucius: 4 } } }).reason).toMatch(/lucius/);
    expect(optionAvailable(s, { tag: 'honest', req: { outfit: ['tux'] } }, { outfit: 'casual' }).ok).toBe(false);
    expect(optionAvailable(s, { tag: 'honest', req: { flag: 'lead.x' } }).ok).toBe(false);
  });
});

describe('the night follows you into the day', () => {
  it('a long, hard night raises fatigue, leaves injuries Bruce wears, and moves the city', () => {
    const s = createDoubleLife({ fatigue: 10 });
    applyNight(s, { endHour: 5.17, hits: 9, finishers: 4, crimesStopped: 3, crimesIgnored: 0, district: 'narrows' });
    expect(s.fatigue).toBeGreaterThan(50);
    expect(s.injuries.bruise).toBeGreaterThan(0);
    expect(s.injuries.lip).toBeGreaterThan(0);
    expect(s.injuries.ribs).toBe(0);
    expect(injuryLook(s)).toEqual({ bruise: true, lip: true, ribs: false, sling: false });
    expect(visibleInjuries(s, 'suit')).toEqual(['bruise', 'lip']);
    expect(s.city).toBeGreaterThan(50);
    expect(s.lastNight.district).toBe('narrows');
  });
  it('sleep and the medical bay heal; Alfred patches the worst wound', () => {
    const s = createDoubleLife({ fatigue: 80 });
    applyEffects(s, { injuries: { ribs: 60, lip: 10 } });
    sleep(s, 8);
    expect(s.fatigue).toBeLessThan(15);
    expect(s.injuries.lip).toBe(2);
    const p = patchUp(s);
    expect(p.healed).toBe('ribs');
    expect(s.injuries.ribs).toBe(0);
  });
  it('nightStart: a neglected Wayne life changes how the night starts, never whether it can be played', () => {
    const ok = nightStart(createDoubleLife());
    expect(ok.backup).toBe(true);
    expect(ok.tail).toBe(false);
    expect(ok.staminaRegenK).toBe(1);
    const s = createDoubleLife({ standing: 20, fatigue: 85, patience: 10 });
    s.threads.ward = 1;
    s.suspicion.detective = 75;
    applyEffects(s, { injuries: { ribs: 40 }, flags: { 'lead.pier12': true } });
    const n = nightStart(s);
    expect(n.backup).toBe(false);
    expect(n.tail).toBe(true);
    expect(n.rndFrozen).toBe('prototype');
    expect(n.staminaRegenK).toBeLessThan(0.6);
    expect(n.healthK).toBeLessThan(1);
    expect(n.alfredOnComms).toBe(false);
    expect(n.leads).toEqual(['pier12']);
    expect(n.notes.length).toBeGreaterThanOrEqual(6);
  });
  it('dayStart: a neglected city brings Gordon; injuries bring the reporter to breakfast', () => {
    const s = createDoubleLife({ city: 20 });
    expect(dayStart(s).gordonVisit).toBe(true);
    applyEffects(s, { injuries: { lip: 10 } });
    expect(dayStart(s).reporterAtBreakfast).toBe(true);
  });
  it('commitments: keeping raises standing and a thread; missing closes it down', () => {
    const s = createDoubleLife();
    const c = { id: 'd0.gala', title: 'Gala', standing: 8, miss: 10, thread: 'love' };
    keepCommitment(s, c);
    expect(s.standing).toBeGreaterThan(55);
    expect(s.kept).toContain('d0.gala');
    const before = s.standing;
    missCommitment(s, { ...c, id: 'd1.gala' });
    expect(s.standing).toBe(before - 10);
    expect(s.missed).toContain('d1.gala');
  });
  it('the daily drift pushes the two lives against each other and banks Wayne credit', () => {
    const s = createDoubleLife({ standing: 60, city: 60 });
    dayDrift(s, { keptToday: 0, crimesLastNight: 0 });
    expect(s.standing).toBe(57);
    expect(s.city).toBe(56);
    // [balance] one credit per 10 Standing banked (was 20): 57 Standing banks 5.
    expect(s.credit).toBe(5);
    expect(s.day).toBe(1);
    expect(spendCredit(s, 6).ok).toBe(false);
    expect(spendCredit(s, 5).ok).toBe(true);
    expect(rndBudget(s)).toBeGreaterThan(0);
    s.rnd.frozen = 'prototype';
    expect(rndBudget(s)).toBe(0);
  });
  it('suspicion thresholds fire story events once each', () => {
    const s = createDoubleLife();
    s.suspicion.detective = 72;
    expect(suspicionEvents(s).map((e) => e.event)).toEqual(['detectiveNotes', 'detectiveTail']);
    expect(suspicionEvents(s)).toEqual([]);
  });
});

describe('one clock, two calendars', () => {
  it('a generated week has 2-3 commitments a day, none overlapping, and a collision every day', () => {
    const week = generateWeek({ seed: 3, days: 7, act: 2, cityHeat: 0.7 });
    expect(week.length).toBe(7);
    for (const d of week) {
      expect(d.commitments.length).toBeGreaterThanOrEqual(2);
      expect(d.commitments.length).toBeLessThanOrEqual(3);
      for (const a of d.commitments) for (const b of d.commitments) if (a !== b) expect(a.hour < b.hour + b.length && b.hour < a.hour + a.length).toBe(false);
      expect(d.collisions.length).toBeGreaterThanOrEqual(1);
      for (const c of d.commitments) expect(COMMITMENT_TYPES[c.type]).toBeTruthy();
    }
    expect(generateWeek({ seed: 3, days: 7, act: 2, cityHeat: 0.7 })).toEqual(week);
  });
  it('fixedDay puts the emergency inside the commitment', () => {
    const d = fixedDay(4, 'gala');
    expect(overlaps(d.commitments[0], d.emergencies[0])).toBe(true);
    expect(d.collisions.length).toBe(1);
    expect(clockText(9.25)).toBe('09:15');
    expect(clockText(20.5)).toBe('20:30');
  });
  it('the clock adapter keeps its own time until a world clock with the same shape exists', () => {
    const world = {};
    const c = createDayClock({ world, hour: 23.9 });
    c.advance(0.2 / DAY_RATE);
    expect(c.day).toBe(1);
    expect(c.hour).toBeCloseTo(0.1, 5);
    c.pause();
    expect(c.advance(100)).toBe(0);
    c.resume();
    c.pin(9);
    expect(c.advance(100)).toBe(0);
    expect(c.hour).toBe(9);
    expect(c.until(8)).toBe(23);
    // M's clock arrives: the adapter delegates.
    world.clock = { hour: 14, day: 3, paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } };
    expect(c.shared).toBe(true);
    expect(c.hour).toBe(14);
    c.pause();
    expect(world.clock.paused).toBe(true);
  });
  it('pins stack by id, skipTo rests forward, and the world clock (environment.md shape) gets the same calls', () => {
    const c = createDayClock({ hour: 22 });
    c.pin(20.25, { id: 'bruce:scene' });
    c.pin(9, { id: 'step:x' });
    expect(c.hour).toBe(9);
    c.unpin('step:x');
    expect(c.hour).toBe(20.25);
    c.unpin('bruce:scene');
    expect(c.hour).toBe(22);
    c.skipTo(8);
    expect(c.hour).toBe(8);
    expect(c.day).toBe(1);
    const calls = [];
    const world = { clock: { hour: 23, day: 0, value: 23, pause() {}, pin: (h, o) => calls.push(['pin', h, o.id]), unpin: (id) => calls.push(['unpin', id]), skipTo: (h) => calls.push(['skipTo', h]) } };
    const w = createDayClock({ world });
    w.skipTo(20); w.pin(20, { id: 'bruce:scene' }); w.unpin('bruce:scene');
    expect(calls).toEqual([['skipTo', 20], ['pin', 20, 'bruce:scene'], ['unpin', 'bruce:scene']]);
    expect(w.advance(100)).toBe(0);
  });
});

describe('the morning paper and Alfred', () => {
  it('headlines react to last night and the double life', () => {
    const s = createDoubleLife({ standing: 25 });
    applyNight(s, { endHour: 3, crimesStopped: 0, crimesIgnored: 2, district: 'parkRow' });
    s.flags['excuseJoke.sailing'] = true;
    const h = headlines(s).map((x) => x.head).join(' | ');
    expect(h).toMatch(/PARK ROW ON EDGE/);
    expect(h).toMatch(/SAILING, AGAIN/);
    expect(h).toMatch(/WHERE IS BRUCE WAYNE/);
  });
  it("Alfred's morning line follows the meters", () => {
    const tired = createDoubleLife({ fatigue: 90 });
    expect(ALFRED_LINES.morningTired).toContain(pickLine('morning', tired, () => 0));
    const hurt = createDoubleLife();
    hurt.injuries.lip = 5;
    expect(ALFRED_LINES.morningInjured).toContain(pickLine('morning', hurt, () => 0.5));
    const broken = createDoubleLife({ patience: 0 });
    expect(ALFRED_LINES.breaking).toContain(pickLine('morning', broken, () => 0));
  });
});

describe('save fields', () => {
  it('an old save without the fields loads with defaults; garbage is cleaned', () => {
    const p = sanitizeProgress({ step: 12, suit: 'm' });
    expect(p.bruce.standing).toBe(55);
    expect(p.bruce.threads.alfred).toBe(3);
    expect(p.batcave).toEqual({ medals: {}, tutorial: [], trophies: [], suit: null });
    const bad = sanitizeDoubleLife({ standing: 'lots', fatigue: 400, excuses: { 'x y': { n: 2 }, sailing: { n: 2, who: ['reporter', 3] } }, flags: { ok: true, 'bad key': 1, obj: {} } });
    expect(bad.standing).toBe(55);
    expect(bad.fatigue).toBe(100);
    expect(Object.keys(bad.excuses)).toEqual(['sailing']);
    expect(bad.excuses.sailing.who).toEqual(['reporter']);
    expect(bad.flags).toEqual({ ok: true });
    expect(sanitizeBatcave({ medals: { sim1: 'gold', sim2: 'tin' }, suit: 'noir' })).toEqual({ medals: { sim1: 'gold' }, tutorial: [], trophies: [], suit: 'noir' });
  });
  it('round-trips through JSON; a new game resets the double life but keeps the cave medals', () => {
    const s = createDoubleLife();
    useExcuse(s, 'polo', 'reporter');
    applyNight(s, { endHour: 4, hits: 5 });
    const back = sanitizeDoubleLife(JSON.parse(JSON.stringify(s)));
    expect(back.excuses).toEqual(s.excuses);
    expect(back.fatigue).toBeCloseTo(s.fatigue, 5);
    expect(back.log).toEqual([]);
    const p = sanitizeProgress({ bruce: s, batcave: { medals: { simBasic: 'gold' } } });
    const fresh = newGameProgress(p);
    expect(fresh.bruce.excuses).toEqual({});
    expect(fresh.batcave.medals).toEqual({ simBasic: 'gold' });
  });
});
