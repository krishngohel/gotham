// Co-op glue rules (workstream D1, design section 5 "co-op glue"). Pure: the runtime
// (src/coop/glue.js) asks these and plays the answer.

// ---------------- signature moves ----------------
// The special button with the combo not ready plays one of the kit's two signature moves:
// standing, the first ('ground'); moving or sprinting, the second ('move'). A move on cooldown
// lets the press through (combat shows its usual hint). Native moves (Batman's special and chains)
// are combat's own: never played here. Returns the signature entry, or null.
export function signatureChoice(signature, { comboReady, moving, grounded, cooldowns, busy }) {
  if (!signature || comboReady || !grounded || busy) return null;
  const want = moving ? 'move' : 'ground';
  const pick = signature.find((s) => !s.native && s.when === want && !(cooldowns.get(s.id) > 0))
    ?? signature.find((s) => !s.native && !(cooldowns.get(s.id) > 0));
  return pick ?? null;
}

// ---------------- team moves ----------------
// One signature team move per pairing category, chosen from the two heroes' team tags:
//   power involved (Superman)       'thunderclap'  a shockwave around the pair, everyone flies
//   an acrobat involved             'launchPad'    the acrobat vaults off the partner into the pack
//   two brawlers                    'doubleTrouble' both pick a goon and put him down, hard
//   otherwise (the shadows)         'darkDuet'     both strike from the dark: two goons each
export const TEAM_MOVES = Object.freeze({
  thunderclap: Object.freeze({ id: 'thunderclap', name: 'Thunderclap', word: 'THUNDERCLAP!', radius: 7.5, launch: 7, power: 2 }),
  launchPad: Object.freeze({ id: 'launchPad', name: 'Launch Pad', word: 'LAUNCH PAD!', radius: 4.5, launch: 5, power: 2 }),
  doubleTrouble: Object.freeze({ id: 'doubleTrouble', name: 'Double Trouble', word: 'DOUBLE TROUBLE!', targets: 1, power: 3 }),
  darkDuet: Object.freeze({ id: 'darkDuet', name: 'Dark Duet', word: 'DARK DUET!', targets: 2, power: 2 }),
});
export function teamMoveFor(tagsA = [], tagsB = []) {
  const has = (t) => tagsA.includes(t) || tagsB.includes(t);
  if (has('power')) return TEAM_MOVES.thunderclap;
  if (has('acrobat')) return TEAM_MOVES.launchPad;
  if (tagsA.includes('brawler') && tagsB.includes('brawler')) return TEAM_MOVES.doubleTrouble;
  return TEAM_MOVES.darkDuet;
}
// Both pressed special within `window` seconds of each other, close together, with goons near
// and the team move off cooldown.
export const TEAM = Object.freeze({ window: 0.6, range: 7, enemyRange: 9, cooldown: 18 });
export function teamReady({ pressA, pressB, now, dist, enemiesNear, cooldown }, t = TEAM) {
  return cooldown <= 0 && enemiesNear > 0 && dist <= t.range && Number.isFinite(pressA) && Number.isFinite(pressB) && Math.abs(pressA - pressB) <= t.window && now - Math.max(pressA, pressB) < 0.05;
}

// ---------------- dual takedowns ----------------
// Both heroes beside the same stunned or floored goon (not a boss): either pressing grab takes
// him down together. Returns the goon, or null.
export const DUAL = Object.freeze({ reach: 2.8 });
export function dualTakedownTarget(a, b, enemies, d = DUAL) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.def?.boss || !(e.stunned || e.down || e.state === 'stunned')) continue;
    const da = Math.hypot(e.pos.x - a.x, e.pos.z - a.z), db = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
    if (da > d.reach || db > d.reach) continue;
    if (da + db < bd) { bd = da + db; best = e; }
  }
  return best;
}

// ---------------- pings and quick chat ----------------
// The comms wheel: three marks and four lines. A mark lives `ttl` seconds (one per kind per
// player: a new one replaces the old); lines are spoken, not kept.
export const COMMS = Object.freeze([
  Object.freeze({ id: 'enemy', label: 'Mark that goon', kind: 'mark' }),
  Object.freeze({ id: 'here', label: 'Go here', kind: 'mark' }),
  Object.freeze({ id: 'help', label: 'Need help!', kind: 'mark' }),
  Object.freeze({ id: 'onMyWay', label: 'On my way!', kind: 'chat' }),
  Object.freeze({ id: 'nice', label: 'Nice one!', kind: 'chat' }),
  Object.freeze({ id: 'follow', label: 'Follow me!', kind: 'chat' }),
  Object.freeze({ id: 'wait', label: 'Wait up!', kind: 'chat' }),
]);
export const PING_TTL = { enemy: 10, here: 12, help: 8 };

// The wheel slot a direction points at (screen x right, y down), or null in the dead zone.
export function commsSlot(dx, dy, dead = 0.35, n = COMMS.length) {
  const len = Math.hypot(dx, dy);
  if (len < dead) return null;
  // Slot 0 straight up, clockwise.
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / ((Math.PI * 2) / n)) % n;
}

export function createPings() {
  const marks = [];
  return {
    marks,
    // { id, by, kind, pos?, target? } -> the stored mark (replacing that player's previous one of the kind)
    add(m) {
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i].by === m.by && marks[i].id === m.id) marks.splice(i, 1);
      const mark = { ...m, t: PING_TTL[m.id] ?? 8 };
      marks.push(mark);
      return mark;
    },
    update(dt) {
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        m.t -= dt;
        // A marked goon going down ends his mark.
        if (m.t <= 0 || (m.target && !m.target.alive)) marks.splice(i, 1);
      }
      return marks;
    },
    clear() { marks.length = 0; },
  };
}
