// The players list (workstream B, Long Night 2; contract: docs/design/long-night-2.md 4.1).
//
//   game.players: Player[]                  1..2 local today; remote players join as proxies
//   Player = { id, slot, local, kit, hero, input, view, fighter, hudSlot }
//   game.hero === game.players[0].hero      the legacy alias every old call site uses
//
//   id       stable for the session (net messages, events' data.player.id)
//   slot     0, 1, ...: screen/HUD position; slot 0 owns the save, the menus and the gadgets today
//   local    false for a networked player (wave 2): its input is a remote source
//   kit      a hero kit from src/heroes/roster.js
//   hero     the actor (src/actors/hero.js); hero.player points back here
//   input    an input source with the action API (src/core/input.js)
//   view     { follow, camera } for this player's screen, or null while it shares player 0's
//   fighter  its half of combat (src/combat/combatSystem.js makeFighter)
//   hudSlot  its health/combo/chain panel (src/ui/hud.js addSlot)
//   ctx      its per-frame context for combat and hero.update ({ input, cam, grappleTarget, fx... })
//   xp       XP earned this session by a player without a save of its own here (players.js only
//            tallies it; workstream D carries it to the guest's own save)
//   away     a networked player gone silent (ignored by aggro); always false locally
export function createPlayer({ id, slot = id, local = true, kit, hero, input, view = null, hudSlot = null }) {
  return { id, slot, local, kit, hero, input, view, fighter: null, hudSlot, ctx: null, xp: 0, away: false };
}

export function createPlayers({ time = null } = {}) {
  const list = [];
  return {
    list,
    get count() { return list.length; },
    get first() { return list[0] ?? null; },
    add(p) {
      list.push(p);
      if (p.hero) p.hero.player = p;
      // Time effects: with one player everything is the world's, with more they turn per actor
      // and player-local (src/core/time.js).
      time?.setPlayerCount(list.length);
      return p;
    },
    remove(p) {
      const i = list.indexOf(p);
      if (i > 0) list.splice(i, 1); // player 0 stays: it is the game itself
      time?.setPlayerCount(list.length);
    },
    byId(id) { return list.find((p) => p.id === id) ?? null; },
    ofHero(h) { return list.find((p) => p.hero === h) ?? null; },
    // Players still on their feet.
    standing() { return list.filter((p) => !p.hero.dead); },
  };
}
