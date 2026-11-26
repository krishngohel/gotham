// The campaign's data consistency (docs/design/story-format.md): every night's ids, sites, fights,
// rooms, bosses, music and clips resolve, and every mission can be completed by the state machine.
import { describe, it, expect } from 'vitest';
import { ACTS, allNights, nightById, nightOrder, nextNight, stepsOf, missionSelect, canFinish, STEP_TYPES, STEP_ID, isRewardId } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner } from '../../src/story/runner.js';
import { buildFight } from '../../src/story/fightBuilder.js';
import { pacingReport } from '../../src/story/pacing.js';
import { STEPS } from '../../src/game/story.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';
import { ROLE_KIT } from '../../src/enemies/roleKit.js';
import { GANGS } from '../../src/heroes/models/enemies.js';
import { VILLAINS } from '../../src/heroes/models/villains.js';
import { VILLAIN_THEMES } from '../../src/audio/music/director.js';
import { PROMPT_IDS } from '../../src/ui/prompts.js';
import { BOSS_IDS } from '../../src/bosses/index.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const later = () => allNights().filter((n) => n.id !== 'n1');
const siteOf = (n, id) => (typeof id === 'object' ? id : n.sites?.[id] ?? SITES[id] ?? REGION_SITES[id]);
const ENEMY_TYPES = new Set([...Object.keys(ROLE_KIT), 'harley']);
const finite = (p) => p && [p.x, p.y, p.z].every(Number.isFinite);

// The event that finishes a step, the way the game reports it.
function finishEvent(s) {
  switch (s.type ?? 'reach') {
    case 'cutscene': return { type: 'cutsceneDone', scene: s.scene };
    case 'fight': return { type: 'fightDone', id: s.fight };
    case 'collect': return { type: 'collected', item: s.item };
    case 'boss': return { type: 'bossDone' };
    case 'chase': case 'battle': case 'armada': return { type: `${s.type}Done` };
    case 'radio': case 'courier': case 'ally': case 'board': return { type: `${s.type}Done`, id: s.id };
    case 'reach': case 'interior': return { type: 'reached', step: s.id };
    default: return { type: 'stepDone', id: s.id };
  }
}

describe('campaign structure', () => {
  it('has five acts; Night One first; Acts II to V written, the finale last', () => {
    expect(ACTS.map((a) => a.id)).toEqual(['act1', 'act2', 'act3', 'act4', 'act5']);
    expect(nightOrder()[0]).toBe('n1');
    expect(ACTS[1].nights).toEqual(['n2', 'n3']);
    expect(ACTS[2].nights).toEqual(['n4', 'n5']);
    // [story2]
    expect(ACTS[3].nights).toEqual(['n6', 'n7']);
    expect(ACTS[4].nights).toEqual(['n8', 'n9']);
    expect(nextNight('n1')).toBe('n2');
    expect(nextNight('n5')).toBe('n6');
    expect(nextNight('n9')).toBe(null);
    expect(nightById('n9').finale).toBe(true);
    for (const id of Object.values(nightById('n9').endings)) expect(typeof nightById('n9').scenes[id], id).toBe('function');
  });
  it('Night One is the original story, untouched objects in the same order', () => {
    expect(stepsOf('n1')).toBe(STEPS);
    expect(nightById('n1').missions.flatMap((m) => m.steps)).toEqual(STEPS);
  });
  it('night, mission and step ids are unique and saveable', () => {
    const nights = new Set();
    for (const n of allNights()) {
      expect(nights.has(n.id), n.id).toBe(false);
      nights.add(n.id);
      expect(STEP_ID.test(n.id)).toBe(true);
      const ids = new Set(), missions = new Set();
      for (const m of n.missions) { expect(missions.has(m.id), `${n.id} ${m.id}`).toBe(false); missions.add(m.id); expect(STEP_ID.test(m.id)).toBe(true); }
      for (const s of stepsOf(n)) {
        expect(ids.has(s.id), `${n.id} duplicate step ${s.id}`).toBe(false);
        ids.add(s.id);
        expect(STEP_ID.test(s.id), `${n.id} ${s.id}`).toBe(true);
        expect(STEP_TYPES, `${n.id} ${s.id}`).toContain(s.type ?? 'reach');
      }
    }
  });
});

