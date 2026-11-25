// [story2] The double life inside the nights (src/story/lifeSteps.js), the endings, the Gazette, and
// saving/resuming anywhere in Acts IV and V.
import { describe, it, expect, vi } from 'vitest';
import { lifeTest, endingFor, createLifeSteps, LOCK_ACTIONS } from '../../src/story/lifeSteps.js';
import { createDoubleLife } from '../../src/bruce/doubleLife.js';
import { storyHeadlines, NIGHT_HEADLINES } from '../../src/story/headlines.js';
import { VILLAIN_FILES } from '../../src/story/villainFiles.js';
import { OVERHEARD, GANG_IDLE } from '../../src/story/storyBarks.js';
import { stepsOf, nightById, allNights } from '../../src/story/campaign.js';
import { sanitizeCampaign, applyStartParams } from '../../src/story/campaignSave.js';
import '../../src/story/nights/index.js';
import { STEPS } from '../../src/game/story.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

function kit({ heroes = [{ pos: { x: 0, y: 0, z: 0 } }], players = null, life = createDoubleLife(), opening = null } = {}) {
  const camp = { choices: {} };
  const done = vi.fn();
  const cards = [];
  const ctx = {
    markers: { place: () => ({}), release() {}, color() {}, flash() {} },
    hud: { card: (t, x) => cards.push([t, x]), setObjective() {} },
    radio: { say: vi.fn(() => Promise.resolve()), playing: false },
    events: { emit: vi.fn(), on() {} },
    standing: () => heroes,
    site: (p) => p,
    theGame: () => ({ bruce: { life, ui: null, state: { identity: 'batman' } }, state: {} }),
    players: () => players ?? heroes.map((h, i) => ({ id: `p${i}`, hero: h, input: null })),
    camp: () => camp, nightId: () => 'n6', opening: () => opening, replaying: () => false,
    hero: heroes[0], ui: { timer() {} },
    done,
  };
  return { ctx, camp, done, life, cards, L: createLifeSteps(ctx) };
}

describe('life tests and endings', () => {
  it('branches on how the night started and on saved choices', () => {
    expect(lifeTest('backup', { opening: { backup: false } })).toBe(false);
    expect(lifeTest('backup', { opening: null })).toBe(true);
    expect(lifeTest('tail', { opening: { tail: true } })).toBe(true);
    expect(lifeTest('tired', { opening: { staminaRegenK: 0.55 } })).toBe(true);
    expect(lifeTest('choice:n6.party=batman', { choices: { 'n6.party': 'batman' } })).toBe(true);
    expect(lifeTest('choice:n6.party=batman', { choices: { 'n6.party': 'bruce' } })).toBe(false);
    expect(lifeTest('thread:alfred>=3', { life: { threads: { alfred: 3 } } })).toBe(true);
  });
  it('four endings come from who is still standing with Bruce', () => {
    expect(endingFor(createDoubleLife({ threads: { alfred: 4, ward: 3, love: 3, gordon: 2, lucius: 2, reporter: 0, detective: 0 } }))).toBe('family');
    expect(endingFor(createDoubleLife({ threads: { alfred: 3, ward: 1, love: 0, gordon: 4, lucius: 3, reporter: 0, detective: 0 }, standing: 40 }))).toBe('partners');
    expect(endingFor(createDoubleLife({ suspicion: { reporter: 10, detective: 90, villain: 0 } }))).toBe('exposed');
    expect(endingFor(createDoubleLife({ flags: { alfredBreak: true } }))).toBe('alone');
    expect(endingFor(null)).toBe('partners');
  });
});

