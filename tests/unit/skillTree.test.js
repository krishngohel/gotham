import { describe, it, expect, vi, afterEach } from 'vitest';
import { NODES, NODE_IDS, BRANCHES, BRANCH_IDS, OP_IDS, nodeById, treeEffects, nodeCheck, nodeStatus, xpSpent, closeOwned, layout, applyOps } from '../../src/progress/skillTree.js';
import { BASE_EFFECTS, TREES, UPGRADE_IDS, LEGACY_APPLY, upgradeEffects, damageFactor } from '../../src/progress/upgrades.js';
import { sanitizeWayneSave, sanitizeSkills } from '../../src/progress/wayneSave.js';
import { createWayneTech, migrateSkills } from '../../src/progress/wayneTech.js';
import { setStandingProvider, setDevStanding, actOf, setActProvider } from '../../src/progress/standing.js';
import { sanitizeProgress } from '../../src/core/save.js';
import { levelOf, pointsEarned, xpForLevel, levelStart, legacyBonus, toNext } from '../../src/progress/xp.js';
import { HEROES } from '../../src/heroes/roster.js';
import { createEvents } from '../../src/core/events.js';

// A save written by the game before wave 3 (gotham-progress-v1 as it was): 4 trees x 5 upgrades,
// 1,000 XP a point. 14,250 XP = 14 points under the old curve, 13 spent.
const OLD_SAVE = {
  step: 61, stepId: 'freeRoam', trophies: [0, 1, 2, 3], suit: 'm', goldUnlocked: false, seenIntro: true, finished: true,
  challenges: { neonSlalom: { best: 41.2, medal: 'silver' } },
  stats: { playTime: 7300, kos: 412, longestCombo: 31, topGlideSpeed: 52, distanceGlided: 9100, photos: 3 },
  crimes: { stopped: 12 }, moves: [], districts: ['docks', 'neon'], milestone: 50, unlocks: [],
  gadgets: { equipped: 'claw', unlocked: ['remote', 'gel', 'smoke', 'launcher', 'claw', 'freeze', 'flashbang'], broken: [], caches: [], wheelUsed: true },
  wayne: {
    xp: 14250,
    owned: ['plating1', 'kevlar', 'plating2', 'medic', 'reflexes', 'flow', 'efficient', 'triple', 'bigBang', 'quickSmoke', 'accelerator', 'aero', 'grip'],
    medals: { neonSlalom: 'silver' },
  },
};

afterEach(() => { setStandingProvider(null); setDevStanding(0); setActProvider(null); });

