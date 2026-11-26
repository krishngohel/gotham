// [prog] Wave 3 gadgets: data consistency, the wheel's pages, the save field, unlocks through the
// campaign, and each new handler's core rule against a fake sys (as gadgetFreezeHandler.test.js).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  GADGETS, GADGET_IDS, NEW_GADGETS, NEW_GADGET_IDS, ALL_GADGETS, ALL_GADGET_IDS, gadgetById, rewardGadgetId, unlockedNewIds, unlockedIds, newGadgetHints,
} from '../../src/gadgets/gadgetDefs.js';
import { HANDLER_FACTORIES } from '../../src/gadgets/g/index.js';
import { PROMPT_IDS, promptText } from '../../src/ui/prompts.js';
import { GADGET_ICONS } from '../../src/ui/gadgetIcons.js';
import { DEFAULT_LOADOUT, LOADOUT_PAGES, sanitizeLoadout, swapSlots, nextPage, livePages, slotOf } from '../../src/gadgets/loadout.js';
import { sanitizeGadgetSave } from '../../src/gadgets/gadgetSave.js';
import { sanitizeProgress } from '../../src/core/save.js';
import { createGadgetState } from '../../src/gadgets/gadgetState.js';
import { createGadgetSystem } from '../../src/gadgets/gadgetSystem.js';
import { createTimeControl } from '../../src/core/time.js';
import { createEvents } from '../../src/core/events.js';
import { upgradeEffects, BASE_EFFECTS } from '../../src/progress/upgrades.js';
import { DEFAULT_BINDINGS } from '../../src/core/bindings.js';
import { STEPS } from '../../src/game/story.js';
import { createHackRound, HACK } from '../../src/gadgets/hackRules.js';
import { configureGadgets } from '../../src/gadgets/config.js';
import { registerHackTarget } from '../../src/gadgets/g/hack.js';
import { createCombat } from '../../src/combat/combatSystem.js';
import { ENEMY } from '../../src/combat/rules.js';
import { createRng } from '../../src/core/rng.js';

const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

describe('wave 3 gadget data', () => {
  it('ten new gadgets with the contract ids, after the untouched original eight', () => {
    expect(NEW_GADGET_IDS).toEqual(['disruptor', 'sonic', 'hack', 'shock', 'glue', 'tracker', 'drone', 'bolas', 'emp', 'decoy']);
    expect(GADGET_IDS).toHaveLength(8);
    expect(ALL_GADGET_IDS).toHaveLength(18);
    expect(new Set(ALL_GADGET_IDS).size).toBe(18);
    expect(ALL_GADGETS.slice(0, 8)).toEqual(GADGETS);
    expect(GADGET_IDS).not.toContain('line');
  });
  it('every gadget has a handler, a prompt, an icon, a hint-free copy and a valid kind', () => {
    for (const g of ALL_GADGETS) {
      expect(HANDLER_FACTORIES[g.id], g.id).toBeTypeOf('function');
      expect(HANDLER_FACTORIES[g.id]().id).toBe(g.id);
      expect(PROMPT_IDS, g.id).toContain(g.promptId);
      expect(promptText(g.promptId, DEFAULT_BINDINGS)).not.toMatch(DASH);
      expect(GADGET_ICONS[g.id], g.id).toBeTruthy();
      expect(['free', 'cooldown', 'charges']).toContain(g.kind);
      if (g.kind === 'charges') { expect(g.max).toBeGreaterThan(0); expect(g.recharge).toBeGreaterThan(0); }
      if (g.kind === 'cooldown') expect(g.cooldown).toBeGreaterThan(0);
      for (const s of [g.name, g.unlockText, g.cardText]) expect(s).not.toMatch(DASH);
    }
    for (const g of NEW_GADGETS) expect(g.unlock).toEqual({ reward: true });
  });
  it('every effects key the new gadgets read has a base value', () => {
    for (const k of ['disruptorCharges', 'sonicStun', 'hackWindow', 'shockChargeRate', 'glueRadius', 'trackerTags', 'droneTime', 'bolasTargets', 'empRadius', 'decoyTime', 'hackRange', 'trackerPersist']) {
      expect(BASE_EFFECTS, k).toHaveProperty(k);
    }
  });
  it('their hints exist and have no dashes', () => {
    const h = newGadgetHints((a) => `[${a}]`);
    for (const f of Object.values(h)) expect(f()).not.toMatch(DASH);
    expect(h['shock-ready']()).toContain('[punch]');
  });
  it('campaign reward ids, and no finished fallback', () => {
    expect(rewardGadgetId('gadget.emp')).toBe('emp');
    expect(rewardGadgetId('gadget.nope')).toBe(null);
    expect(rewardGadgetId('suit.classic')).toBe(null);
    expect(unlockedNewIds({ finished: false }, ['emp', 'gel'])).toEqual(['emp']);
    // [fix1] `finished` is Night One's credits now: it no longer hands out the ten new gadgets
    // (they come from the campaign's later nights); the story's paid rewards do.
    expect(unlockedNewIds({ finished: true })).toEqual([]);
    expect(unlockedNewIds({ finished: true, campaign: { rewards: ['gadget:disruptor', 'gadget:cryptographicSequencer', 'xp:150'] } })).toEqual(['disruptor', 'hack']);
    // The story's own list stays the eight.
    expect(unlockedIds({ step: 0, finished: true }, STEPS, ['emp'])).toEqual(GADGET_IDS);
  });
});

