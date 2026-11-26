// Co-op rules, pure (workstream B, Long Night 2; contract: docs/design/long-night-2.md 4.1).
// Single-player is co-op with one player: with one player every rule here is a no-op (scaling
// 1x, all XP to the one save, going down is the old death).

// ---------------- downed and revive ----------------
// A hero knocked out while a partner still stands is *downed*, not dead: a partner standing next
// to them for REVIVE.time seconds brings them back on REVIVE.health of their health. A downed
// hero nobody reaches within REVIVE.window seconds bleeds out, which counts as the whole team
// going down (the checkpoint, as a single player's death). Everybody down: the checkpoint.
export const REVIVE = { window: 25, time: 1.5, radius: 2.2, health: 0.5 };

// players (each update): [{ id, down, pos: {x, z}, busy, holding }] where busy means the player
// can't revive right now (mid-move, in a vehicle) and holding that it holds the revive button.
// opts.hold (workstream D1): the zone alone is not enough, the helper must also hold the button
// (hold to revive, with a ring); without it standing in the zone revives, as before.
// Returns this frame's outcomes:
//   { type: 'revived', id, by }   { type: 'expired', id }   { type: 'allDown' }
export function createReviveRules(opts = {}) {
  const o = { ...REVIVE, ...opts };
  const downs = new Map();
  let allDownSent = false;
  const out = [];
  return {
    options: o,
    down(id) { if (!downs.has(id)) downs.set(id, { left: o.window, progress: 0, by: null }); },
    isDown(id) { return downs.has(id); },
    // { left, progress (0..1), by } for a downed player, else null (the HUD's revive ring).
    state(id) {
      const d = downs.get(id);
      return d ? { left: d.left, progress: Math.min(1, d.progress / o.time), by: d.by } : null;
    },
    clear() { downs.clear(); allDownSent = false; },
    update(dt, players) {
      out.length = 0;
      if (!downs.size) { allDownSent = false; return out; }
      if (players.length && players.every((p) => p.down || downs.has(p.id))) {
        if (!allDownSent) { allDownSent = true; out.push({ type: 'allDown' }); }
        return out;
      }
      for (const [id, d] of downs) {
        const me = players.find((p) => p.id === id);
        if (!me) { downs.delete(id); continue; }
        d.left -= dt;
        if (d.left <= 0) { downs.delete(id); out.push({ type: 'expired', id }); continue; }
        let helper = null;
        for (const p of players) {
          if (p.id === id || p.down || downs.has(p.id) || p.busy || (o.hold && !p.holding)) continue;
          if (Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) <= o.radius) { helper = p; break; }
        }
        if (helper) {
          d.progress += dt;
          d.by = helper.id;
          if (d.progress >= o.time) { downs.delete(id); out.push({ type: 'revived', id, by: helper.id }); }
        } else {
          // Stepping away loses the progress quickly, but not all at once.
          d.progress = Math.max(0, d.progress - dt * 2);
          d.by = null;
        }
      }
      return out;
    },
  };
}

// ---------------- enemy scaling ----------------
// More heroes, more goons and more attackers, a little tougher (health at most 1.25x).
// Attack tokens are per target player (src/combat/director.js), so with the per-player cap kept at
// the difficulty's maxWindups the total grows with the team.
export function coopScaling(playerCount) {
  const n = Math.max(1, playerCount | 0);
  return {
    enemyCount: 1 + 0.5 * (n - 1),
    health: Math.min(1.25, 1 + 0.25 * (n - 1)),
    tokensPerPlayer: 1,
    tokensTotal: n,
  };
}

// A goon's health for `playerCount` heroes (whole hit points; never less than it was).
export function scaledHealth(health, playerCount) {
  return Math.max(health, Math.round(health * coopScaling(playerCount).health));
}

// A wave's spawn list for `playerCount` heroes: the extra goons copy the wave's own entries (never a
// brute or a boss: a second brute changes the fight, not its size) a step to the side.
export function scaleWave(entries, playerCount) {
  const extra = Math.round(entries.length * coopScaling(playerCount).enemyCount) - entries.length;
  if (extra <= 0) return entries;
  const pool = entries.filter((e) => e.type !== 'brute' && e.type !== 'joker' && e.type !== 'harley');
  if (!pool.length) return entries;
  const out = entries.slice();
  for (let i = 0; i < extra; i++) {
    const src = pool[i % pool.length];
    const a = (i + 1) * 2.4;
    out.push({ ...src, dx: src.dx + Math.cos(a) * 1.6, dz: src.dz + Math.sin(a) * 1.6 });
  }
  return out;
}

// ---------------- XP ----------------
// XP is credited to each player's own save. What a player does themselves (their KOs, counters,
// takedowns, chains, combos) is theirs; what the team does (a fight won, an objective, a trophy, a
// crime stopped, a cache, a medal) is everyone's.
export const PERSONAL_XP = new Set(['ko', 'takedown', 'special', 'counter', 'chainDone', 'swarmDone', 'impact', 'combo']);

// Which players an XP event credits: ids, from the event's (possibly absent) player.
export function xpRecipients(source, data, players) {
  const by = data?.player;
  if (PERSONAL_XP.has(source) && by && by.id !== undefined) return [by.id];
  return players.map((p) => p.id);
}

// Whether the save owner (player 0 on this machine) earns an XP event. An event with no player is
// a team event, or a single-player one: it always counts.
export function creditsOwner(source, data, ownerId = 0) {
  const by = data?.player;
  if (!PERSONAL_XP.has(source) || !by || by.id === undefined) return true;
  return by.id === ownerId;
}
