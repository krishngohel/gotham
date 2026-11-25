// [story2] The night simulator's in-page player (scripts/night-sim.mjs, tests/e2e/campaign.spec.js):
// installed with page.evaluate(installSim). It drives player one's real input actions; window.__sim
// takes a mode ('fight' | 'stealth' | 'boss' | 'fear' | 'off') and, for fear, a goal.
export function installSim() {
  const G = window.__game;
  const P = G.players[0];
  const inp = P.input;
  const sim = { mode: 'off', deaths: 0, taps: new Set(), holds: new Set(), mv: null, cool: { atk: 0, def: 0, cape: 0 }, kick: 0, goal: null, thralls: false, fearMax: 0, log: [] };
  window.__sim = sim;
  G.events.on('heroDown', () => { sim.deaths += 1; });
  const origPressed = inp.pressed.bind(inp), origDown = inp.down.bind(inp);
  inp.pressed = (a) => sim.taps.has(a) || origPressed(a);
  inp.down = (a) => sim.holds.has(a) || origDown(a);
  const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const setMove = (dx, dz) => {
    if (!dx && !dz) { sim.mv = null; return; }
    const f = G.follow.forward ? G.follow.forward(v.set(0, 0, 1)) : { x: 0, z: 1 };
    const fx = f.x, fz = f.z;
    const r = G.follow.right ? G.follow.right(v.set(1, 0, 0)) : { x: 1, z: 0 };
    sim.mv = { x: dx * r.x + dz * r.z, y: dx * fx + dz * fz };
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Walking into a tree trunk or a bench: if a goal is not getting closer, step sideways a moment.
  const stuck = { t: 0, best: Infinity, side: 0, sideT: 0 };
  function goTo(p, stop = 1.5) {
    const me = P.hero.pos, d = dist(me, p);
    if (d <= stop) { setMove(0, 0); stuck.t = 0; stuck.best = Infinity; return d; }
    let dx = (p.x - me.x) / d, dz = (p.z - me.z) / d;
    if (stuck.sideT > 0) { stuck.sideT -= 1 / 60; const s = stuck.side; [dx, dz] = [dx * 0.3 + dz * s, dz * 0.3 - dx * s]; }
    else if (d < stuck.best - 0.3) { stuck.best = d; stuck.t = 0; }
    else if ((stuck.t += 1 / 60) > 1.2) { stuck.side = Math.random() < 0.5 ? 1 : -1; stuck.sideT = 0.7; stuck.t = 0; stuck.best = Infinity; }
    setMove(dx, dz);
    return d;
  }
  function tap(a) { sim.taps.add(a); }
  function fight(dt, { stealth = false } = {}) {
    const me = P.hero;
    const list = G.combat.enemies.filter((e) => e.alive && !e.down && !e.hallucination && e.ch?.root?.visible !== false);
    for (const k of Object.keys(sim.cool)) sim.cool[k] -= dt;
    const hint = G.bosses?.simHint?.() ?? null;
    // Defence first: a swing coming at me (blue: counter, red: dodge).
    if (sim.cool.def <= 0) {
      for (const e of list) {
        if (dist(e.pos, me.pos) > 4.5) continue;
        if (e.state === 'windup' || e.state === 'aim' || e.glyph === 'red' && e.state !== 'idle') {
          const red = e.glyph === 'red' || e.def?.counterable === false;
          if (red) { const ax = me.pos.x - e.pos.x, az = me.pos.z - e.pos.z, ad = Math.hypot(ax, az) || 1; setMove(az / ad, -ax / ad); tap('dodge'); } else tap('block');
          sim.cool.def = 0.45;
          return;
        }
      }
    }
    if (hint?.action === 'dodge' || hint?.action === 'block') { if (sim.cool.def <= 0) { tap(hint.action); sim.cool.def = 0.45; } }
    if (hint && 'detective' in hint) G.state.detectiveOn = !!hint.detective;
    if (hint?.goTo) {
      const d = goTo(hint.goTo, hint.stop ?? 1.2);
      if (hint.action === 'cape' && sim.cool.cape <= 0) { tap('cape'); sim.cool.cape = 0.8; }
      if (hint.action === 'punch' && d < 3 && sim.cool.atk <= 0) { tap(sim.kick++ % 4 === 3 ? 'kick' : 'punch'); sim.cool.atk = 0.3; }
      return;
    }
    if (hint?.action === 'cape' && sim.cool.cape <= 0) { tap('cape'); sim.cool.cape = 0.8; return; }
    // Offence: gunmen first, then the nearest aware goon (or the boss).
    let best = null, bd = Infinity;
    for (const e of list) {
      if (stealth && !e.aware) continue;
      const d = dist(e.pos, me.pos) * (e.def?.ranged ? 0.5 : 1);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { setMove(0, 0); return; }
    const d = goTo(best.pos, 1.9);
    const thrall = sim.thralls || best.thrall;
    const tough = ['shield', 'brute', 'heavy', 'baton'].includes(best.type);
    if (d < 2.6 && (thrall || (tough && !best.stunned)) && sim.cool.cape <= 0) { tap('cape'); sim.cool.cape = 0.9; return; }
    if (d < 2.6 && !thrall && sim.cool.atk <= 0) { tap(sim.kick++ % 4 === 3 ? 'kick' : 'punch'); sim.cool.atk = 0.28 + Math.random() * 0.1; }
  }
  function stealth(dt) {
    const me = P.hero;
    const list = G.combat.enemies.filter((e) => e.alive && !e.down);
    if (list.some((e) => e.aware)) { if (me.crouched) tap('crouch'); fight(dt, { stealth: false }); return; }
    if (!me.crouched && !(sim.cool.crouch > 0)) { tap('crouch'); sim.cool.crouch = 1; }
    sim.cool.crouch -= dt; sim.cool.atk -= dt;
    let best = null, bd = Infinity;
    for (const e of list) { const d = dist(e.pos, me.pos); if (d < bd) { bd = d; best = e; } }
    if (!best) { setMove(0, 0); return; }
    const yaw = best.ch?.yaw ?? 0;
    const behind = { x: best.pos.x - Math.sin(yaw) * 1.1, z: best.pos.z - Math.cos(yaw) * 1.1 };
    const d = goTo(bd > 4 ? behind : best.pos, 0.8);
    if (bd < 1.8 && sim.cool.atk <= 0) { tap('punch'); sim.cool.atk = 2.2; }
    void d;
  }
  function fear(dt) {
    const me = P.hero;
    if (!me.crouched && !(sim.cool.crouch > 0)) { tap('crouch'); sim.cool.crouch = 1; }
    sim.cool.crouch = (sim.cool.crouch ?? 0) - dt;
    if (sim.goal) goTo(sim.goal, 1);
    const fv = G.flow.story.stepTypes.fear.value ?? 0;
    sim.fearMax = Math.max(sim.fearMax, fv);
  }
  let last = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.taps.clear();
    if (sim.mode !== 'off' && G.flow.mode === 'play' && !P.hero.dead) {
      if (sim.mode === 'fight' || sim.mode === 'boss') fight(dt);
      else if (sim.mode === 'stealth') stealth(dt);
      else if (sim.mode === 'fear') fear(dt);
    } else sim.mv = null;
    // The keyboard input recomputes move each frame: overwrite it after its own update.
    if (sim.mv && inp.move) { inp.move.x = sim.mv.x; inp.move.y = sim.mv.y; }
    requestAnimationFrame(frame);
  }
  // Keep move written after the game's own input update too (the frame order varies).
  const origUpdate = inp.update?.bind(inp);
  if (origUpdate) inp.update = (...a) => { const r = origUpdate(...a); if (sim.mv && inp.move) { inp.move.x = sim.mv.x; inp.move.y = sim.mv.y; } return r; };
  requestAnimationFrame(frame);
}