describe('wheel pages (loadout)', () => {
  it('the default keeps the original eight in their slots and places every gadget once', () => {
    expect(DEFAULT_LOADOUT).toHaveLength(LOADOUT_PAGES);
    expect(DEFAULT_LOADOUT[0]).toEqual(GADGET_IDS);
    const flat = DEFAULT_LOADOUT.flat().filter(Boolean);
    expect([...flat].sort()).toEqual([...ALL_GADGET_IDS].sort());
  });
  it('sanitize: junk, duplicates and a moved batarang are fixed, missing gadgets are placed', () => {
    const l = sanitizeLoadout([['gel', 'gel', 'laser', 3], ['emp'], 'x']);
    expect(l[0][0]).toBe('batarang');
    expect(l.flat().filter(Boolean).sort()).toEqual([...ALL_GADGET_IDS].sort());
    expect(l[1][0]).toBe('emp');
    expect(sanitizeLoadout('nope')).toEqual(DEFAULT_LOADOUT.map((p) => [...p]));
  });
  it('swaps, never the batarang', () => {
    const l = sanitizeLoadout(DEFAULT_LOADOUT);
    expect(swapSlots(l, { page: 0, slot: 1 }, { page: 1, slot: 0 })).toBe(true);
    expect(l[0][1]).toBe('disruptor');
    expect(l[1][0]).toBe('remote');
    expect(swapSlots(l, { page: 0, slot: 0 }, { page: 1, slot: 1 })).toBe(false);
    expect(slotOf(l, 'remote')).toEqual({ page: 1, slot: 0 });
  });
  it('page turns skip pages with nothing unlocked', () => {
    const only = new Set(['batarang', 'emp']);
    const open = (id) => only.has(id);
    expect(livePages(DEFAULT_LOADOUT, open)).toEqual([0, 2]);
    expect(nextPage(DEFAULT_LOADOUT, 0, open)).toBe(2);
    expect(nextPage(DEFAULT_LOADOUT, 2, open)).toBe(0);
    expect(nextPage(DEFAULT_LOADOUT, 0, (id) => id === 'batarang')).toBe(0);
  });
});

describe('gadgets save field (wave 3)', () => {
  it('an old gadgets save loads unchanged: no loadout key, the default pages', () => {
    const old = { equipped: 'claw', unlocked: ['remote', 'gel', 'claw'], broken: [], caches: [], wheelUsed: true };
    const g = sanitizeProgress({ step: 30, gadgets: old }).gadgets;
    expect(g).toEqual(old);
    expect(g.loadout).toBeUndefined();
  });
  it('new ids and a loadout survive; junk loadouts are repaired', () => {
    const g = sanitizeGadgetSave({ equipped: 'emp', unlocked: ['emp', 'decoy', 'x'], loadout: [['batarang', 'emp']] });
    expect(g.equipped).toBe('emp');
    expect(g.unlocked).toEqual(['emp', 'decoy']);
    expect(g.loadout[0][1]).toBe('emp');
    expect(g.loadout.flat().filter(Boolean)).toHaveLength(18);
  });
});

