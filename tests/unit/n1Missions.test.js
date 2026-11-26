// [m1] Night One's four added missions (src/story/missions/n1/index.js): where they sit, that the
// original night is intact around them, that they keep the teaching order, and that every step can
// finish.
import { describe, it, expect } from 'vitest';
import { STEPS, ORIGINAL_IDS } from '../../src/game/story.js';
import { N1_MISSIONS, N1_SITES, N1_FIGHTS, N1_ROOMS, N1_FILLS, withMissions } from '../../src/story/missions/n1/index.js';
import { FIGHTS } from '../../src/game/fights.js';
import { SITES } from '../../src/world/mapData.js';
import { PROMPT_IDS } from '../../src/ui/prompts.js';
import { createObjectives } from '../../src/game/objectives.js';
import { nightById, stepsOf, canFinish, missionSelect, requiredSites, STEP_ID, STEP_TYPES } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { buildFight } from '../../src/story/fightBuilder.js';
import { roomFight } from '../../src/story/rooms.js';
import { pacingReport } from '../../src/story/pacing.js';
import { ABILITIES } from '../../src/abilities/abilityDefs.js';
import { GADGETS } from '../../src/gadgets/gadgetDefs.js';
import { CHAPTERS, chapterOf } from '../../src/game/progressTracker.js';
import { CHECKLIST } from '../../src/game/caseFile.js';
import { STEALTH_ENCOUNTERS } from '../../src/openworld/stealth/encounters.js';

const idx = (id) => STEPS.findIndex((s) => s.id === id);
const added = N1_MISSIONS.flatMap((m) => m.steps);
const site = (id) => (typeof id === 'object' ? id : N1_SITES[id] ?? SITES[id] ?? null);
const fightOf = (s) => {
  const def = N1_FIGHTS[s.fight];
  if (!def) return FIGHTS[s.fight];
  return def.stealth ? roomFight(N1_ROOMS[def.stealth], site) : buildFight(s.fight, def, { act: 1 });
};
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// The original night as it stood before the missions round (commit ce3e870), frozen here.
const BEFORE = ['intro', 'signal', 'card', 'courierIntro', 'toDocks', 'boardBatmobile', 'batmobileChase', 'toRoofAfterChase', 'f1', 'toYard', 'f2', 'toShip', 'f3', 'crates', 'rewardCrates', 'toNeon', 'n1', 'toStreet', 'n2', 'toMonarch', 'n3', 'courierRooftop', 'monarchBalcony', 'rig', 'rewardRig', 'toAce', 'boardBatmobileAce', 'aceBattle', 'a1', 'toFactory', 'a2', 'boardBatmobileAce2', 'aceVanChase', 'toHarleyDoor', 'harleyFight', 'toVat', 'a3', 'toCatwalks', 'aceCatwalks', 'antidote', 'rewardAntidote', 'courierReveal', 'nightwingTagRadio', 'toPlaza', 'plazaFight', 'toFunhouse', 'funhouseFight', 'toTower', 'boss', 'finale', 'credits'];

