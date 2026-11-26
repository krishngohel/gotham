// Every local player's HUD behind the one `hud` object the game's systems were built with
// (workstream D1). Player 0's HUD answers every call as it always did; the calls that describe the
// shared story (the objective, a goal banner, a card, the trophy count, the boss bar, the Joker's
// speech, hiding the HUD for a comic) go to every player's HUD, so each split view shows them.
// Calls about one player (a hint, a damage flash, a sound word at a screen point, a glyph) stay on
// player 0's unless the caller asks for a player's own HUD with forPlayer(). With one player the
// group is player 0's HUD and nothing else.
export const SHARED_HUD_CALLS = ['setObjective', 'card', 'dismissCard', 'setTrophies', 'banner', 'bossBar', 'speech', 'setVisible', 'clearGlyphs'];

export function createHudGroup(primary) {
  const extra = new Map(); // player id -> that player's HUD (player 0 is `primary`)
  const group = {};
  for (const key of Object.keys(primary)) {
    const d = Object.getOwnPropertyDescriptor(primary, key);
    if (d.get || d.set) Object.defineProperty(group, key, { get: d.get ? () => primary[key] : undefined, enumerable: true });
    else group[key] = d.value;
  }
  // The standing state a HUD that joins mid-run must show at once (replayed on attach).
  const STANDING = new Set(['setObjective', 'setTrophies', 'bossBar']);
  const last = new Map();
  for (const m of SHARED_HUD_CALLS) {
    const own = primary[m];
    group[m] = (...args) => {
      if (STANDING.has(m)) last.set(m, args);
      const r = own(...args);
      for (const h of extra.values()) h[m](...args);
      return r;
    };
  }
  group.primary = primary;
  // A player's own HUD (player 0, or anyone without one of their own yet: the primary).
  group.forPlayer = (p) => (p && extra.get(p.id)) || primary;
  group.attach = (p, hud) => { extra.set(p.id, hud); for (const [m, args] of last) hud[m](...args); };
  group.detach = (p) => { extra.delete(p.id); };
  group.all = () => [primary, ...extra.values()];
  return group;
}
