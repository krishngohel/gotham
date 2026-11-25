// WayneTech at run time: XP from play (fights, takedowns, chains, trophies, medals, crimes,
// caches, and Part H's crates and side missions), a level and an upgrade point every 1,000 XP,
// buying upgrades, and applying their effects through the one effects object that combat, the
// hero and the gadgets read. Also health recovery out of combat (Field Medic speeds it up).
import { XP, comboXp, chainXp, medalXp, levelOf, pointsFree, toNext, levelsCrossed, createComboRun, legacyBonus } from './xp.js';
import { TREES, UPGRADE_IDS, upgradeEffects, regenStep } from './upgrades.js';
import { creditsOwner } from '../players/coopRules.js';
// [prog] Wave 3: the branching skill tree (src/progress/skillTree.js), Standing for the Wayne
// branch (./standing.js), act gates, respec, campaign rewards and Second Wind.
import { BRANCHES, NODES, nodeById, nodeCheck, nodeStatus, xpSpent, layout, forHero } from './skillTree.js';
import { getStanding, spendStanding, actOf } from './standing.js';
import { sanitizeSkills } from './wayneSave.js';
import { gearOps } from './storyLocker.js'; // [verify] story gear rides on the effects

const LAYOUT = layout();
const CELL = new Map(LAYOUT.map((c) => [c.id, c]));

// Moves an old save onto the wave 3 curve once: the points the flat curve gave it and the new one
// does not become bonus points, so nobody loses a point (tests/unit/skillTree.test.js). Pure.
export function migrateSkills(progress) {
  const sk = progress.skills ?? (progress.skills = sanitizeSkills({}));
  if (sk.curve === 2) return false;
  sk.bonusPoints += legacyBonus(progress.wayne.xp);
  sk.curve = 2;
  return true;
}

// Events that pay a flat XP amount (the XP table key is the event name).
const FLAT = ['ko', 'takedown', 'special', 'fightDone', 'objectiveDone', 'trophy', 'crimeStopped', 'glassBroken', 'wallBroken', 'crateOpened', 'missionDone', 'vanChaseStopped'];

// [verify] The double life's tiredness factor on a hero (1 = rested), clamped to a sane range.
export const staminaRegenScale = (h) => { const k = Number(h?.staminaRegenK); return Number.isFinite(k) ? Math.min(1, Math.max(0.25, k)) : 1; };