describe('Night One with the added missions', () => {
  it('the original steps are all there, in the same order, with the same ids', () => {
    expect(ORIGINAL_IDS).toEqual(BEFORE);
    expect(STEPS.map((s) => s.id).filter((id) => BEFORE.includes(id))).toEqual(BEFORE);
    expect(STEPS).toHaveLength(BEFORE.length + added.length);
  });
  it('the opening and the finale are untouched: same first four and last four steps', () => {
    expect(STEPS.slice(0, 4).map((s) => s.id)).toEqual(['intro', 'signal', 'card', 'courierIntro']);
    expect(STEPS.slice(-4).map((s) => s.id)).toEqual(['toTower', 'boss', 'finale', 'credits']);
    expect(nightById('n1')).toMatchObject({ timeOfDay: 23, weather: 'storm', villain: 'joker' });
  });
  it('each mission is one block straight after the step it follows', () => {
    for (const m of N1_MISSIONS) {
      const at = idx(m.after);
      expect(at, m.id).toBeGreaterThanOrEqual(0);
      expect(STEPS.slice(at + 1, at + 1 + m.steps.length), m.id).toEqual(m.steps);
      expect(m.steps.length, m.id).toBeGreaterThanOrEqual(5);
      for (const s of m.steps) expect(s.mission).toBe(m.id);
    }
  });
  it('mission select lists ten missions in play order, the new ones between the old', () => {
    const n = nightById('n1');
    expect(n.missions.map((m) => m.id)).toEqual(['m1Signal', 'm1Docks', 'm1Short', 'm1Neon', 'm1Booth', 'm1Ace', 'm1Encore', 'm1Clock', 'm1Clocks', 'm1Tower']);
    expect(n.missions.flatMap((m) => m.steps)).toEqual(STEPS);
    for (const m of n.missions) { expect(typeof m.title).toBe('string'); expect(m.title.length).toBeGreaterThan(3); expect(STEP_ID.test(m.id)).toBe(true); }
    expect(missionSelect({ night: 'n1' }).filter((m) => m.night === 'n1')).toHaveLength(10);
    // The original missions still start on the steps they always did.
    for (const [mission, first] of [['m1Docks', 'toDocks'], ['m1Neon', 'toNeon'], ['m1Ace', 'toAce'], ['m1Clock', 'nightwingTagRadio'], ['m1Tower', 'toTower']]) {
      expect(n.missions.find((m) => m.id === mission).steps[0].id).toBe(first);
    }
  });
  it('everything keyed to an original step id still points at the same beat', () => {
    for (const a of ABILITIES) if (a.grant?.step) expect(BEFORE, a.id).toContain(a.grant.step);
    for (const gd of GADGETS) if (gd.unlock?.step) expect(BEFORE, gd.id).toContain(gd.unlock.step);
    for (const c of CHAPTERS) expect(BEFORE, c.name).toContain(c.first);
    for (const c of CHECKLIST) expect(BEFORE, c.id).toContain(c.step);
    // A new mission belongs to the chapter it is played in.
    expect(chapterOf(idx('shortCount')).name).toBe('The Docks');
    expect(chapterOf(idx('feedTrace')).name).toBe('Neon Row');
    expect(chapterOf(idx('toDrive')).name).toBe('Ace Chemicals');
    expect(chapterOf(idx('toQuay')).name).toBe('Ace Chemicals');
    expect(chapterOf(idx('toTower')).name).toBe('The Clock Tower');
  });
});

describe('the added missions keep the teaching order', () => {
  const grantAt = (id) => idx(ABILITIES.find((a) => a.id === id).grant.step);
  const NEEDS = { grapple: 'grapple', divebomb: 'diveBomb', callCar: 'batmobileCall', detective: 'detective', silent: 'silentTakedown', eject: 'eject', callBatwing: 'batwing', fly: 'batwing' };
  it('a step only prompts for a tool the story has already handed over', () => {
    for (const s of added) {
      for (const p of s.tutorial ?? []) {
        expect(PROMPT_IDS, `${s.id} ${p}`).toContain(p);
        if (NEEDS[p]) expect(grantAt(NEEDS[p]), `${s.id} uses ${p}`).toBeLessThan(idx(s.id));
      }
      if (s.type === 'scan') expect(grantAt('detective'), s.id).toBeLessThan(idx(s.id));
      if (s.type === 'board' || s.type === 'chase') expect(grantAt('batmobile'), s.id).toBeLessThan(idx(s.id));
    }
    expect(grantAt('silentTakedown')).toBeLessThan(idx('domeWatch'));
    expect(grantAt('batwing')).toBeLessThan(idx('toExchange'));
    expect(grantAt('eject')).toBeLessThan(idx('toFountain'));
  });
  it('each mission uses what the missions before it taught', () => {
    const uses = (m) => [...new Set(N1_MISSIONS.find((x) => x.id === m).steps.flatMap((s) => [s.type ?? 'reach', ...(s.tutorial ?? [])]))];
    expect(uses('m1Short')).toEqual(expect.arrayContaining(['grapple', 'divebomb', 'callCar', 'chase', 'fight']));
    expect(uses('m1Booth')).toEqual(expect.arrayContaining(['detective', 'scan', 'silent']));
    expect(uses('m1Encore')).toEqual(expect.arrayContaining(['eject', 'chase', 'puzzle']));
    expect(uses('m1Clocks')).toEqual(expect.arrayContaining(['callBatwing', 'scan', 'traverse']));
  });
  it('enemy roles appear in the order the night teaches them', () => {
    const firstAllowed = { grunt: 0, knife: idx('n1'), rifle: idx('monarchBalcony'), brute: idx('a1') };
    for (const s of added.filter((x) => x.type === 'fight')) {
      for (const e of fightOf(s).waves.flat()) {
        expect(firstAllowed[e.type], `${s.id} ${e.type}`).toBeDefined();
        expect(firstAllowed[e.type], `${s.id} has a ${e.type}`).toBeLessThan(idx(s.id));
      }
    }
  });
  it('at most one plain brawl among the additions, and no two missions are the same kind', () => {
    const brawls = added.filter((s) => s.type === 'fight' && !N1_FIGHTS[s.fight]?.stealth);
    expect(brawls.map((s) => s.id)).toEqual(['furnaceFight']);
    const kinds = N1_MISSIONS.map((m) => [...new Set(m.steps.map((s) => (s.type === 'fight' ? (N1_FIGHTS[s.fight].stealth ? 'room' : 'brawl') : s.type ?? 'reach')))].sort().join(','));
    expect(new Set(kinds).size).toBe(N1_MISSIONS.length);
  });
  it('they add no hard stops: no comic, no cinematic, no stand-alone radio, no teleport', () => {
    const r = pacingReport(added);
    expect(r).toMatchObject({ hardStops: 0, cuts: 0, noAgencySeconds: 0 });
    for (const s of added) { expect(s.placeAt, s.id).toBeUndefined(); expect(s.reward, s.id).toBeUndefined(); expect(s.grant, s.id).toBeUndefined(); }
  });
});