describe('tree data', () => {
  it('ids are unique, every prerequisite exists and comes from the same branch', () => {
    expect(new Set(NODE_IDS).size).toBe(NODE_IDS.length);
    for (const node of NODES) {
      expect(BRANCH_IDS).toContain(node.branch);
      for (const r of node.requires) {
        expect(nodeById(r), `${node.id} needs ${r}`).toBeTruthy();
        expect(nodeById(r).branch).toBe(node.branch);
      }
      expect(node.act).toBeGreaterThanOrEqual(1);
      expect(node.act).toBeLessThanOrEqual(5);
      expect(node.cost).toBeGreaterThan(0);
      expect(node.text.length).toBeGreaterThan(5);
      expect(node.demo.length).toBeGreaterThan(5);
      expect(node.currency).toBe(node.branch === 'wayne' ? 'standing' : 'xp');
    }
  });
  it('about 56 shared nodes plus small kit branches', () => {
    const shared = NODES.filter((x) => x.branch !== 'kit');
    expect(shared.length).toBeGreaterThanOrEqual(56);
    expect(shared.length).toBeLessThanOrEqual(90);
    const kit = NODES.filter((x) => x.branch === 'kit');
    const heroIds = HEROES.map((h) => h.id);
    for (const node of kit) for (const h of node.heroes) expect(heroIds).toContain(h);
  });
  it('no cycles: closing the full set keeps every node', () => {
    expect(closeOwned(NODE_IDS)).toEqual(NODE_IDS);
  });
  it('every effect op is valid and names a BASE_EFFECTS key of the same type', () => {
    for (const node of NODES) {
      expect(node.effect.length).toBeGreaterThan(0);
      for (const [k, op, v] of node.effect) {
        expect(OP_IDS).toContain(op);
        expect(BASE_EFFECTS, `${node.id}: ${k}`).toHaveProperty(k);
        expect(typeof v).toBe(typeof BASE_EFFECTS[k]);
      }
    }
  });
  it('the 20 original ids are the first five of their branch, linear, act 1, with their old effects', () => {
    for (const t of TREES) {
      const branch = NODES.filter((x) => x.branch === t.id).slice(0, 5);
      expect(branch.map((x) => x.id)).toEqual(t.upgrades.map((u) => u.id));
      branch.forEach((x, i) => {
        expect(x.requires).toEqual(i ? [branch[i - 1].id] : []);
        expect(x.act).toBe(1);
        expect(x.cost).toBe(1);
      });
    }
    // Every subset in tree order gives the numbers the old appliers gave.
    const legacy = (owned) => { const e = { ...BASE_EFFECTS }; for (const id of UPGRADE_IDS) if (owned.includes(id)) LEGACY_APPLY[id](e); return e; };
    for (const id of UPGRADE_IDS) expect(upgradeEffects([id])).toEqual(legacy([id]));
    expect(upgradeEffects(UPGRADE_IDS)).toEqual(legacy(UPGRADE_IDS));
  });
  it('the traversal ids L3 reads are defined', () => {
    for (const id of ['grappleRange1', 'grappleRange2', 'grappleBoost', 'glideReGrapple', 'grapplePull', 'wingsuit1', 'wingsuit2', 'wingsuit3']) {
      expect(nodeById(id)?.branch).toBe('traversal');
    }
    const e = upgradeEffects(['accelerator', 'grappleRange1', 'grappleBoost', 'grappleRange2', 'aero', 'wingsuit1', 'wingsuit2']);
    expect(e).toMatchObject({ grappleRange: 1.5, grappleReel: 1.4, grappleBoost: true, wingsuit: 2, glideReGrapple: false });
  });
  it('layout gives every node its own cell in its branch', () => {
    const cells = layout();
    expect(cells.length).toBe(NODES.length);
    const keys = cells.map((c) => `${c.branch}:${c.band}:${c.col}:${c.row}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of cells) for (const r of nodeById(c.id).requires) expect(cells.find((x) => x.id === r).col).toBeLessThan(c.col);
  });
});

describe('effects', () => {
  it('kit nodes apply only to their hero', () => {
    expect(treeEffects(['nw.escrimaCharge'], BASE_EFFECTS, {}, { hero: 'nightwing' }).sigCooldownMult).toBeCloseTo(0.8);
    expect(treeEffects(['nw.escrimaCharge'], BASE_EFFECTS, {}, { hero: 'batman' }).sigCooldownMult).toBe(1);
  });
  it('extra ops (suit perks) apply after the tree', () => {
    const e = upgradeEffects(['plating1'], {}, { extra: [['maxHealthBonus', 'add', 5], ['nope', 'add', 1], ['damageMult', 'bogus', 0]] });
    expect(e.maxHealthBonus).toBe(30);
    expect(e).not.toHaveProperty('nope');
    expect(e.damageMult).toBe(1);
  });
  it('resistances stack with armour', () => {
    const e = upgradeEffects(['plating1', 'kevlar', 'insulated', 'fireweave', 'plating2', 'rebreather']);
    expect(damageFactor('cold', e)).toBeCloseTo(0.5);
    expect(damageFactor('fire', e)).toBeCloseTo(0.5);
    expect(damageFactor('gas', e)).toBeCloseTo(0.35);
    expect(damageFactor('punch', e)).toBe(1);
  });
  it('applyOps ignores unknown keys', () => {
    expect(applyOps({ a: 1 }, [['a', 'mul', 3], ['b', 'set', 2]])).toEqual({ a: 3 });
  });
});

describe('buying rules', () => {
  const ctx = (o = {}) => ({ owned: [], xpFree: 5, standing: 0, act: 1, hero: 'batman', ...o });
  it('prerequisites, act gates, points and Standing', () => {
    expect(nodeCheck('plating1', ctx()).ok).toBe(true);
    expect(nodeCheck('kevlar', ctx()).reason).toBe('locked');
    expect(nodeCheck('fireweave', ctx({ owned: ['plating1', 'kevlar'] })).reason).toBe('act');
    expect(nodeCheck('fireweave', ctx({ owned: ['plating1', 'kevlar'], act: 2 })).ok).toBe(true);
    expect(nodeCheck('ironclad', ctx({ owned: ['plating1', 'kevlar', 'plating2'], act: 3, xpFree: 1 })).reason).toBe('points');
    expect(nodeCheck('wayneScholars', ctx()).reason).toBe('standing');
    expect(nodeCheck('wayneScholars', ctx({ standing: 10 })).ok).toBe(true);
    expect(nodeCheck('nw.escrimaCharge', ctx()).reason).toBe('hero');
    expect(nodeStatus('plating1', ctx({ owned: ['plating1'] }))).toBe('owned');
    expect(xpSpent(['plating1', 'ironclad', 'wayneScholars'])).toBe(3);
  });
});

describe('XP curve', () => {
  it('flat 1,000 for ten levels, then +50 a level to 1,400', () => {
    expect([1, 10, 11, 12, 18, 30].map(xpForLevel)).toEqual([1000, 1000, 1050, 1100, 1400, 1400]);
    expect(levelStart(11)).toBe(10000);
    expect(levelStart(12)).toBe(11050);
    for (const x of [0, 999, 1000, 9999, 10000, 11049, 11050, 19799, 19800, 50000, 1e7]) {
      const l = levelOf(x);
      expect(levelStart(l)).toBeLessThanOrEqual(x);
      expect(levelStart(l + 1)).toBeGreaterThan(x);
    }
    expect(toNext(10500)).toEqual({ into: 500, need: 550, fraction: 500 / 1050 });
  });
  it('the old flat curve below 10,000 XP is unchanged (Night One)', () => {
    for (let x = 0; x < 10000; x += 137) expect(pointsEarned(x)).toBe(Math.floor(x / 1000));
  });
  it('legacy bonus makes up the difference above it', () => {
    for (const x of [0, 5000, 10000, 14250, 30000, 1e6]) expect(pointsEarned(x) + legacyBonus(x)).toBe(Math.max(pointsEarned(x), Math.floor(x / 1000)));
  });
});

describe('an old save carries over', () => {
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  function run(progress) {
    const events = createEvents();
    const hero = { health: 100, maxHealth: 100, dead: false };
    const combat = { combo: { value: 0 }, active: false, applyEffects: vi.fn() };
    const effects = upgradeEffects(progress.wayne.owned);
    const save = vi.fn();
    const w = createWayneTech({ events, progress, save, hero, combat, hud: { setHealth() {}, card() {} }, effects, baseHealth: () => 100 });
    return { w, save, events, hero, effects };
  }
  it('owned upgrades, XP and free points survive load + migration', () => {
    const st = memory();
    st.setItem('gotham-progress-v1', JSON.stringify(OLD_SAVE));
    const p = sanitizeProgress(JSON.parse(st.getItem('gotham-progress-v1')));
    expect(p.wayne.owned).toEqual(['plating1', 'kevlar', 'plating2', 'medic', 'reflexes', 'flow', 'efficient', 'triple', 'bigBang', 'quickSmoke', 'accelerator', 'aero', 'grip']);
    expect(p.wayne.xp).toBe(14250);
    expect(p.skills).toEqual({ curve: 0, bonusPoints: 0, respecAct: 0, rewards: [] });
    const { w, save } = run(p);
    // 14 points under the old curve, 13 spent: still one to spend.
    expect(w.free).toBe(1);
    expect(p.skills.curve).toBe(2);
    expect(p.skills.bonusPoints).toBe(14 - pointsEarned(14250));
    expect(save).toHaveBeenCalled();
    // Migration runs once.
    expect(migrateSkills(p)).toBe(false);
    expect(run(p).w.free).toBe(1);
  });
  it('a save that spent every flat point keeps every upgrade', () => {
    const wayne = { xp: 20000, owned: [...UPGRADE_IDS], medals: {} };
    const p = sanitizeProgress({ wayne });
    expect(p.wayne.owned).toEqual(UPGRADE_IDS);
    const { w } = run(p);
    expect(w.free).toBe(0);
  });
});

describe('run time', () => {
  function setup({ xp = 0, owned = [], act = 1, hero = 'batman' } = {}) {
    const events = createEvents();
    const progress = sanitizeProgress({ wayne: { xp, owned }, act });
    progress.act = act;
    const h = { health: 100, maxHealth: 100, dead: false, invulnerable: 0 };
    const combat = { combo: { value: 0 }, active: true, applyEffects: vi.fn() };
    const effects = upgradeEffects(progress.wayne.owned);
    const w = createWayneTech({ events, progress, save: vi.fn(), hero: h, combat, hud: { setHealth() {}, card() {} }, effects, baseHealth: () => 100, getHero: () => hero });
    return { events, progress, hero: h, combat, effects, w };
  }
  it('buys a new node and its effect is live', () => {
    const t = setup({ xp: 3000 });
    expect(t.w.buy('reflexes').ok).toBe(true);
    expect(t.w.buy('doubleCounter').ok).toBe(true);
    expect(t.effects.multiCounter).toBe(2);
    expect(t.w.free).toBe(1);
  });
  it('the Wayne branch spends Standing through the provider', () => {
    const t = setup();
    let standing = 8; // [balance] Wayne Scholars costs 6 now (was 10, standing 12)
    setStandingProvider({ getStanding: () => standing, spendStanding: (n) => { if (standing < n) return false; standing -= n; return true; } });
    expect(t.w.buy('wayneScholars').ok).toBe(true);
    expect(standing).toBe(2);
    expect(t.effects.xpMult).toBeCloseTo(1.1);
    t.w.award(100, 'test');
    expect(t.w.xp).toBe(110);
    expect(t.w.buy('alfredAlibis').reason).toBe('standing');
  });
  it('respec refunds XP nodes once per act, Standing stays spent', () => {
    const t = setup({ xp: 3000, owned: ['plating1', 'kevlar'], act: 2 });
    setDevStanding(10);
    t.w.buy('wayneScholars');
    expect(t.w.respec()).toMatchObject({ ok: true, refunded: 2 });
    expect(t.progress.wayne.owned).toEqual(['wayneScholars']);
    expect(t.w.free).toBe(3);
    t.w.buy('plating1');
    expect(t.w.respec().reason).toBe('used');
    t.progress.act = 3;
    expect(t.w.respec().ok).toBe(true);
  });
  it('Second Wind saves a lethal hit once per fight', () => {
    const t = setup({ xp: 9000, owned: ['plating1', 'kevlar', 'plating2', 'medic', 'secondWind'], act: 3 });
    expect(t.effects.secondWind).toBe(1);
    t.hero.health = 0;
    t.events.emit('heroHurt', { damage: 50 });
    expect(t.hero.health).toBe(Math.round(t.hero.maxHealth * 0.25));
    t.hero.health = 0;
    t.events.emit('heroHurt', { damage: 50 });
    expect(t.hero.health).toBe(0);
  });
  it('a skillPoint reward pays once per key', () => {
    const t = setup();
    t.events.emit('campaignReward', { id: 'skillPoint', key: 'act2' });
    t.events.emit('campaignReward', { id: 'skillPoint', key: 'act2' });
    expect(t.w.free).toBe(1);
    expect(sanitizeSkills(t.progress.skills).rewards).toEqual(['skillPoint:act2']);
  });
  it('the tree page lists branches with states', () => {
    const t = setup({ xp: 2000, hero: 'nightwing' });
    const tr = t.w.tree();
    expect(tr.branches.map((b) => b.id)).toEqual([...BRANCH_IDS]);
    expect(tr.branches.find((b) => b.id === 'kit').nodes.map((x) => x.id)).toEqual(['nw.escrimaCharge', 'nw.wallFlip', 'nw.escrimaShock']);
    expect(tr.branches[0].nodes[0]).toMatchObject({ id: 'plating1', state: 'buyable' });
    expect(BRANCHES.length).toBe(9);
  });
});

describe('act provider', () => {
  it('defaults: progress.act, then 5 after the story, else 1', () => {
    expect(actOf({})).toBe(1);
    expect(actOf({ finished: true })).toBe(5);
    expect(actOf({ act: 3, finished: true })).toBe(3);
    setActProvider(() => 2);
    expect(actOf({ finished: true })).toBe(2);
  });
});

describe('sanitizer', () => {
  it('accepts new ids, keeps purchase order cap, drops junk', () => {
    expect(sanitizeWayneSave({ xp: 3000, owned: ['plating1', 'reflexes', 'doubleCounter', 'nope', 'reflexes'] }).owned).toEqual(['plating1', 'reflexes', 'doubleCounter']);
    // 2,000 XP: two points; doubleCounter (last bought) goes.
    expect(sanitizeWayneSave({ xp: 2000, owned: ['plating1', 'reflexes', 'doubleCounter'] }).owned).toEqual(['plating1', 'reflexes']);
    // Standing nodes don't count against XP.
    expect(sanitizeWayneSave({ xp: 0, owned: ['wayneScholars'] }).owned).toEqual(['wayneScholars']);
    expect(sanitizeSkills({ curve: 2, bonusPoints: -3, respecAct: 1.5, rewards: ['ok', 7, '<x>'] })).toEqual({ curve: 2, bonusPoints: 0, respecAct: 0, rewards: ['ok'] });
  });
});
