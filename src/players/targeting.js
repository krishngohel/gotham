// Who an enemy goes after when more than one hero is in the fight. Pure (workstream B, Long
// Night 2; contract: docs/design/long-night-2.md 4.1, research: coop-netcode.md decision 14).
//
// `players` are anything with a `hero` ({ pos, dead }) and optionally `away` (a networked player
// gone silent): Player records or combat fighters. With one player every function returns that
// player, so single-player targeting is exactly what it was.
//
// pickTarget scores each standing player by distance, then:
// - the player who hit this enemy last is preferred (it turns on whoever hit it),
// - the current target is preferred a little (no flapping between two equal heroes),
// - every other enemy already on a player counts against it (attackers spread across players).
// Downed players are ignored; if every player is down the enemy keeps who it had.
// The caller re-picks only between attacks: a wind-up's target stays fixed until recovery.
export const AGGRO = { lastHitBonus: 3, stickBonus: 1.5, loadPenalty: 2.5 };

export function isDowned(p) {
  return !p || !p.hero || !!p.hero.dead || !!p.away;
}

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The nearest standing player to a position (downed ones only if nobody stands), or null.
export function nearestPlayer(pos, players, { includeDowned = false } = {}) {
  let best = null, bestD = Infinity, any = null, anyD = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p?.hero) continue;
    const d = flat(p.hero.pos, pos);
    if (d < anyD) { anyD = d; any = p; }
    if (!includeDowned && isDowned(p)) continue;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best ?? any;
}

// enemy: { pos, aggro (current target), lastHitBy }. load(p): enemies currently on player p.
export function pickTarget(enemy, players, { current = enemy.aggro ?? null, lastHitBy = enemy.lastHitBy ?? null, load = null, tune = AGGRO } = {}) {
  if (!players.length) return null;
  if (players.length === 1) return players[0];
  let best = null, bestScore = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (isDowned(p)) continue;
    let score = flat(p.hero.pos, enemy.pos);
    if (p === lastHitBy) score -= tune.lastHitBonus;
    if (p === current) score -= tune.stickBonus;
    // This enemy is part of its current target's load: don't count it against staying.
    if (load) score += tune.loadPenalty * Math.max(0, load(p) - (p === current ? 1 : 0));
    if (score < bestScore) { bestScore = score; best = p; }
  }
  if (best) return best;
  return current && players.includes(current) ? current : players[0];
}