describe('gadget state (wave 3)', () => {
  it('the disruptor charge count follows effects.disruptorCharges', () => {
    const tune = { ...BASE_EFFECTS };
    const s = createGadgetState({ unlocked: ['disruptor'], tune });
    expect(s.status('disruptor').max).toBe(2);
    s.use('disruptor'); s.use('disruptor');
    expect(s.ready('disruptor')).toBe(false);
    tune.disruptorCharges = 3;
    s.tick(15.01);
    expect(s.status('disruptor').charges).toBe(1);
    s.tick(30.02);
    expect(s.status('disruptor').charges).toBe(3);
  });
});

// ---- the system: unlocks, pages ----
function fakeInput() {
  const down = new Set(), pressed = new Set(), codes = new Set();
  return {
    look: { dx: 0, dy: 0 }, stick: { lx: 0, ly: 0 }, move: { x: 0, y: 0 }, codes,
    down: (a) => down.has(a), pressed: (a) => pressed.has(a), released: () => false,
    codePressed: (c) => codes.has(c), swallow: (c) => codes.delete(c),
    hold(a) { down.add(a); pressed.add(a); }, letGo(a) { down.delete(a); }, tap(a) { pressed.add(a); }, key(c) { codes.add(c); },
    endFrame() { pressed.clear(); codes.clear(); },
  };
}
function setupSys({ unlocked = [], finished = false, devAll = false, gadgets = {}, secondary = false, campaign = undefined } = {}) {
  const events = createEvents(), time = createTimeControl(), input = fakeInput();
  const wheelUi = { show: vi.fn(), setPick: vi.fn(), setInfo: vi.fn(), hide: vi.fn(), setPage: vi.fn(), warm() {} };
  const progress = { step: 0, finished, gadgets: { equipped: 'batarang', unlocked, broken: [], caches: [], wheelUsed: true, ...gadgets }, ...(campaign ? { campaign } : {}) };
  const save = vi.fn();
  const stub = (id) => () => ({ id, fire: () => true });
  const factories = Object.fromEntries(ALL_GADGET_IDS.map((id) => [id, stub(id)]));
  const hero = { dead: false, state: 'ground', grounded: true, control: null, pos: { x: 0, y: 0, z: 0 }, bat: { animator: { play() {} } } };
  const sys = createGadgetSystem({
    hero, combat: { gadgetApi: {}, enemies: [], consumeInput() {} }, follow: {}, time, events, input, fx: {}, gfx: {}, breakables: {},
    progress, save, collision: {}, camera: {}, effects: upgradeEffects([]), wheelUi, gadgetHud: { set() {} },
    getBindings: () => DEFAULT_BINDINGS, isPlaying: () => true, factories, devAll, secondary, player: secondary ? { id: 1, hero } : 0,
  });
  const frame = () => { sys.update(0.016, 0.016, { input }); input.endFrame(); };
  return { sys, events, wheelUi, progress, save, input, frame };
}

