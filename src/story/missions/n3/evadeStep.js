// [m23] `type: 'evade'`: the police are after Batman because the plot says so. The step sets the
// level through the wanted system's story API (docs/design/wanted.md 4) and is over when they have
// lost him: break line of sight, take the roofs, go to ground. Nothing here hurts an officer or
// changes a wanted rule; getting caught plays out the wanted system's own way (Gordon's warning, or
// the holding cell and a breakout) and the step simply waits for the search to end.
//
//   { id, type: 'evade', text, clearText, checkpoint, level: 3, delay: 8, lines, clearLines,
//     ground: [siteId, ...], hint, hintTitle }
//
// `delay`: seconds of head start before the level is set (the warning plays over them: nobody is
// surrounded while still being told to run).
//
// `ground` names places to go to ground: they are marked, and the nearest is where the waypoint
// points. Going to ground is the sure way out: once EVERY hero still standing is at one (within
// `groundRadius`, 6 m) for `groundHold` seconds (2.5), they are inside and the police have lost
// them (the wanted system's own clear()). Alone that is one hero; in co-op, split screen or online,
// it is both: a partner left in the street keeps the search alive. Losing them the hard way (out
// of sight until the search runs down) works too. With no wanted system (a headless run) the step ends
// after its minimum time. Online: the host sets the level; a guest draws the host's state.
import { createEvade } from './evadeLogic.js';

export function createEvadeStep(ctx) {
  const { markers, radio, hud, events, site, theGame } = ctx;
  const replica = () => !!ctx.isReplica?.();
  const wanted = () => theGame()?.wanted ?? null;
  let step = null, rule = null, marks = [], spots = [], shown = -1, lead = 0, under = 0;

  function raise(s) {
    const W = wanted();
    if (!W?.set || replica()) return;
    const h = ctx.hero.pos;
    W.set(s.level ?? 3, { scripted: true, reason: `story:${s.id}`, at: { x: h.x, z: h.z } });
  }
  function nearest() {
    let best = null, bd = Infinity;
    const h = ctx.hero.pos;
    for (const p of spots) { const d = Math.hypot(p.x - h.x, p.z - h.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  return {
    enter(s) {
      step = s; shown = -1;
      rule = createEvade({ minSeconds: s.minSeconds });
      spots = (s.ground ?? []).map((id) => site(id)).filter(Boolean);
      marks = spots.map((p) => markers.place('scan', p, { color: 0x7fd8ff }));
      lead = Math.max(0, s.delay ?? 0); under = 0;
      if (lead <= 0) raise(s);
      if (s.hint) hud.card?.(s.hintTitle ?? 'WANTED', s.hint, 7000);
    },
    update(dt, s) {
      if (!rule || s !== step) return;
      if (lead > 0) { lead -= dt; if (lead > 0) return; raise(s); }
      const W = wanted();
      const level = W ? W.level : 0;
      const busy = !!(W?.custody || W?.caughtHero);
      // Everyone at a place to go to ground: inside, and gone.
      if (spots.length && level > 0 && !busy && !replica() && W?.clear) {
        const hs = ctx.standing?.() ?? [ctx.hero];
        const r = s.groundRadius ?? 6;
        const all = hs.length > 0 && hs.every((h) => spots.some((p) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < r && Math.abs(h.pos.y - p.y) < 5));
        under = all ? under + dt : 0;
        if (under >= (s.groundHold ?? 2.5)) {
          under = 0;
          W.clear(`story:${s.id}:ground`);
          events.emit('word', { text: 'GONE TO GROUND', pos: { x: ctx.hero.pos.x, y: ctx.hero.pos.y + 2.4, z: ctx.hero.pos.z }, big: false });
          events.emit('storyGround', { step: s.id });
        }
      }
      if (level !== shown) { shown = level; hud.setObjective?.(level > 0 ? s.text : (s.clearText ?? 'They have lost you. Stay out of sight.')); }
      if (rule.step(dt, { level, busy }) === 'clear') {
        const st = step;
        rule = null;
        events.emit('storyEvaded', { step: s.id });
        if (s.clearLines?.length) radio?.say(s.clearLines);
        ctx.done(st);
      }
    },
    marker() { return rule && spots.length ? nearest() : null; },
    exit() {
      for (const m of marks) if (m) markers.release(m);
      marks = []; spots = []; rule = null; step = null;
    },
    // Going down and coming back is not an escape: they are still looking.
    onRespawn(s) { if (rule && lead <= 0 && (wanted()?.level ?? 0) === 0) { rule.reset(); raise(s); } },
    debugSolve() { return rule && spots.length ? [{ at: nearest(), hold: 1 }] : []; },
    // Dev and the playthrough's last resort (a search that will not end inside its time budget):
    // the wanted system's own stand-down, the call a deal with Gordon makes.
    debugAct() { const W = wanted(); if (!rule || !W?.clear || replica()) return false; W.clear(`story:${step.id}`); return true; },
    get rule() { return rule; },
  };
}
