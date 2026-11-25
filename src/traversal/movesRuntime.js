// Game-side glue for the traversal upgrades (workstream L3, `[move]`): hands each player's hero its
// `moves` (src/traversal/moves.js), the city's rising air and the pull picker. game.js builds one.
//
// Per player: every hero gets moveEffects(effects) unless something has set `hero.movesFrom` (an
// effects-like object of that player's own: workstream L1 can point a co-op partner at their own
// tree). Refreshed when an upgrade is bought ('upgradeBought'), a skill node is bought
// ('skillBought', L1's event if it emits one) or a player joins.
import { moveEffects } from './moves.js';
import { createUpdraftField, steamUpdrafts, LAKE_BAND } from './updrafts.js';
import { createPullables } from './pullables.js';
import { createPullPicker } from './pullAim.js';

export function createMoves({ events, effects, players, world, all = false }) {
  const field = createUpdraftField([LAKE_BAND, ...steamUpdrafts(world?.steamSources ?? [])]);
  const pullables = createPullables();
  const pickers = new Map();
  let shared = moveEffects(effects, { all });

  function apply() {
    shared = moveEffects(effects, { all });
    for (const p of players.list) {
      const h = p.hero;
      if (!h) continue;
      h.moves = h.movesFrom ? moveEffects(h.movesFrom, { all }) : shared;
      h.updrafts = field;
    }
  }
  apply();
  for (const ev of ['upgradeBought', 'nodeBought', 'skillBought', 'effectsChanged', 'playerJoined', 'playerLeft']) events.on(ev, () => apply());

  // Line of sight for a pull (one ray; the pick runs at 10 Hz).
  let seeFrom = null;
  const dirScratch = { x: 0, y: 0, z: 0 }, hitOut = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
  function visible(x, y, z) {
    if (!world?.collision?.raycast || !seeFrom) return true;
    const dx = x - seeFrom.x, dy = y - seeFrom.y, dz = z - seeFrom.z, d = Math.hypot(dx, dy, dz) || 1;
    dirScratch.x = dx / d; dirScratch.y = dy / d; dirScratch.z = dz / d;
    const hit = world.collision.raycast(seeFrom, dirScratch, d, hitOut);
    return !hit || hit.t > d - 0.8;
  }
  const opts = { visible };

  return {
    get shared() { return shared; },
    updrafts: field,
    pullables,
    refresh: apply,
    // The grapple pull target for a hero aiming from `eye` along unit `dir` (or null).
    pickPull(hero, enemies, eye, dir) {
      if (!hero.moves?.pull) return null;
      let picker = pickers.get(hero);
      if (!picker) pickers.set(hero, (picker = createPullPicker()));
      seeFrom = eye;
      const r = picker.pick(enemies, pullables, eye, dir, opts);
      seeFrom = null;
      return r;
    },
  };
}