describe('gadget system (wave 3)', () => {
  it('a campaign reward unlocks, remembers and announces its gadget once', () => {
    const t = setupSys();
    const log = [];
    t.events.on('gadgetUnlocked', ({ id }) => log.push(id));
    expect(t.sys.state.isUnlocked('emp')).toBe(false);
    t.events.emit('campaignReward', { id: 'gadget.emp' });
    t.events.emit('campaignReward', { id: 'gadget.emp' });
    t.events.emit('campaignReward', { id: 'skillPoint' });
    expect(t.sys.state.isUnlocked('emp')).toBe(true);
    expect(t.progress.gadgets.unlocked).toEqual(['emp']);
    expect(log).toEqual(['emp']);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.sys.equip('emp')).toBe(true);
  });
  it('a partner system unlocks too but never announces or writes', () => {
    const t = setupSys({ secondary: true });
    const log = [];
    t.events.on('gadgetUnlocked', ({ id }) => log.push(id));
    t.events.emit('campaignReward', { id: 'gadget.decoy' });
    expect(t.sys.state.isUnlocked('decoy')).toBe(true);
    expect(log).toEqual([]);
    expect(t.save).not.toHaveBeenCalled();
  });
  // [fix1] The new ten come from the campaign's paid rewards (progress.campaign.rewards), not from
  // `finished` (Night One's credits): a finished save with every night's rewards paid.
  it('a finished save has all eighteen, the new ones silently (not written)', () => {
    const t = setupSys({ finished: true, unlocked: GADGET_IDS.filter((id) => id !== 'batarang'), campaign: { rewards: NEW_GADGET_IDS.map((id) => `gadget:${id}`) } });
    for (const id of ALL_GADGET_IDS) expect(t.sys.state.isUnlocked(id), id).toBe(true);
    t.frame();
    expect(t.progress.gadgets.unlocked.some((id) => NEW_GADGET_IDS.includes(id))).toBe(false);
  });
  it('?gadgets=all unlocks all eighteen for the session and never writes', () => {
    const t = setupSys({ devAll: true });
    for (const id of ALL_GADGET_IDS) expect(t.sys.state.isUnlocked(id), id).toBe(true);
    t.sys.setLoadout(DEFAULT_LOADOUT);
    t.events.emit('campaignReward', { id: 'gadget.emp' });
    expect(t.save).not.toHaveBeenCalled();
    expect(t.progress.gadgets.loadout).toBeUndefined();
  });
  it('the wheel turns its page with the fire key and equips from page 2', () => {
    const t = setupSys({ unlocked: ['gel', 'sonic'] });
    t.input.hold('gadgetWheel'); t.frame();
    expect(t.sys.page).toBe(0);
    t.input.tap('batarang'); t.frame();
    expect(t.sys.page).toBe(1);
    expect(t.wheelUi.setPage).toHaveBeenLastCalledWith(DEFAULT_LOADOUT[1], 1, 2, 'R');
    t.input.key('Digit2'); t.frame();
    t.input.letGo('gadgetWheel'); t.frame();
    expect(t.sys.state.equipped).toBe('sonic');
    // Q turns it back; the wheel reopens on the equipped gadget's page.
    t.input.hold('gadgetWheel'); t.frame();
    expect(t.sys.page).toBe(1);
    t.input.key('KeyQ'); t.frame();
    expect(t.sys.page).toBe(0);
  });
  it('with nothing new unlocked the wheel never turns (Night One is unchanged)', () => {
    const t = setupSys({ unlocked: ['gel'] });
    t.input.hold('gadgetWheel'); t.frame();
    t.input.tap('batarang'); t.frame();
    expect(t.sys.page).toBe(0);
    expect(t.wheelUi.setPage).toHaveBeenLastCalledWith(DEFAULT_LOADOUT[0], 0, 1, 'R');
  });
  it('setLoadout saves a sanitized loadout and the partner follows it', () => {
    const t = setupSys({ unlocked: ['gel'] });
    const l = DEFAULT_LOADOUT.map((p) => [...p]);
    swapSlots(l, { page: 0, slot: 2 }, { page: 1, slot: 7 });
    t.sys.setLoadout(l);
    expect(t.progress.gadgets.loadout[1][7]).toBe('gel');
    expect(t.save).toHaveBeenCalled();
  });
});