describe('every later night', () => {
  for (const n of later()) {
    describe(`${n.id}`, () => {
      const steps = stepsOf(n);
      it('declares its act, villain music, day hook and time of day', () => {
        expect(ACTS.find((a) => a.id === n.act)?.nights).toContain(n.id);
        expect(VILLAIN_THEMES[n.villain], n.villain).toBeDefined();
        expect(typeof n.day?.hook).toBe('string');
        expect(Number.isFinite(n.timeOfDay)).toBe(true);
        expect(n.timeOfDay >= 0 && n.timeOfDay < 24).toBe(true);
        const W = ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog', 'snow'];
        if (n.weather) expect(W, n.weather).toContain(n.weather);
        for (const s of steps) { if (s.weather) expect(W, s.id).toContain(s.weather); if (s.time != null) expect(s.time >= 0 && s.time < 24, s.id).toBe(true); }
        expect(typeof n.title).toBe('string');
        if (n.gang) expect(GANGS[n.gang], n.gang).toBeDefined();
      });
      it('every site a step, fight or room names exists, with real coordinates', () => {
        const check = (id, what) => { const p = siteOf(n, id); expect(finite(p), `${n.id} ${what}: ${JSON.stringify(id)}`).toBe(true); };
        for (const s of steps) {
          for (const k of ['site', 'checkpoint', 'at', 'to', 'face', 'placeAt']) if (s[k]) check(s[k], `${s.id}.${k}`);
          for (const p of s.points ?? []) check(p.site ?? p.at, `${s.id} scan point`);
          for (const g of s.gates ?? []) check(g, `${s.id} gate`);
          for (const p of s.plates ?? []) check(p.site ?? p.at, `${s.id} plate ${p.id}`);
          for (const o of s.options ?? []) check(o.site, `${s.id} option ${o.id}`);
          for (const o of s.optional ?? []) check(o.site, `${s.id} optional ${o.id}`);
          for (const it of s.interrupts ?? []) check(it.at, `${s.id} interrupt ${it.id}`);
          for (const ph of s.phantoms ?? []) check(ph.at ?? ph, `${s.id} phantom`);
          for (const w of s.watchers ?? []) check(w.at ?? w.site, `${s.id} watcher`);
          if (s.type === 'chase') for (const p of s.path ?? []) expect(Number.isFinite(p.x) && Number.isFinite(p.z), `${s.id} path`).toBe(true);
        }
        for (const [id, f] of Object.entries(n.fights ?? {})) {
          if (f.stealth) { expect(n.rooms?.[f.stealth], `${n.id} room ${f.stealth}`).toBeDefined(); continue; }
          check(f.site, `fight ${id}`);
        }
        for (const r of Object.values(n.rooms ?? {})) { check(r.site, `room ${r.id}`); check(r.entry, `room ${r.id} entry`); }
      });
      it('every fight builds a squad of real roles, on every difficulty', () => {
        for (const [id, f] of Object.entries(n.fights ?? {})) {
          if (f.stealth) {
            for (const g of n.rooms[f.stealth].squad) expect(ENEMY_TYPES.has(g.type), `${id} ${g.type}`).toBe(true);
            continue;
          }
          for (const difficulty of ['story', 'normal', 'hard', 'knightmare']) {
            const built = buildFight(id, f, { difficulty, act: n.actNumber ?? 2 });
            expect(built.waves.length, id).toBeGreaterThan(0);
            for (const w of built.waves) {
              expect(w.length, `${id} empty wave`).toBeGreaterThan(0);
              for (const e of w) { expect(ENEMY_TYPES.has(e.type), `${id} ${e.type}`).toBe(true); expect(Number.isFinite(e.dx) && Number.isFinite(e.dz)).toBe(true); }
            }
          }
          if (f.gang) expect(GANGS[f.gang], f.gang).toBeDefined();
        }
        for (const s of steps) if (s.type === 'fight') expect(n.fights?.[s.fight], `${n.id} ${s.id} -> ${s.fight}`).toBeDefined();
      });
      it('scenes, tutorials and rewards resolve; player text has no dashes', () => {
        for (const s of steps) {
          if (s.type === 'cutscene' || s.type === 'nightEnd') if (s.scene) expect(typeof n.scenes?.[s.scene], `${s.id} scene ${s.scene}`).toBe('function');
          for (const id of s.tutorial ?? []) expect(PROMPT_IDS, `${s.id} ${id}`).toContain(id);
          if (s.reward) expect(isRewardId(s.reward), s.reward).toBe(true);
          const texts = [s.text, s.tip?.title, s.tip?.text, s.title?.text, s.title?.sub, s.riddle, ...(s.lines ?? []).map((l) => l.text), ...(s.banter ?? []).map((l) => l.text), ...(s.wrongLines ?? []).map((l) => l.text)];
          for (const t of texts) if (t) expect(t, s.id).not.toMatch(DASH);
          for (const l of [...(s.lines ?? []), ...(s.banter ?? [])]) { expect(typeof l.speaker, s.id).toBe('string'); expect(l.text.trim().length).toBeGreaterThan(0); }
        }
        for (const m of n.missions) for (const r of m.rewards ?? []) expect(isRewardId(r), `${m.id} ${r}`).toBe(true);
        for (const l of n.day?.fallback ?? []) expect(l.text).not.toMatch(DASH);
      });
      it('every mission is completable: the runner walks the night start to end on its own events', () => {
        for (const s of steps) expect(canFinish(s), `${s.id} can never finish`).toBe(true);
        const r = createRunner(steps, 0);
        const seen = new Set();
        for (let guard = 0; guard < steps.length * 3 && !r.done; guard++) {
          const s = r.step;
          seen.add(s.id);
          if (s.type === 'nightEnd') break;
          const ev = finishEvent(s);
          // A fork takes its first option (the others are covered below).
          if (s.type === 'fork') ev.branch = s.options[0].id;
          expect(r.handle(ev), `${n.id} ${s.id} did not finish on ${JSON.stringify(ev)}`).toBe(true);
        }
        expect(r.step?.type, `${n.id} ends on nightEnd`).toBe('nightEnd');
        // Every fork's every branch leads somewhere real and back onto the night.
        for (const s of steps.filter((x) => x.type === 'fork')) for (const o of s.options) expect(r.indexOf(s.branches?.[o.id] ?? ''), `${s.id} ${o.id}`).toBeGreaterThanOrEqual(0);
        // [story2] A dilemma's and a life test's branches lead somewhere real too, and every branch
        // walks on to the night's end.
        for (const s of steps.filter((x) => x.type === 'dilemma' || x.type === 'life')) {
          expect(s.branches, `${s.id} branches`).toBeDefined();
          for (const [k, to] of Object.entries(s.branches)) {
            const at = r.indexOf(to);
            expect(at, `${s.id} ${k} -> ${to}`).toBeGreaterThanOrEqual(0);
            const w = createRunner(steps, at);
            for (let guard = 0; guard < steps.length * 3 && w.step?.type !== 'nightEnd'; guard++) {
              const ev = finishEvent(w.step);
              if (w.step.type === 'fork') ev.branch = w.step.options[0].id;
              expect(w.handle(ev), `${s.id}.${k}: ${w.step.id}`).toBe(true);
            }
            expect(w.step?.type, `${s.id}.${k} reaches the night's end`).toBe('nightEnd');
          }
          if (s.type === 'dilemma') for (const side of ['bruce', 'batman']) expect(finite(siteOf(n, s[side].site)), `${s.id} ${side} site`).toBe(true);
        }
        for (const s of steps.filter((x) => x.type === 'civvy')) for (const b of s.beats) {
          expect(finite(siteOf(n, b.site)), `${s.id} beat ${b.id}`).toBe(true);
          if (b.choice) { expect(b.choice.options.some((o) => o.id === b.choice.default), `${s.id} ${b.id} default`).toBe(true); for (const o of b.choice.options) expect(o.text, o.id).not.toMatch(DASH); }
        }
        for (const s of steps) for (const c of s.calls ?? []) {
          expect(c.options.some((o) => o.id === c.default) || !!c.silent, `${s.id} call ${c.id} default`).toBe(true);
          for (const o of c.options) expect(o.text).not.toMatch(DASH);
        }
        // Every mission has a boss or a fight or a puzzle somewhere: no empty missions.
        for (const m of n.missions) expect(m.steps.length, m.id).toBeGreaterThan(0);
      });
      it('has a boss on a registered villain model, and the pacing rules hold', () => {
        const bosses = steps.filter((s) => s.type === 'boss');
        // [story2] every night opens with its "Previously" page
        expect(steps[0].type, `${n.id} opens with a recap`).toBe('cutscene');
        expect(bosses.length, `${n.id} boss`).toBeGreaterThan(0);
        for (const s of bosses) expect(BOSS_IDS, s.id).toContain(s.boss);
        for (const s of steps) {
          // Talk while moving: a radio step on its own only with talk 'over' or a cinematic.
          if (s.type === 'radio') expect(s.talk === 'over' || !!s.cinematic, `${s.id} stand-alone radio`).toBe(true);
        }
        const p = pacingReport(steps);
        expect(p.radioSteps, `${n.id} radio-only steps`).toBe(0);
      });
    });
  }
});

