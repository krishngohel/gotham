// [balance] A scripted player that plays the real game through player one's real input actions
// (the same pressed()/down()/move the keyboard and pad feed), at a configurable skill. It never
// calls winFight, debugWin, teleport or god mode itself; the harness that stages a fight may place
// the hero at the fight's edge before measuring (stated in each script) and counts any assist.
//
// Runs on the deterministic virtual clock of scripts/anim-lib.mjs: the bot decides once per game
// frame in window.__v.after (after the frame ran, before the next reads input), so a run is the
// same frame for frame for the same seed. Its own rng (mulberry32, seeded) never touches the
// game's draws.
//
// Skill model (what a person's hands do, not what they know): every tell aimed at the hero is
// noticed after a reaction time (mean + jitter), and then answered correctly with a probability
// (counter for blue, a late dodge for red, a dodge for a gun's aim). Knightmare hides the glyphs:
// the bot then reads the animation only, slower and less reliably (readNoGlyph). Offence comes at
// a pace (apm, seconds between presses); the role-correct answer (cape the shield, the baton and
// the brute, kick the knife guard, finish the downed, go for the medic and the gunmen) is chosen
// with probability `role`, otherwise a plain punch. `mistake` is a stray press now and then.
// The masher presses punch (every fourth a kick) at a steady rate and never reads anything.
//
// Calibration (docs/design/balance.md 1): reaction times from simple/choice reaction studies of
// game players (about 0.25 s simple, 0.35-0.45 s choice under load) and counter accuracy from what
// freeflow players report (average ~75-80 %, good ~90 %+). Bot fight time x 1.15 ~ a person's.
export const SKILLS = {
  novice: { react: 0.46, jitter: 0.16, counter: 0.5, dodge: 0.4, role: 0.4, apm: 0.44, priority: 0.15, mistake: 0.12, readNoGlyph: 0.55, special: 0.2, gadget: 0.15 },
  average: { react: 0.32, jitter: 0.1, counter: 0.76, dodge: 0.62, role: 0.72, apm: 0.33, priority: 0.55, mistake: 0.05, readNoGlyph: 0.75, special: 0.6, gadget: 0.45 },
  skilled: { react: 0.22, jitter: 0.06, counter: 0.93, dodge: 0.86, role: 0.94, apm: 0.26, priority: 0.95, mistake: 0.015, readNoGlyph: 0.9, special: 0.95, gadget: 0.85 },
  masher: { masher: true, apm: 0.2 },
};