export function createWayneTech({ events, progress, save, hero, combat, hud, effects, baseHealth, dev = false,
  // [prog] which hero player 0 plays (kit branches), extra effect ops (suit perks), the act
  getHero = () => null, extraOps = () => null, getAct = () => actOf(progress) }) {
  // A dev run (?gadgets=all) still earns XP, levels and purchases for the session so testing
  // works, but never touches the real save: it works on its own copy, never the passed-in
  // progress.wayne, so nothing else that later calls save() (crimes, trophies, side content's
  // periodic save) can carry the dev session's XP into the real file.
  const w = dev ? { xp: progress.wayne.xp, owned: [...progress.wayne.owned], medals: { ...progress.wayne.medals } } : progress.wayne;
  const persist = dev ? () => {} : save;
  // [prog] The tree's bookkeeping (progress.skills); a dev run works on a copy, as with `w`.
  if (!dev && migrateSkills(progress)) persist();
  const sk = dev ? (() => { const c = sanitizeSkills(progress.skills); if (c.curve !== 2) c.bonusPoints += legacyBonus(w.xp); return c; })() : progress.skills;
  const spent = () => xpSpent(w.owned);
  const freeNow = () => pointsFree(w.xp, spent(), sk.bonusPoints);
  const run = createComboRun();
  const regenState = { calm: false, sinceHurt: 0 };
  let lastCombo = 0, sinceHurt = 99, dirty = false, saveT = 0, shownHealth = -1;

  function award(amount, source) {
    // [prog] Wayne Scholars (a Standing node): all XP +10%.
    const a = Math.round(amount * (effects.xpMult ?? 1));
    if (!(a > 0)) return;
    const before = w.xp;
    w.xp += a;
    dirty = true;
    events.emit('xp', { amount: a, source, xp: w.xp });
    const levels = levelsCrossed(before, w.xp);
    levels.forEach((level, i) => events.emit('levelUp', { level, points: freeNow() - (levels.length - 1 - i) }));
    if (levels.length) { dirty = false; persist(); }
  }

  // Co-op (src/players/coopRules.js): this save is player 0's. Another player's own KOs, counters,
  // chains and combo hits are theirs; team events and single-player events always count.
  for (const ev of FLAT) events.on(ev, (d) => { if (creditsOwner(ev, d)) award(XP[ev], ev); });
  events.on('counter', (d = {}) => { if (creditsOwner('counter', d)) award(XP.counter * (d.count ?? 1), 'counter'); });
  events.on('chainDone', (d) => { if (creditsOwner('chainDone', d)) award(chainXp(d.count, d.stealth), 'chain'); });
  events.on('swarmDone', (d) => { if (creditsOwner('swarmDone', d)) award(XP.swarmPerGoon * d.count, 'swarm'); });
  events.on('cacheFound', ({ xp }) => award(xp, 'cache'));
  events.on('challengeDone', ({ id, medal }) => {
    const gain = medalXp(w.medals[id] ?? null, medal);
    if (!gain) return;
    w.medals[id] = medal;
    award(gain, 'medal');
  });
  events.on('impact', (d) => { if (d.outcome !== 'parried' && d.outcome !== 'immune' && creditsOwner('impact', d)) run.note(d.move, 0); });
  events.on('heroHurt', () => { sinceHurt = 0; });
  // [prog] Second Wind: combat emits heroHurt before it checks for a knockout, so a hit that would
  // put player 0 down can leave them on a quarter of their health instead, once per fight.
  let windsUsed = 0;
  events.on('heroHurt', (d = {}) => {
    const h = d.player?.hero ?? hero;
    if (h !== hero || h.health > 0 || h.dead || windsUsed >= (effects.secondWind ?? 0)) return;
    windsUsed += 1;
    h.health = Math.max(1, Math.round(h.maxHealth * 0.25));
    h.invulnerable = Math.max(h.invulnerable ?? 0, 1);
    hud.setHealth(h.health / h.maxHealth);
    events.emit('secondWind', {});
  });
  // [prog] Campaign rewards (J1): { id: 'skillPoint', key?, points? } pays free points; a `key`
  // makes it pay once per save however often it fires.
  events.on('campaignReward', (d = {}) => {
    if (d.id !== 'skillPoint') return;
    const tag = d.key ? `skillPoint:${String(d.key).replace(/[^a-zA-Z0-9.-]/g, '').slice(0, 30)}` : null;
    if (tag && sk.rewards.includes(tag)) return;
    if (tag) sk.rewards.push(tag);
    sk.bonusPoints += Math.max(1, Math.min(5, Math.floor(d.points ?? 1)));
    events.emit('levelUp', { level: levelOf(w.xp), points: freeNow(), reward: true });
    persist();
  });
  // [verify] The story's XP (campaignReward { id: 'xp', amount } from ./storyRewards.js: mission and
  // night-end 'xp:N', open-world cases, chains and crimes) and its optional objectives' `xpGain`
  // (src/story/storyRuntime.js optional()) had no listener: neither ever reached the XP bar.
  events.on('campaignReward', (d = {}) => { if (d.id === 'xp') award(Math.min(5000, Number(d.amount) || 0), 'story'); });
  events.on('xpGain', (d = {}) => award(Math.min(5000, Number(d.amount) || 0), 'optional'));
  // [verify] New story gear (campaignReward 'gear.<id>', stored by the bridge): rebuild the effects.
  events.on('campaignReward', (d = {}) => { if (typeof d.id === 'string' && d.id.startsWith('gear.')) apply({ health: false }); });
  const ctx = () => ({ owned: w.owned, xpFree: freeNow(), standing: getStanding(), act: getAct(), hero: getHero() });
  // { health: false } only rebuilds the effects (settings changes: the caller sets health itself).
  function apply({ health = true } = {}) {
    upgradeEffects(w.owned, effects, { hero: getHero(), extra: [...(extraOps() ?? []), ...gearOps(progress)] }); // [verify] + story gear
    combat.applyEffects();
    if (!health) return;
    const max = baseHealth() + effects.maxHealthBonus;
    if (hero.maxHealth !== max) {
      hero.health = Math.min(max, hero.health + Math.max(0, max - hero.maxHealth));
      hero.maxHealth = max;
      hud.setHealth(hero.health / max);
    }
  }

  function buy(id) {
    const r = nodeCheck(id, ctx());
    if (!r.ok) return r;
    const node = nodeById(id);
    if (node.currency === 'standing' && !spendStanding(node.cost)) return { ok: false, reason: 'standing' };
    w.owned.push(id);
    apply();
    persist();
    events.emit('upgradeBought', { id });
    events.emit('nodeBought', { id, branch: node.branch, currency: node.currency, cost: node.cost });
    return r;
  }

  // The Batcave bench: refund every XP node, free once per act (force: a dev or debug refund that
  // does not use the act's free respec). Standing stays spent.
  function respec({ force = false } = {}) {
    const act = getAct();
    if (!force && sk.respecAct >= act) return { ok: false, reason: 'used', refunded: 0 };
    const refunded = spent();
    if (!refunded) return { ok: false, reason: 'empty', refunded: 0 };
    const keep = w.owned.filter((id) => nodeById(id)?.currency === 'standing');
    w.owned.length = 0;
    w.owned.push(...keep);
    if (!force) sk.respecAct = act;
    apply();
    persist();
    events.emit('respec', { refunded });
    return { ok: true, reason: null, refunded };
  }

  // Everything the tree page draws: branches, nodes with their state and grid cell, currencies.
  function tree() {
    const c = ctx();
    const heroId = c.hero;
    return {
      act: c.act, free: c.xpFree, standing: c.standing, bonus: sk.bonusPoints, hero: heroId,
      level: levelOf(w.xp), xp: w.xp, next: toNext(w.xp),
      respecReady: sk.respecAct < c.act && spent() > 0,
      branches: BRANCHES.map((br) => ({
        id: br.id, name: br.name, icon: br.icon, currency: br.currency, blurb: br.blurb,
        nodes: NODES.filter((x) => x.branch === br.id && (br.id !== 'kit' || (heroId && forHero(x, heroId)))).map((x) => ({
          id: x.id, name: x.name, text: x.text, demo: x.demo, cost: x.cost, currency: x.currency, act: x.act,
          requires: x.requires, col: CELL.get(x.id).col, row: CELL.get(x.id).row,
          state: nodeStatus(x.id, c),
        })),
      })).filter((br) => br.nodes.length),
    };
  }

  return {
    effects,
    get xp() { return w.xp; },
    get level() { return levelOf(w.xp); },
    get free() { return freeNow(); },
    get owned() { return w.owned; },
    get bonusPoints() { return sk.bonusPoints; },
    award,
    apply,
    buy,
    respec,
    tree,
    page() {
      const free = freeNow();
      const n = toNext(w.xp);
      // The original four rows (the old page and its tests), read off the tree's rules.
      const c = ctx();
      const legacy = (id) => {
        const st = nodeStatus(id, c);
        return st === 'act' || st === 'hero' ? 'locked' : st;
      };
      return {
        level: levelOf(w.xp), xp: w.xp, into: n.into, need: n.need, fraction: n.fraction, free,
        allOwned: UPGRADE_IDS.every((id) => w.owned.includes(id)),
        trees: TREES.map((t) => ({
          id: t.id, name: t.name,
          upgrades: t.upgrades.map((u, i) => ({ id: u.id, name: u.name, text: u.text, tier: i + 1, state: legacy(u.id) })),
        })),
      };
    },
    update(dt) {
      // A combo run closes when the counter drops back to 0.
      const v = combat.combo.value;
      if (v > 0) run.note(null, v);
      if (lastCombo > 0 && v === 0) { const r = run.close(); award(comboXp(r.peak, r.variety), 'combo'); }
      // [prog] Second Wind recharges between fights.
      if (windsUsed && !combat.active) windsUsed = 0;
      lastCombo = v;
      sinceHurt += dt;
      if (!hero.dead) {
        regenState.calm = !combat.active;
        regenState.sinceHurt = sinceHurt;
        // [verify] A tired Bruce (src/bruce/doubleLife.js nightStart staminaRegenK < 1, set on the hero
        // by src/bruce/runtime.js) recovers between fights more slowly: Batman's only refilling meter.
        const h = regenStep(hero.health, hero.maxHealth, regenState, effects, dt * staminaRegenScale(hero));
        if (h !== hero.health) {
          hero.health = h;
          if (Math.abs(h - shownHealth) >= 1 || h >= hero.maxHealth) { shownHealth = h; hud.setHealth(h / hero.maxHealth); }
        }
      }
      saveT -= dt;
      if (dirty && saveT <= 0) { saveT = 2; dirty = false; persist(); }
    },
  };
}