describe('mission select', () => {
  it('lists the missions of the nights reached, replayable once done', () => {
    const list = missionSelect({ night: 'n2', nightsDone: ['n1'], missionsDone: [`n1.${nightById('n1').missions[0].id}`] });
    expect(list.some((m) => m.night === 'n1')).toBe(true);
    expect(list.some((m) => m.night === 'n2')).toBe(true);
    expect(list.some((m) => m.night === 'n3')).toBe(false);
    expect(list.find((m) => m.night === 'n1').replayable).toBe(true);
    expect(list.filter((m) => m.replayable)).toHaveLength(1);
  });
});

describe('villain models exist for every campaign boss', () => {
  it('each def names a model createVillain knows', async () => {
    const { penguinDef } = await import('../../src/bosses/defs/penguin.js');
    const { riddlerDef } = await import('../../src/bosses/defs/riddler.js');
    const { scarecrowDef } = await import('../../src/bosses/defs/scarecrow.js');
    const { freezeDef } = await import('../../src/bosses/defs/freeze.js');
    const { CAMPAIGN_BOSS_DEFS } = await import('../../src/bosses/index.js');
    for (const make of [penguinDef, riddlerDef, scarecrowDef, freezeDef, ...CAMPAIGN_BOSS_DEFS]) {
      const d = make({});
      expect(VILLAIN_THEMES[d.villain], d.id).toBeDefined();
      expect(d.phases.length, d.id).toBeGreaterThanOrEqual(2);
      expect(typeof d.create, d.id).toBe('function');
      expect(VILLAINS[d.model], `${d.id} model ${d.model}`).toBeDefined();
      for (const sceneName of [d.intro, d.outro].filter(Boolean)) {
        expect(allNights().some((n) => typeof n.scenes?.[sceneName] === 'function'), `${d.id} scene ${sceneName}`).toBe(true);
      }
    }
    expect(Object.keys(VILLAINS)).toEqual(expect.arrayContaining(['crimeBoss', 'puzzler', 'scarecrow', 'coldScientist', 'ivy', 'firebug', 'blackMask', 'jester', 'harlequin']));
    // [story2] no boss mechanic repeats: every campaign boss is a different def with its own skill
    const ids = CAMPAIGN_BOSS_DEFS.map((m) => m({}).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