// ---- handlers against a fake sys ----
function goon(type = 'grunt', z = 8, extra = {}) {
  const e = {
    id: `${type}${z}`, type, def: { ...ENEMY[type] }, pos: new THREE.Vector3(0, 0, z), alive: true, aware: true, down: false, air: false, state: 'engage',
    charged: !!ENEMY[type].shock, weapon: ENEMY[type].shock ? 'baton' : null, calls: [],
    lose(s, from) { this.calls.push(['lose', s]); this.lostFrom = from; },
    dazzle(s) { this.calls.push(['dazzle', s]); this.stunned = true; return false; },
    tie(list, s) { this.calls.push(['tie', s]); this.state = 'tied'; this.down = true; return false; },
    yank(to) { this.calls.push(['yank']); this.down = true; this.state = 'down'; return false; },
    ...extra,
  };
  return e;
}
function fakeSys(enemies, { effects = {}, hero = {}, input = null } = {}) {
  const events = createEvents();
  const log = [];
  for (const n of ['mapMark', 'mapUnmark', 'gadgetHit', 'disruptorJam', 'sonicStun', 'hackDone', 'hackFail', 'shockStrike', 'glueBurst', 'trackerTag', 'droneMark', 'bolasWrap', 'empPulse', 'decoyShot', 'gadgetUse', 'hint']) {
    events.on(n, (d) => log.push([n, d]));
  }
  const api = {
    canSee: () => true, faceTo() {}, director: { release() {} }, inputDir: () => ({ x: 0, z: 1 }),
    landHit: vi.fn(() => ({ outcome: 'stun' })), jam: vi.fn(() => true),
  };
  const state = createGadgetState({ unlocked: ALL_GADGET_IDS, tune: { ...BASE_EFFECTS, ...effects } });
  const sys = {
    hero: { pos: new THREE.Vector3(), state: 'ground', grounded: true, control: null, dead: false, bat: { yaw: 0 }, ...hero },
    combat: { enemies, consumeInput() {} }, api, events, effects: { ...BASE_EFFECTS, ...effects }, state, input,
    follow: { lookDir: (o) => o.set(0, 0, 1), forward: (o) => o.set(0, 0, 1), right: (o) => o.set(-1, 0, 0) },
    collision: { raycast: () => null, groundBelow: () => 0 }, time: createTimeControl(), gfx: {}, stealth: { noise: vi.fn() },
    player: 0, who: null, hint: (id) => log.push(['hint', id]), pose() {}, wheelOpen: false,
    cameraFocus: null, cameraMode: null,
  };
  return { sys, log, api, events };
}
const run = (h, sys, secs, ctx = {}) => { for (let t = 0; t < secs; t += 0.05) h.update(sys, 0.05, 0.05, ctx); };

describe('disruptor', () => {
  it('jams a gunman or a baton through gadgetApi.jam, then lets go', () => {
    const rifle = goon('rifle', 10), grunt = goon('grunt', 6);
    const { sys, log, api } = fakeSys([grunt, rifle]);
    const h = HANDLER_FACTORIES.disruptor();
    expect(h.fire(sys, {})).toBe(true);
    expect(api.jam).toHaveBeenCalledWith(rifle, 10);
    expect(log.some(([n, d]) => n === 'disruptorJam' && d.weapon === 'gun')).toBe(true);
    run(h, sys, 10.2);
    expect(api.jam).toHaveBeenLastCalledWith(rifle, 0);
  });
  it('has nothing to say to an unarmed goon', () => {
    const { sys, log } = fakeSys([goon('grunt', 6)]);
    expect(HANDLER_FACTORIES.disruptor().fire(sys, {})).toBe(false);
    expect(log).toContainEqual(['hint', 'disruptor-none']);
  });
});

describe('combat gadgetApi.jam', () => {
  function harness() {
    const hero = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'ground', grounded: true, dead: false, invulnerable: 0, health: 100, maxHealth: 100, control: null,
      bat: { yaw: 0, face() {}, animator: { play() {} } }, heightAboveGround: () => 0, collision: { raycast: () => null, resolveCylinder: (p) => ({ groundY: p.y }), groundBelow: () => 0 } };
    const follow = { forward: (o) => o.set(0, 0, 1), right: (o) => o.set(-1, 0, 0), addShake() {}, hitKick() {}, actionShot() {} };
    const events = { emit() {}, on() {} };
    return createCombat({ hero, follow, time: { hitStop() {}, slowMo() {} }, events, rng: createRng(1), getDifficulty: () => 'normal' });
  }
  it('a gun stops aiming and backs off; a baton loses its charge until the jam ends', () => {
    const combat = harness();
    const rifle = { id: 'r', alive: true, def: ENEMY.rifle, state: 'windup', glyph: 'red', backoffT: 0 };
    expect(combat.gadgetApi.jam(rifle, 5)).toBe(true);
    expect(rifle.state).toBe('engage');
    expect(rifle.backoffT).toBe(5);
    const baton = { id: 'b', alive: true, def: ENEMY.baton, charged: true, weapon: 'baton', state: 'engage' };
    expect(combat.gadgetApi.jam(baton, 5)).toBe(true);
    expect(baton.charged).toBe(false);
    combat.gadgetApi.jam(baton, 0);
    expect(baton.charged).toBe(true);
    expect(combat.gadgetApi.jam({ id: 'g', alive: true, def: ENEMY.grunt }, 5)).toBe(false);
    expect(combat.gadgetApi.jam({ id: 'j', alive: true, def: ENEMY.joker }, 5)).toBe(false);
  });
});