// In-page installer (serialised by page.evaluate: no closures over this module).
// opts: { skill: profile object, name, seed, player = 0 }
export function botInPage(opts) {
  // Installed once per page: a second install re-arms the same bot (new skill, seed and stats).
  if (window.__bot?.reset && window.__bot.game === window.__game) { window.__bot.reset(opts); return true; }
  const G = window.__game;
  const P = G.players[opts.player ?? 0];
  const inp = P.input;
  let S = opts.skill;
  let seed = (opts.seed ?? 1) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bot = window.__bot = {
    name: opts.name, mode: 'off', goal: null, t: 0,
    taps: new Set(), holds: new Set(), mv: null,
    stats: { presses: 0, counters: 0, counterMiss: 0, dodges: 0, capes: 0, roleAnswers: 0, roleMisses: 0, stealthTakedowns: 0, spotted: 0, deaths: 0, hpLost: 0, hits: 0, assists: 0 },
    tells: new Map(), wind: new Map(), next: 0, kickN: 0, stuck: { t: 0, best: Infinity, side: 0, sideT: 0 },
    log: [], game: G,
  };
  const freshStats = () => ({ presses: 0, counters: 0, counterMiss: 0, dodges: 0, capes: 0, roleAnswers: 0, roleMisses: 0, stealthTakedowns: 0, spotted: 0, deaths: 0, hpLost: 0, hits: 0, assists: 0 });
  bot.reset = (o) => { S = o.skill; seed = (o.seed ?? 1) >>> 0; opts.hitThralls = o.hitThralls; bot.name = o.name; bot.mode = 'off'; bot.goal = null; bot.t = 0; bot.next = 0; bot.kickN = 0; bot.tells.clear(); bot.taps.clear(); bot.holds.clear(); bot.mv = null; bot.stats = freshStats(); bot.stats.byKind = {}; };
  const mine = (e) => G.players.length === 1 || !e?.player || e.player === P;
  G.events.on('heroDown', (e) => { if (mine(e)) bot.stats.deaths += 1; });
  G.events.on('heroHurt', (e) => { if (mine(e)) { bot.stats.hpLost += e?.damage ?? 0; bot.stats.hits += 1; const k = e?.kind ?? '?'; bot.stats.byKind ??= {}; bot.stats.byKind[k] = Math.round((bot.stats.byKind[k] ?? 0) + (e?.damage ?? 0)); } });
  const origPressed = inp.pressed.bind(inp), origDown = inp.down.bind(inp);
  inp.pressed = (a) => bot.taps.has(a) || origPressed(a);
  inp.down = (a) => bot.holds.has(a) || origDown(a);
  const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  const follow = P.follow ?? G.follow;
  function setMove(dx, dz) {
    if (!dx && !dz) { bot.mv = null; return; }
    const f = follow?.forward ? follow.forward(v.set(0, 0, 1)) : { x: 0, z: 1 };
    const fx = f.x, fz = f.z;
    const r = follow?.right ? follow.right(v.set(1, 0, 0)) : { x: 1, z: 0 };
    bot.mv = { x: dx * r.x + dz * r.z, y: dx * fx + dz * fz };
  }
  const OFFSCREEN = { react: 0.12, acc: 0.85 };
  const can = (id) => !P.hero.abilities || P.hero.abilities.has(id);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const tap = (a) => { bot.taps.add(a); bot.stats.presses += 1; };
  function goTo(p, stop = 1.5) {
    const me = P.hero.pos, d = dist(me, p), st = bot.stuck;
    if (d <= stop) { setMove(0, 0); st.t = 0; st.best = Infinity; return d; }
    let dx = (p.x - me.x) / d, dz = (p.z - me.z) / d;
    if (st.sideT > 0) { st.sideT -= 1 / 60; const s = st.side; [dx, dz] = [dx * 0.3 + dz * s, dz * 0.3 - dx * s]; }
    else if (d < st.best - 0.3) { st.best = d; st.t = 0; }
    else if ((st.t += 1 / 60) > 1.2) { st.side = rnd() < 0.5 ? 1 : -1; st.sideT = 0.7; st.t = 0; st.best = Infinity; st.n = (st.n ?? 0) + 1; if (st.n % 2 === 0) tap('jump'); if (st.n % 4 === 0 && can('grapple')) tap('grapple'); } // a person hops a kerb or grapples up a ledge
    setMove(dx, dz);
    return d;
  }
  const busy = () => { const c = P.hero.control; return c && (c.name === 'stagger' || c.name === 'blockStagger' || c.name === 'knockdown'); };
  const live = () => G.combat.enemies.filter((e) => e.alive && e.state !== 'surrender' && !e.hallucination && e.ch?.root?.visible !== false);
  const aimedAtMe = (e) => G.players.length === 1 || !e.aggro || e.aggro === P.hero || e.aggro?.hero === P.hero;

  // ---- defence: tells -------------------------------------------------------------------------
  // One decision per wind-up (windupN): when it will be noticed, and whether the answer is right.
  function noteTell(e) {
    // Goons count their wind-ups (windupN); a boss actor does not: count its fresh wind-ups here.
    let n = e.windupN;
    if (n === undefined) n = bot.wind.get(e)?.n ?? 0;
    const k = e.id + ':' + n;
    let d = bot.tells.get(e.id);
    if (d && d.k === k) return d;
    const seen = !!e.glyph || G.settings?.difficulty !== 'knightmare';
    const red = e.tell === 'red' || e.def?.counterable === false || e.def?.ranged;
    // Behind the camera (off screen): a person only has the audio cue and the edge-of-screen marker
    // there, so it takes longer and is missed more (OFFSCREEN).
    const f = follow?.forward ? follow.forward(v.set(0, 0, 1)) : null;
    const off = f ? ((e.pos.x - P.hero.pos.x) * f.x + (e.pos.z - P.hero.pos.z) * f.z) < -0.5 : false;
    const acc = (red ? S.dodge : S.counter) * (seen ? 1 : S.readNoGlyph) * (off ? OFFSCREEN.acc : 1);
    const react = S.react + (seen ? 0 : 0.1) + (off ? OFFSCREEN.react : 0) + (rnd() * 2 - 1) * S.jitter;
    d = { k, at: bot.t + Math.max(0.12, react), ok: rnd() < acc, done: false, red, late: 0.18 + rnd() * 0.14 };
    bot.stats.tells = (bot.stats.tells ?? 0) + 1;
    bot.tells.set(e.id, d);
    return d;
  }
  function defend(list) {
    const me = P.hero;
    let best = null, bestDue = Infinity;
    for (const e of list) {
      if (e.windupN === undefined) { const w = bot.wind.get(e) ?? { n: 0, last: null }; if (w.last !== e.state) { if (e.state === 'windup' || e.state === 'aim') w.n += 1; w.last = e.state; } bot.wind.set(e, w); }
      if (e.state !== 'windup' && e.state !== 'aim') continue;
      if (!aimedAtMe(e)) continue;
      const ranged = !!e.def?.ranged || e.state === 'aim';
      if (dist(e.pos, me.pos) > (ranged ? 45 : 7.5)) continue;
      const d = noteTell(e);
      if (d.done || bot.t < d.at) continue;
      const left = (e.windupDur ?? 1) - (e.t ?? 0);
      if (left < bestDue) { bestDue = left; best = { e, d, ranged, left }; }
    }
    if (!best) return false;
    const { e, d, ranged, left } = best;
    if (!d.ok) { d.done = true; bot.stats.counterMiss += 1; return false; }
    if (!d.red && e.def?.counterable !== false && !ranged) {
      if (!can('counter')) { d.done = true; return false; }
      d.done = true; tap('block'); bot.stats.counters += 1; return true;
    }
    // Red: dodge late in the wind-up (a roll too early is still in the air when the blow lands).
    if (left > d.late && e.state === 'windup') return false;
    if (!can('dodge')) { d.done = true; return false; }
    d.done = true;
    const ax = me.pos.x - e.pos.x, az = me.pos.z - e.pos.z, ad = Math.hypot(ax, az) || 1;
    const s = rnd() < 0.5 ? 1 : -1;
    setMove((az / ad) * s, (-ax / ad) * s);
    tap('dodge'); bot.stats.dodges += 1;
    return true;
  }

  // ---- offence ------------------------------------------------------------------------------
  function pickTarget(list) {
    const me = P.hero.pos;
    let best = null, bs = Infinity;
    const smart = rnd() < S.priority;
    for (const e of list) {
      if (e.thrall && !opts.hitThralls) continue;
      let s = dist(e.pos, me);
      if (smart) {
        if (e.def?.ranged) s *= 0.45;
        if (e.def?.revive || e.reviving) s *= 0.5;
        if (e.def?.reinforce) s *= 0.7;
        if (e.down && dist(e.pos, me) < 3) s *= 0.4; // finish him while he is down
      }
      if (e.down && !e.air && !smart && s > 2) s *= 2;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  function roleAnswer(t) {
    // What this target needs (null: a plain strike works).
    if (t.thrall) return can('capeStun') ? 'cape' : null;
    if (t.down) return 'punch';
    if (t.stunned) return null;
    if (t.def?.frontBlock) return can('capeStun') ? 'cape' : 'kick';
    if (t.def?.shock && t.charged) return can('capeStun') ? 'cape' : 'dodge-wait';
    if (t.def?.armored) return can('capeStun') ? 'cape' : null;
    if (t.def?.parry && !t.def?.ranged) return 'kick';
    if (t.def?.dodge) return bot.kickN % 2 ? 'kick' : null;
    return null;
  }
  function attack(list) {
    if (bot.t < bot.next) return;
    const me = P.hero;
    const t = pickTarget(list);
    if (!t) { setMove(0, 0); return; }
    const d = goTo(t.pos, 1.8);
    if (d > 3.2) return;
    // Face him with the stick so the strike picks him (directional targeting).
    const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, dl = Math.hypot(dx, dz) || 1;
    setMove(dx / dl * 0.6, dz / dl * 0.6);
    // A boss on the framework (src/bosses/actor.js) is armour until a window opens: a person learns
    // to wait for his swing (counter it) instead of hitting the umbrella; a finishable one gets the finish.
    if (t.finishable) { tap('special'); bot.next = bot.t + 0.6; return; }
    if ('vulnerable' in t && t.def?.boss && !(t.vulnerable > 0)) { goTo(t.pos, 2.6); return; }
    bot.next = bot.t + S.apm * (0.8 + rnd() * 0.4);
    if (rnd() < S.mistake) { tap(rnd() < 0.5 ? 'kick' : 'block'); return; }
    // A full combo meter: the special takedown (a good player spends it).
    if (can('specialTakedown') && G.combat.combo?.ready && !t.def?.boss && rnd() < S.special) { tap('special'); return; }
    const need = roleAnswer(t);
    if (need) {
      if (rnd() < S.role) {
        bot.stats.roleAnswers += 1;
        if (need === 'cape') { tap('cape'); bot.stats.capes += 1; bot.next = bot.t + Math.max(S.apm, 0.45); return; }
        if (need === 'dodge-wait') { bot.next = bot.t + 0.3; return; }
        tap(need); return;
      }
      bot.stats.roleMisses += 1;
    }
    tap(bot.kickN++ % 5 === 4 ? 'kick' : 'punch');
  }
  function masher(list) {
    if (bot.t < bot.next) return;
    const t = pickTarget(list);
    if (!t) { setMove(0, 0); return; }
    const d = goTo(t.pos, 1.8);
    if (d > 3.5) return;
    bot.next = bot.t + S.apm;
    tap(bot.kickN++ % 4 === 3 ? 'kick' : 'punch');
  }
  // A goon on his knees with his hands up is zip-tied when a hero walks up to him (the fight is not
  // over until he is): once nobody else is standing, walk over to each one.
  function zipTie() {
    const me = P.hero.pos;
    let best = null, bd = Infinity;
    for (const e of G.combat.enemies) if (e.alive && e.state === 'surrender') { const d = dist(e.pos, me); if (d < bd) { bd = d; best = e; } }
    if (!best) return false;
    const d = goTo(best.pos, 0.6);
    if (d < 2.2 && bot.t >= bot.next) { tap('punch'); bot.next = bot.t + 0.8; } // a punch zip-ties him too
    return true;
  }
  function fight() {
    const list = live();
    if (!list.length && zipTie()) return;
    const hint = G.bosses?.simHint?.() ?? null;
    if (busy()) { setMove(0, 0); return; }
    if (S.masher) { masher(list.filter((e) => !e.down || dist(e.pos, P.hero.pos) < 2)); return; }
    if (defend(list.filter((e) => !e.down))) return;
    if (hint && bot.mode === 'boss' && boss(hint, list)) return;
    attack(list.filter((e) => !e.down || dist(e.pos, P.hero.pos) < 3));
  }
  // A boss's own hint (src/bosses/defs/*.js sim(b)): where to stand, what to press. The bot follows
  // it with its own reaction and pace; tells are still answered by defend() first.
  function boss(h, list) {
    if ('detective' in h) G.state.detectiveOn = !!h.detective;
    // A vehicle boss (Firefly): the car is driven through the vehicle API's own pilot (allowed and
    // counted: stats.piloted), re-aimed at the reaction rate, with an aim error by skill.
    if (h.drive) {
      const V = G.vehicles;
      if (!V?.active) return true;
      if (bot.t >= (bot.driveAt ?? 0)) {
        bot.driveAt = bot.t + S.react + 0.15;
        const err = (1 - (S.dodge ?? 0.6)) * 9;
        const pt = { x: h.drive.x + (rnd() * 2 - 1) * err, y: V.active.group.position.y, z: h.drive.z + (rnd() * 2 - 1) * err };
        V.startPilot([pt], { speed: h.boost ? 30 : 22, timeout: 3, boost: !!h.boost });
        bot.stats.piloted = (bot.stats.piloted ?? 0) + 1;
      }
      return true;
    }
    if (h.mode === 'stealth') { if (live().some((e) => e.aware && !e.down)) return false; stealth(); return true; }
    if (h.crouch && !P.hero.crouched && bot.t > (bot.crouchCd ?? 0)) { tap('crouch'); bot.crouchCd = bot.t + 1; }
    if (h.crouch === false && P.hero.crouched && bot.t > (bot.crouchCd ?? 0)) { tap('crouch'); bot.crouchCd = bot.t + 1; }
    if (h.action === 'dodge' || h.action === 'block') {
      const k = 'hint:' + (h.key ?? h.action);
      let d = bot.tells.get(k);
      if (!d || bot.t - d.t0 > 1.2) { d = { t0: bot.t, at: bot.t + S.react, ok: rnd() < (h.action === 'block' ? S.counter : S.dodge), done: false }; bot.tells.set(k, d); }
      if (!d.done && bot.t >= d.at) { d.done = true; if (d.ok) { tap(h.action); return true; } }
    }
    if (h.goTo) {
      const dd = goTo(h.goTo, h.stop ?? 1.2);
      if (bot.t >= bot.next) {
        if (h.action === 'cape' && can('capeStun')) {
          // The cape sweeps forward: turn to him first (a light push on the stick), then swirl.
          const me = P.hero, dx = h.goTo.x - me.pos.x, dz = h.goTo.z - me.pos.z, dl = Math.hypot(dx, dz) || 1;
          const yaw = me.bat?.yaw ?? 0, facing = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / dl;
          if (dd <= (h.stop ?? 1.2)) setMove((dx / dl) * 0.35, (dz / dl) * 0.35);
          if (facing > 0.6) { tap('cape'); bot.stats.capes += 1; bot.next = bot.t + 0.7; }
        }
        else if (h.action === 'punch' && dd < 3) { tap(bot.kickN++ % 4 === 3 ? 'kick' : 'punch'); bot.next = bot.t + S.apm; }
        else if (h.action === 'batarang') { tap('batarang'); bot.next = bot.t + 0.8; }
        else if (h.action === 'special' && dd < 6) { tap('special'); bot.next = bot.t + 0.6; }
        else if (h.action === 'interact') { tap('interact'); bot.next = bot.t + 0.5; }
      }
      return true;
    }
    if (h.action === 'cape' && bot.t >= bot.next && can('capeStun')) { tap('cape'); bot.next = bot.t + 0.7; return true; }
    if (h.action === 'batarang' && bot.t >= bot.next) { tap('batarang'); bot.next = bot.t + 0.8; return true; }
    if (h.action === 'wait') { setMove(0, 0); return true; }
    void list;
    return false;
  }

  // ---- predator rooms -------------------------------------------------------------------------
  // Sneak (crouched) to the nearest goon nobody else can see him from, come in behind and take him
  // down silently. Spotted: fight it out. The pick prefers goons whose squad-mates are far (a
  // takedown in another goon's view would be seen).
  function stealth() {
    const me = P.hero;
    const list = live().filter((e) => !e.down);
    if (list.some((e) => e.aware)) { bot.stats.spotted += bot.wasHidden ? 1 : 0; bot.wasHidden = false; if (me.crouched) tap('crouch'); fight(); return; }
    bot.wasHidden = true;
    if (!me.crouched && bot.t > (bot.crouchCd ?? 0)) { tap('crouch'); bot.crouchCd = bot.t + 1; }
    let best = null, bs = Infinity;
    for (const e of list) {
      let s = dist(e.pos, me.pos);
      for (const o of list) if (o !== e && dist(o.pos, e.pos) < 7) s += 6; // watched: later
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) { setMove(0, 0); return; }
    const yaw = best.ch?.yaw ?? 0;
    const behind = { x: best.pos.x - Math.sin(yaw) * 1.2, z: best.pos.z - Math.cos(yaw) * 1.2 };
    const d = dist(best.pos, me.pos);
    goTo(d > 3.5 ? behind : best.pos, 0.7);
    // Waits for his back: a goon walking toward him is let pass.
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const facingMe = ((me.pos.x - best.pos.x) * fx + (me.pos.z - best.pos.z) * fz) / (d || 1) > 0.3;
    if (facingMe && d < 6) { setMove(0, 0); return; }
    if (d < 1.9 && bot.t >= bot.next) { tap('punch'); bot.stats.stealthTakedowns += 1; bot.next = bot.t + 2.2; }
  }

  // ---- traversal ------------------------------------------------------------------------------
  // Toward bot.goal on foot (sprinting), grappling up when the goal is well above, gliding down.
  function travel() {
    const me = P.hero, g = bot.goal;
    if (!g) { setMove(0, 0); return; }
    const d = goTo(g, bot.stop ?? 3);
    if (d > 6) bot.holds.add('sprint'); else bot.holds.delete('sprint');
    if (g.y - me.pos.y > 4 && d < 30 && can('grapple') && bot.t > (bot.grappleCd ?? 0)) { tap('grapple'); bot.grappleCd = bot.t + 2.5; }
    if (me.state === 'air' && me.pos.y - g.y > 6 && can('glide') && bot.t > (bot.glideCd ?? 0)) { tap('jump'); bot.glideCd = bot.t + 3; }
    if (bot.stuck.sideT > 0 && bot.t > (bot.jumpCd ?? 0)) { tap('jump'); bot.jumpCd = bot.t + 1.5; }
  }
  function fear() {
    const me = P.hero;
    if (!me.crouched && bot.t > (bot.crouchCd ?? 0)) { tap('crouch'); bot.crouchCd = bot.t + 1; }
    if (bot.goal) goTo(bot.goal, 1);
  }

  bot.step = () => {
    bot.t += 1 / 60;
    bot.taps.clear();
    if (bot.mode !== 'travel') bot.holds.delete('sprint');
    if (bot.mode !== 'off' && G.flow?.mode === 'play' && !P.hero.dead) {
      if (bot.mode === 'fight' || bot.mode === 'boss') fight();
      else if (bot.mode === 'stealth') stealth();
      else if (bot.mode === 'travel') travel();
      else if (bot.mode === 'fear') fear();
    } else bot.mv = null;
    if (bot.mv && inp.move) { inp.move.x = bot.mv.x; inp.move.y = bot.mv.y; }
  };
  const origUpdate = inp.update?.bind(inp);
  if (origUpdate) inp.update = (...a) => { const r = origUpdate(...a); if (bot.mv && inp.move) { inp.move.x = bot.mv.x; inp.move.y = bot.mv.y; } return r; };
  if (window.__v) window.__v.after.push(bot.step);
  else { const loop = () => { bot.step(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  return true;
}

// Node side: installs the bot with a named skill (or a custom profile).
export async function installBot(page, { skill = 'average', seed = 1, player = 0, hitThralls = false } = {}) {
  const profile = typeof skill === 'string' ? SKILLS[skill] : skill;
  if (!profile) throw new Error('unknown skill ' + skill);
  return page.evaluate(botInPage, { skill: profile, name: typeof skill === 'string' ? skill : 'custom', seed, player, hitThralls });
}
export const setMode = (page, mode, extra = {}) => page.evaluate(([m, e]) => { Object.assign(window.__bot, e); window.__bot.mode = m; }, [mode, extra]);
export const botStats = (page) => page.evaluate(() => ({ ...window.__bot.stats, t: window.__bot.t }));
