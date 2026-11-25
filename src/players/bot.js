// A scripted second hero for development and tests (?p2=bot): it fights near its partner,
// counters wind-ups aimed at it and walks over to revive a downed partner. It drives a scripted
// input source (src/core/input.js createScriptedInput) through the same action API a pad would,
// so everything it does goes through the real combat and hero code. Not shipped gameplay.

// Pure decision: where to go (a world-space direction, or none) and which action to tap.
//   me / partner: { pos: {x, z}, dead }   enemies: [{ pos, alive, aware, state, mine }]
//   (mine: the enemy is after this bot). `ready` says the attack cooldown has run out.
export function botDecide({ me, partner = null, enemies, ready = true, counterReady = true }) {
  // hold: an action to keep held this frame (the revive button beside a downed partner).
  const out = { dx: 0, dz: 0, action: null, hold: null };
  if (me.dead) return out;
  const goTo = (p, stop) => {
    const dx = p.x - me.pos.x, dz = p.z - me.pos.z, d = Math.hypot(dx, dz);
    if (d > stop) { out.dx = dx / d; out.dz = dz / d; }
    return d;
  };
  // A wind-up coming at it: counter.
  if (counterReady) {
    for (const e of enemies) {
      if (!e.alive || e.state !== 'windup' || !e.mine) continue;
      if (Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z) < 7) { out.action = 'block'; return out; }
    }
  }
  // Partner down: go and stand next to them, and hold the revive button there.
  if (partner?.dead) { if (goTo(partner.pos, 1.2) < 1.9) out.hold = 'grapple'; return out; }
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive || !e.aware) continue;
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    goTo(best.pos, 2.2);
    if (ready && bestD < 7) out.action = 'punch';
    return out;
  }
  if (partner) goTo(partner.pos, 4);
  return out;
}

// Turns decisions into input every frame. `cam` gives the camera's forward/right (the move vector
// is camera-relative, as a stick is).
export function createBotDriver({ player, partner, combat, cam, rng = Math.random }) {
  const input = player.input;
  const fwd = { x: 0, y: 0, z: 1 }, right = { x: 1, y: 0, z: 0 };
  const v = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, x: 0, y: 0, z: 0 };
  let attackT = 0, counterT = 0, kickEvery = 0, holding = null;
  const me = { pos: null, dead: false }, mate = { pos: null, dead: false };
  const view = [];
  return {
    update(dt) {
      attackT -= dt; counterT -= dt;
      me.pos = player.hero.pos; me.dead = !!player.hero.dead;
      if (partner) { mate.pos = partner.hero.pos; mate.dead = !!partner.hero.dead; }
      const fighter = player.fighter;
      view.length = 0;
      for (const e of combat.enemies) view.push({ pos: e.pos, alive: e.alive, aware: e.aware, state: e.state, mine: !e.aggro || e.aggro === fighter });
      const d = botDecide({ me, partner: partner ? mate : null, enemies: view, ready: attackT <= 0, counterReady: counterT <= 0 });
      const f = cam.forward(v.set(0, 0, 1));
      fwd.x = f.x; fwd.z = f.z;
      const r = cam.right(v.set(1, 0, 0));
      right.x = r.x; right.z = r.z;
      input.setMove(d.dx * right.x + d.dz * right.z, d.dx * fwd.x + d.dz * fwd.z);
      if (d.hold !== holding) { if (holding) input.release(holding); if (d.hold) input.press(d.hold); holding = d.hold; }
      if (d.action === 'block') { input.tap('block'); counterT = 0.5; }
      else if (d.action === 'punch') {
        kickEvery += 1;
        input.tap(kickEvery % 4 === 0 ? 'kick' : 'punch');
        attackT = 0.3 + rng() * 0.15;
      }
    },
  };
}