describe('sonic batarang', () => {
  it('lures goons in reach to where it lands, and with Sonic Stun a second press stuns', () => {
    const near = goon('grunt', 10), far = goon('grunt', 60);
    const { sys, log } = fakeSys([near, far], { effects: { sonicStun: true } });
    const h = HANDLER_FACTORIES.sonic();
    h.fire(sys, {});
    expect(log.some(([n, d]) => n === 'gadgetUse' && d.id === 'sonic')).toBe(true);
    run(h, sys, 0.5);
    expect(h.live).toBe(true);
    expect(near.calls[0][0]).toBe('lose');
    expect(far.calls).toEqual([]);
    expect(sys.stealth.noise).toHaveBeenCalled();
    // The lure sits ahead of Batman (aimPoint falls back to the ground 12 m ahead).
    near.pos.set(0, 0, 12);
    h.fire(sys, {});
    expect(near.calls.some(([k]) => k === 'dazzle')).toBe(true);
    expect(log.some(([n]) => n === 'sonicStun')).toBe(true);
  });
  it('without the skill a second press is just the cooldown', () => {
    const { sys, log } = fakeSys([]);
    const h = HANDLER_FACTORIES.sonic();
    h.fire(sys, {}); run(h, sys, 0.5);
    h.fire(sys, {});
    expect(log).toContainEqual(['hint', 'gadget-cooldown']);
  });
});

describe('hacking', () => {
  it('the window scales with effects.hackWindow and the assist setting', () => {
    expect(createHackRound({}).width).toBeCloseTo(HACK.width);
    expect(createHackRound({ hackWindow: 1.5 }).width).toBeCloseTo(HACK.width * 1.5);
    expect(createHackRound({ assist: 'slow' }).width).toBeCloseTo(HACK.width * 1.25);
    const auto = createHackRound({ assist: 'auto' });
    let r = null;
    for (let i = 0; i < 100 && !r; i++) r = auto.tick(0.05);
    expect(r).toBe('win');
  });
  it('two presses in the window win; a press outside loses; time runs out', () => {
    const r = createHackRound({ rng: () => 0.5 });
    while (!r.inside()) r.tick(0.01);
    expect(r.press()).toBe(null);
    while (!r.inside()) r.tick(0.01);
    expect(r.press()).toBe('win');
    const l = createHackRound({ rng: () => 0.9 });
    l.tick(0.01);
    expect(l.press()).toBe('lose');
    const t = createHackRound({});
    expect(t.tick(HACK.limit + 0.1)).toBe('lose');
  });
  it('cracking a radio sends the squad off and marks it on the map', () => {
    configureGadgets({ getSettings: () => ({ access: { qteAssist: 'auto' } }) });
    const a = goon('lieutenant', 8), b = goon('grunt', 12), c = goon('grunt', 40);
    const { sys, log } = fakeSys([a, b, c]);
    const h = HANDLER_FACTORIES.hack({ rng: () => 0.5 });
    expect(h.fire(sys, {})).toBe(true);
    expect(h.active).toBe(true);
    expect(sys.time.held).toBeCloseTo(0.35);
    run(h, sys, 2.5, { input: { pressed: () => false } });
    expect(h.active).toBe(false);
    expect(sys.time.held).toBe(1);
    expect(a.calls[0][0]).toBe('lose');
    expect(b.calls[0][0]).toBe('lose');
    expect(c.calls).toEqual([]);
    const marks = log.filter(([n]) => n === 'mapMark').map(([, d]) => d);
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ kind: 'hack', player: 0, ttl: 12 });
    expect(log.some(([n, d]) => n === 'hackDone' && d.kind === 'radio' && d.count === 2)).toBe(true);
    configureGadgets({ getSettings: () => null });
  });
  it('a registered hack target wins over a goon', () => {
    configureGadgets({ getSettings: () => ({ access: { qteAssist: 'auto' } }) });
    const onHack = vi.fn();
    const off = registerHackTarget({ id: 'door1', kind: 'door', label: 'Warehouse door', pos: { x: 0, y: 1.4, z: 6 }, onHack });
    const { sys, log } = fakeSys([goon('grunt', 8)]);
    const h = HANDLER_FACTORIES.hack();
    h.fire(sys, {});
    run(h, sys, 2.5, { input: { pressed: () => false } });
    expect(onHack).toHaveBeenCalledTimes(1);
    expect(log.some(([n, d]) => n === 'hackDone' && d.kind === 'door')).toBe(true);
    off();
    configureGadgets({ getSettings: () => null });
  });
  it('nothing in range: a hint, no cooldown spent', () => {
    const { sys, log } = fakeSys([goon('grunt', 30)]);
    const h = HANDLER_FACTORIES.hack();
    expect(h.fire(sys, {})).toBe(false);
    expect(log).toContainEqual(['hint', 'hack-none']);
    expect(sys.state.ready('hack')).toBe(true);
  });
});