describe('the added missions are well formed', () => {
  const finite = (p) => !!p && [p.x, p.y, p.z].every(Number.isFinite);
  it('ids are new, saveable and unique; types are known', () => {
    const ids = new Set(BEFORE);
    for (const s of added) {
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      expect(STEP_ID.test(s.id), s.id).toBe(true);
      expect(STEP_TYPES, s.id).toContain(s.type ?? 'reach');
    }
    for (const id of Object.keys(N1_SITES)) expect(SITES[id], `${id} shadows a core site`).toBeUndefined();
    for (const id of Object.keys(N1_FIGHTS)) expect(FIGHTS[id], `${id} shadows a Night One fight`).toBeUndefined();
  });
  it('every place a step names resolves to real coordinates', () => {
    for (const s of added) {
      for (const k of ['site', 'checkpoint', 'at', 'to', 'face']) if (s[k]) expect(finite(site(s[k])), `${s.id}.${k}`).toBe(true);
      for (const p of s.points ?? []) expect(finite(site(p.site)), `${s.id} point`).toBe(true);
      for (const gt of s.gates ?? []) expect(finite(site(gt)), `${s.id} gate`).toBe(true);
      for (const p of s.plates ?? []) expect(finite(site(p.site)), `${s.id} plate`).toBe(true);
      for (const p of s.path ?? []) expect(Number.isFinite(p.x) && Number.isFinite(p.z), `${s.id} path`).toBe(true);
      if (s.type === 'puzzle') { for (const id of s.order) expect(s.plates.some((p) => p.id === id), `${s.id} ${id}`).toBe(true); expect(s.timer).toBeGreaterThanOrEqual(60); }
      if (s.type === 'traverse' && s.timer != null) expect(s.timer, s.id).toBeGreaterThanOrEqual(60); // gentle: the tutorial night
    }
    // Beyond its own sites the night asks the city only for the core's.
    for (const id of requiredSites('n1')) expect(SITES[id], id).toBeDefined();
  });
  it('fights and rooms build squads of known roles, on their routes, inside their bounds', () => {
    for (const s of added.filter((x) => x.type === 'fight')) {
      const f = fightOf(s);
      expect(finite(site(f.site)), s.id).toBe(true);
      expect(f.waves.length, s.id).toBeGreaterThan(0);
      for (const w of f.waves) { expect(w.length).toBeGreaterThan(0); for (const e of w) expect(['grunt', 'knife', 'brute', 'rifle'], `${s.id} ${e.type}`).toContain(e.type); }
    }
    for (const r of Object.values(N1_ROOMS)) {
      expect(finite(site(r.site)) && finite(site(r.entry)), r.id).toBe(true);
      expect(r.squad.length).toBeGreaterThanOrEqual(4);
      expect(r.squad.length).toBeLessThanOrEqual(5); // a gentle room, and a small crowd for the frame budget
      expect(r.lights.length, `${r.id} is lit`).toBeGreaterThanOrEqual(3);
      const b = r.bounds;
      for (const gn of r.squad) for (const p of gn.route.points) {
        expect(p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && p.y >= b.minY && p.y <= b.maxY, `${r.id} route point`).toBe(true);
        // No patrol walks through a cover crate.
        for (const c of r.cover) expect(Math.abs(p.x - c.x) < c.w / 2 + 0.4 && Math.abs(p.z - c.z) < c.d / 2 + 0.4, `${r.id} route in cover`).toBe(false);
      }
      // The entry is outside the room, or well above it: she arrives unseen.
      const e = site(r.entry);
      expect(e.x < b.minX || e.x > b.maxX || e.z < b.minZ || e.z > b.maxZ || e.y > 10, r.id).toBe(true);
      // It keeps clear of the open-world predator encounters (theirs engage within 14 m of their entry).
      for (const enc of STEALTH_ENCOUNTERS) {
        const dx = Math.max(b.minX - enc.entry.x, 0, enc.entry.x - b.maxX), dz = Math.max(b.minZ - enc.entry.z, 0, enc.entry.z - b.maxZ);
        expect(Math.hypot(dx, dz), r.id + " vs " + enc.id).toBeGreaterThan(30);
      }
    }
  });
  it('every set piece has a fill light (no scene too dark)', () => {
    const near = (p, d) => N1_FILLS.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < d && l.intensity > 0 && l.distance > 10);
    for (const id of ['n1DomeRoom', 'n1BoothDoor', 'n1QuayRoom', 'n1ClockA', 'n1ClockB', 'n1Furnace', 'n1Fountain']) expect(near(N1_SITES[id], 30), id).toBe(true);
    expect(nightById('n1').fills).toBe(N1_FILLS);
  });
  it('player text: no dashes, real speakers, a nudge on every travel step, a reason after every fight', () => {
    for (const s of added) {
      expect(typeof s.text, s.id).toBe('string');
      const lines = [...(s.lines ?? []), ...(s.banter ?? []), ...(s.wrongLines ?? []), ...(s.failLines ?? []), ...(s.points ?? []).flatMap((p) => p.lines ?? []), ...(s.nudge ? [s.nudge] : [])];
      for (const t of [s.text, s.riddle, s.riddleTitle, s.failTitle, s.failText, s.van?.toast, ...lines.map((l) => l.text)]) if (t) expect(t, s.id).not.toMatch(DASH);
      for (const l of lines) { expect(typeof l.speaker).toBe('string'); expect(l.text.trim().length).toBeGreaterThan(0); }
      if ([undefined, 'reach', 'board'].includes(s.type)) { expect(s.nudge?.text, s.id).toBeTruthy(); expect(s.lines?.length, s.id).toBeGreaterThan(0); }
    }
  });
});