describe('calls, locks, dilemmas', () => {
  it('a call rings mid-step, and silence is an answer: the default is saved and its effects land', () => {
    const { L, camp, life } = kit();
    const step = { id: 's', calls: [{ id: 'cover', after: 1, timeout: 2, default: 'b', prompt: 'p', options: [{ id: 'a', text: 'A', effects: { standing: 5 } }, { id: 'b', text: 'B', effects: { standing: -5 } }] }] };
    const before = life.standing;
    L.calls.enter(step);
    for (let t = 0; t < 40; t++) L.calls.update(0.1);
    expect(camp.choices['n6.cover']).toBe('b');
    expect(life.standing).toBeLessThan(before);
    // Answered once: a replayed step does not ring again.
    L.calls.enter(step);
    expect(L.calls.debugRing()).toBe(null);
  });
  it('locks switch actions off for every player and restore them after', () => {
    const inp = { pressed: () => true, down: () => true };
    const { L } = kit({ players: [{ id: 'p0', hero: { pos: { x: 0, y: 0, z: 0 } }, input: inp }] });
    L.locks.enter({ locks: ['detective', 'grapple'] });
    expect(inp.pressed('detective')).toBe(false);
    expect(inp.down('grapple')).toBe(false);
    expect(inp.pressed('punch')).toBe(true);
    L.locks.exit();
    expect(inp.pressed('detective')).toBe(true);
    expect(LOCK_ACTIONS.gadgets).toContain('batarang');
  });
  it('a dilemma: reaching Batman\'s side picks it, and the missed Bruce side costs Standing', () => {
    const hero = { pos: { x: 100, y: 0, z: 0 } };
    const { L, camp, done, life } = kit({ heroes: [hero] });
    const s = { id: 'd', key: 'n6.party', timer: 30, bruce: { site: { x: 0, y: 0, z: 0 }, miss: { effects: { standing: -6 } } }, batman: { site: { x: 100, y: 0, z: 0 }, miss: { effects: { city: -3 } } }, branches: { bruce: 'x', batman: 'y' } };
    const st = life.standing;
    L.types.dilemma.enter(s);
    L.types.dilemma.update(0.1, s);
    expect(camp.choices['n6.party']).toBe('batman');
    expect(done).toHaveBeenCalledWith(s, 'batman');
    expect(life.standing).toBeLessThan(st);
  });
  it('a dilemma in co-op: two players at the two places cover both', () => {
    const a = { pos: { x: 0, y: 0, z: 0 } }, b = { pos: { x: 100, y: 0, z: 0 } };
    const { L, done } = kit({ heroes: [a, b] });
    const s = { id: 'd', key: 'k', bruce: { site: { x: 0, y: 0, z: 0 } }, batman: { site: { x: 100, y: 0, z: 0 } }, both: { effects: {} }, branches: { bruce: 'x', batman: 'y', both: 'z' } };
    L.types.dilemma.enter(s);
    L.types.dilemma.update(0.1, s);
    expect(done).toHaveBeenCalledWith(s, 'both');
  });
  it('time running out on a dilemma goes to the Batman side and misses Bruce\'s', () => {
    const { L, done } = kit({ heroes: [{ pos: { x: 500, y: 0, z: 500 } }] });
    const s = { id: 'd', key: 'k', timer: 1, bruce: { site: { x: 0, y: 0, z: 0 } }, batman: { site: { x: 100, y: 0, z: 0 } }, branches: { bruce: 'x', batman: 'y' } };
    L.types.dilemma.enter(s);
    for (let t = 0; t < 15; t++) L.types.dilemma.update(0.1, s);
    expect(done).toHaveBeenCalledWith(s, 'batman');
  });
});

describe('the writing', () => {
  it('every night has a front page, every rogue a file, every gang its chatter; no dashes anywhere', () => {
    for (const n of allNights()) expect(NIGHT_HEADLINES[n.id], n.id).toBeDefined();
    for (const n of allNights().filter((x) => x.id !== 'n1')) {
      const convos = n.overheard ?? OVERHEARD[n.id];
      expect(convos?.length, `${n.id} overheard`).toBeGreaterThanOrEqual(3);
      for (const c of convos) for (const [, t] of c) expect(t).not.toMatch(DASH);
      expect(GANG_IDLE[n.gang], n.gang).toBeDefined();
    }
    for (const v of VILLAIN_FILES) { expect(nightById(v.night), v.id).toBeTruthy(); for (const k of ['summary', 'notes', 'skill', 'weakness']) expect(v[k]).not.toMatch(DASH); }
    for (const list of Object.values(NIGHT_HEADLINES)) for (const h of list) { expect(h.head).not.toMatch(DASH); expect(h.sub).not.toMatch(DASH); }
  });
  it('the Gazette reports what you chose', () => {
    const hs = storyHeadlines({ nightsDone: ['n1', 'n2', 'n3'], choices: { 'n3.gala': 'batman' } });
    expect(hs.some((h) => /NO-SHOW/.test(h.head))).toBe(true);
    expect(storyHeadlines({}).length).toBeGreaterThan(0);
  });
});

describe('save and resume anywhere in Acts IV and V', () => {
  for (const id of ['n6', 'n7', 'n8', 'n9']) {
    it(`${id}: every step is a resume point, and a boss resumes at its phase`, () => {
      for (const s of stepsOf(id)) {
        const p = applyStartParams({ campaign: sanitizeCampaign({}) }, new URLSearchParams(`night=${id}&at=${s.id}`), { nightSteps: stepsOf, nightOneSteps: STEPS });
        expect(p.campaign.night).toBe(id);
        expect(p.campaign.stepId, s.id).toBe(s.id);
        const back = sanitizeCampaign(JSON.parse(JSON.stringify(p.campaign)));
        expect(stepsOf(id).findIndex((x) => x.id === back.stepId)).toBeGreaterThanOrEqual(0);
      }
      const boss = stepsOf(id).find((s) => s.type === 'boss');
      expect(sanitizeCampaign({ night: id, stepId: boss.id, boss: { id: boss.boss, phase: 2 } }).boss).toEqual({ id: boss.boss, phase: 2 });
    });
  }
});