describe('shock gloves', () => {
  it('charge at effects.shockChargeRate, then turn a stopped bare-handed blow into an electrified strike', () => {
    const shield = goon('shield', 1.5);
    const { sys, log, api, events } = fakeSys([shield], { effects: { shockChargeRate: 2 } });
    const h = HANDLER_FACTORIES.shock();
    h.fire(sys);
    expect(h.mode).toBe('charging');
    run(h, sys, 0.9);
    expect(h.mode).toBe('charging');
    run(h, sys, 0.2);
    expect(h.mode).toBe('live');
    events.emit('impact', { move: 'punch', outcome: 'blocked', target: shield });
    // A gadget's own hit, or a blow that landed anyway, is not converted.
    events.emit('impact', { move: 'disarm', outcome: 'stun', target: shield });
    h.update(sys, 0.016, 0.016);
    expect(api.landHit).toHaveBeenCalledTimes(1);
    expect(api.landHit).toHaveBeenCalledWith('disarm', shield, { power: 1.4 });
    expect(log.some(([n]) => n === 'shockStrike')).toBe(true);
    expect(h.strikes).toBe(4);
  });
  it('a heavy is stunned as well', () => {
    const heavy = goon('heavy', 1.5);
    const { sys, events } = fakeSys([heavy]);
    const h = HANDLER_FACTORIES.shock();
    h.fire(sys); run(h, sys, 2.1);
    events.emit('impact', { move: 'punch', outcome: 'chip', target: heavy });
    h.update(sys, 0.016, 0.016);
    expect(heavy.calls).toContainEqual(['dazzle', 2]);
  });
});

describe('glue grenade', () => {
  it('pins goons in effects.glueRadius; heavies only stagger', () => {
    const a = goon('ninja', 12), b = goon('heavy', 13), c = goon('grunt', 20);
    const { sys, log } = fakeSys([a, b, c], { effects: { glueRadius: 3 } });
    const h = HANDLER_FACTORIES.glue();
    h.fire(sys);
    run(h, sys, 0.5);
    expect(a.calls[0]).toEqual(['tie', 6]);
    expect(b.calls[0]).toEqual(['dazzle', 1.5]);
    expect(c.calls).toEqual([]);
    expect(log.find(([n]) => n === 'glueBurst')[1].count).toBe(2);
    expect(h.pinned).toHaveLength(1);
  });
});

describe('tracker dart', () => {
  it('tags up to effects.trackerTags, then drops the oldest; a KO unmarks', () => {
    const a = goon('grunt', 8), b = goon('grunt', 10);
    const { sys, log } = fakeSys([a, b], { effects: { trackerTags: 1 } });
    const h = HANDLER_FACTORIES.tracker();
    h.fire(sys, {});
    const m1 = log.find(([n]) => n === 'mapMark')[1];
    expect(m1).toMatchObject({ kind: 'tracker', target: a, ttl: 90, player: 0 });
    expect(m1.pos).toBe(a.pos);
    h.fire(sys, {});
    expect(log.filter(([n]) => n === 'mapUnmark').map(([, d]) => d.id)).toEqual([m1.id]);
    expect(h.tags[0].target).toBe(b);
    b.alive = false;
    run(h, sys, 0.6);
    expect(h.tags).toHaveLength(0);
  });
  it('tags a street car when no goon is in the sights', () => {
    const car = { group: { position: new THREE.Vector3(0, 0, 15) } };
    configureGadgets({ getVehicles: () => [car] });
    const { sys, log } = fakeSys([]);
    HANDLER_FACTORIES.tracker().fire(sys, {});
    expect(log.find(([n]) => n === 'mapMark')[1]).toMatchObject({ kind: 'tracker', target: car, pos: car.group.position });
    configureGadgets({ getVehicles: () => null });
  });
});