describe('the step graph', () => {
  it('every added step has an event that finishes it', () => {
    for (const s of added) expect(canFinish(s), s.id).toBe(true);
  });
  it('the whole night walks from the intro to the credits, through every added step in order', () => {
    const o = createObjectives(stepsOf('n1'));
    const seen = [];
    const ev = (s) => ({
      cutscene: { type: 'cutsceneDone', scene: s.scene }, fight: { type: 'fightDone', id: s.fight }, collect: { type: 'collected', item: s.item },
      boss: { type: 'bossDone' }, chase: { type: 'chaseDone' }, battle: { type: 'battleDone' }, radio: { type: 'radioDone', id: s.id },
      courier: { type: 'courierDone', id: s.id }, ally: { type: 'allyDone', id: s.id }, board: { type: 'boardDone', id: s.id },
      scan: { type: 'stepDone', id: s.id }, traverse: { type: 'stepDone', id: s.id }, puzzle: { type: 'stepDone', id: s.id },
    }[s.type ?? 'reach'] ?? { type: 'reached', step: s.id });
    for (let guard = 0; guard < 200 && o.step && o.step.type !== 'credits'; guard++) {
      const s = o.step;
      seen.push(s.id);
      // The wrong step's event never moves the story.
      expect(o.handle({ type: 'reached', step: 'nowhere' })).toBe(false);
      expect(o.handle(ev(s)), s.id).toBe(true);
    }
    expect(o.step.type).toBe('credits');
    expect(seen.filter((id) => added.some((s) => s.id === id))).toEqual(added.map((s) => s.id));
  });
  it('past its first leg, a death respawns at a checkpoint inside the mission being played', () => {
    for (const m of N1_MISSIONS) for (const s of m.steps.slice(2)) {
      let cp = null;
      for (let i = idx(s.id); i >= 0 && !cp; i--) cp = STEPS[i].checkpoint ?? null;
      expect(N1_SITES[cp], `${s.id} respawns at ${cp}`).toBeDefined();
    }
  });
  it('withMissions leaves the base list alone and ignores a mission whose anchor is gone', () => {
    const base = [{ id: 'a' }, { id: 'b' }];
    const out = withMissions(base, [{ id: 'mX', after: 'a', steps: [{ id: 'x' }] }, { id: 'mY', after: 'gone', steps: [{ id: 'y' }] }]);
    expect(out.map((s) => s.id)).toEqual(['a', 'x', 'b']);
    expect(base.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
