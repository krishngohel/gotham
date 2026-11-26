// Hold to revive (workstream D1). The rule itself is src/players/coopRules.js createReviveRules
// with { hold: true }: standing beside a downed partner (the proximity zone, REVIVE.radius) and
// holding the revive button (the grapple button: LB / F) fills the ring over REVIVE.time seconds;
// letting go or stepping away drains it. This file only builds the rule's per-frame view of the
// players (allocation-free: entries are reused).
export const REVIVE_ACTION = 'grapple';

// players: Player[]; out: the reused array the rule reads; busy(p): can't revive right now.
export function reviveView(players, out, busy) {
  out.length = players.length;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const e = out[i] ?? (out[i] = { id: 0, down: false, pos: null, busy: false, holding: false });
    e.id = p.id;
    e.down = !!p.hero.dead;
    e.pos = p.hero.pos;
    e.busy = busy(p);
    e.holding = !e.down && !!p.input?.down?.(REVIVE_ACTION);
  }
  return out;
}