describe('scout drone', () => {
  it('flies for effects.droneTime with the move input and marks the goons it sees', () => {
    const near = goon('grunt', 20), far = goon('grunt', 80);
    const input = { move: { x: 0, y: 1 }, pressed: () => false };
    const { sys, log } = fakeSys([near, far], { effects: { droneTime: 3 } });
    const h = HANDLER_FACTORIES.drone();
    expect(h.fire(sys)).toBe(true);
    expect(sys.hero.control.name).toBe('droneSteer');
    expect(sys.cameraFocus).toBe(h.position);
    run(h, sys, 1.5, { input });
    expect(h.position.z).toBeGreaterThan(8);
    expect(log.filter(([n]) => n === 'mapMark').map(([, d]) => d.target)).toEqual([near]);
    expect(log.find(([n]) => n === 'mapMark')[1].kind).toBe('drone');
    run(h, sys, 2, { input });
    expect(h.flying).toBe(false);
    expect(sys.cameraFocus).toBe(null);
  });
});

describe('bolas', () => {
  it('drops the goon on the spot, runners first; heavies stagger', () => {
    const grunt = goon('grunt', 8), ninja = goon('ninja', 9), heavy = goon('heavy', 10);
    const { sys } = fakeSys([grunt, ninja, heavy], { effects: { bolasTargets: 1 } });
    const h = HANDLER_FACTORIES.bolas();
    h.fire(sys, {});
    run(h, sys, 0.3);
    expect(ninja.calls).toEqual([['yank']]);
    expect(grunt.calls).toEqual([]);
    sys.effects.bolasTargets = 2;
    h.fire(sys, {});
    run(h, sys, 0.3);
    expect(grunt.calls).toEqual([['yank']]);
    expect(heavy.calls).toEqual([['dazzle', 1.2]]);
  });
});

describe('EMP mine', () => {
  it('arms, waits for a goon to step close, then jams and jolts everyone in effects.empRadius', () => {
    const rifle = goon('rifle', 5), baton = goon('baton', 5.5);
    const { sys, log, api } = fakeSys([rifle, baton], { effects: { empRadius: 6 } });
    const h = HANDLER_FACTORIES.emp();
    h.fire(sys);
    run(h, sys, 1.5);
    expect(api.jam).not.toHaveBeenCalled();
    rifle.pos.set(0, 0, 2);
    run(h, sys, 0.1);
    expect(api.jam).toHaveBeenCalledWith(rifle, 6);
    expect(api.jam).toHaveBeenCalledWith(baton, 6);
    expect(log.find(([n]) => n === 'empPulse')[1]).toMatchObject({ radius: 6, count: 2 });
    run(h, sys, 6.2);
    expect(api.jam).toHaveBeenCalledWith(baton, 0);
  });
});

describe('decoy hologram', () => {
  it('draws goons in reach for effects.decoyTime and gunmen shoot at it', () => {
    const rifle = goon('rifle', 10), grunt = goon('grunt', 6), far = goon('grunt', 80);
    const { sys, log } = fakeSys([rifle, grunt, far], { effects: { decoyTime: 3 } });
    const h = HANDLER_FACTORIES.decoy();
    h.fire(sys);
    expect(h.position.z).toBeCloseTo(4);
    run(h, sys, 1.3);
    expect(grunt.calls[0][0]).toBe('lose');
    expect(far.calls).toEqual([]);
    expect(log.some(([n, d]) => n === 'decoyShot' && d.target === rifle)).toBe(true);
    run(h, sys, 2);
    expect(h.live).toBe(false);
  });
});

describe('player-scoped events', () => {
  it("a partner's gadget events carry the partner", () => {
    const { sys, events } = fakeSys([goon('grunt', 8)]);
    const partner = { id: 1, hero: sys.hero };
    sys.who = partner;
    sys.emit = (n, d) => { Object.defineProperty(d, 'player', { value: partner, enumerable: false }); events.emit(n, d); };
    let got = null;
    events.on('mapMark', (d) => { got = d; });
    HANDLER_FACTORIES.tracker().fire(sys, {});
    expect(got.player).toBe(1);
    expect(got.id).toMatch(/^tracker:1:/);
  });
});
