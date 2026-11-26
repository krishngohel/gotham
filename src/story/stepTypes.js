// The campaign's own step types (docs/design/story-format.md 3.2). Each is { enter(step),
// update(dt, step), exit(), marker(), onRespawn(step) } and finishes its step by calling
// ctx.done(step, branch?) (a 'stepDone' event through the flow's advance, the same path every step
// takes). Failing calls ctx.fail(step, lines): the mission restarts from its retry step.
//
//   scan      stand by a clue (or each of several) with detective vision on for `hold` seconds
//   traverse  pass through gates in order, optionally against a clock (reset, never fail)
//   puzzle    stand on plates in the riddle's order before the clock runs out; a wrong plate
//             resets the order, costs time and calls in a few goons
//   fork      two (or more) places to go; reaching one picks the branch (step.branches by id)
//   fear      a toxin zone: altered rules (distorted screen, a fear meter, hallucinated goons that
//             must not be hit, watchers to sneak past); reach the goal before the meter fills
//   nightEnd  the night's last beat: summary, the night is done, the campaign moves on
//   wait      a short beat that ends on its own (lines play over it)
import { createSequence, createGates, fearStep, inCone, nearest, FEAR } from './stepLogic.js';

export function createStepTypes(ctx) {
  const { markers, ui, radio, hud, events, standing, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  const detectiveOn = () => !!theGame()?.state?.detectiveOn;

  // ---------------------------------------------------------------- scan
  const scan = (() => {
    let pts = [], held = 0, current = null, marks = [];
    return {
      enter(s) {
        pts = (s.points ?? [{ site: s.site, lines: s.found ?? null }]).map((p) => ({ ...p, at: pos(p.site ?? p.at), done: false }));
        held = 0; current = null;
        marks = pts.map((p) => (p.at ? markers.place('scan', p.at) : null));
        ctx.prompts?.show?.(['detective']);
      },
      update(dt, s) {
        const heroes = standing();
        let on = null;
        for (const p of pts) {
          if (p.done || !p.at) continue;
          if (heroes.some((h) => Math.hypot(h.pos.x - p.at.x, h.pos.z - p.at.z) < (s.radius ?? 4) && Math.abs(h.pos.y - p.at.y) < 4)) { on = p; break; }
        }
        if (on !== current) { current = on; held = 0; }
        if (!on || !detectiveOn()) { held = Math.max(0, held - dt); return; }
        held += dt;
        if (held < (s.hold ?? 1.2)) return;
        on.done = true;
        held = 0; current = null;
        const i = pts.indexOf(on);
        markers.color(marks[i], 'plateLit');
        markers.flash(marks[i]);
        events.emit('caseClue', { step: s.id, index: i });
        if (on.lines?.length) radio?.say(on.lines);
        if (pts.every((p) => p.done)) {
          events.emit('caseSolved', { step: s.id });
          ctx.done(s);
        }
      },
      marker() { const left = pts.filter((p) => !p.done).map((p) => p.at); return nearest(left, ctx.hero.pos); },
      exit() { for (const m of marks) markers.release(m); marks = []; pts = []; },
      onRespawn() {},
    };
  })();

  // ---------------------------------------------------------------- traverse
  const traverse = (() => {
    let gates = [], marks = [], run = null, clock = null;
    function show() {
      marks.forEach((m, i) => { if (!m) return; markers.color(m, i === run.current ? 'gate' : i < run.current ? 'plateLit' : 'safe'); m.mesh.visible = i >= run.current && i <= run.current + 1; });
    }
    return {
      enter(s) {
        gates = s.gates.map(pos);
        run = createGates(gates.length);
        marks = gates.map((g) => (g ? markers.place('gate', g) : null));
        clock = s.timer ?? null;
        show();
      },
      update(dt, s) {
        if (!run) return;
        if (clock != null) {
          clock -= dt;
          ui.timer(clock);
          if (clock <= 0) {
            run.reset();
            clock = s.timer;
            hud.card?.(s.failTitle ?? 'TOO SLOW', s.failText ?? 'Back to the first marker and go again.', 3000);
            if (s.failLines?.length) radio?.say(s.failLines);
            show();
          }
        }
        const g = gates[run.current];
        if (!g) return;
        for (const h of standing()) {
          if (Math.hypot(h.pos.x - g.x, h.pos.z - g.z) < (s.radius ?? 4.5) && Math.abs(h.pos.y - (g.y + 2.8)) < (s.vertical ?? 5)) {
            const r = run.pass(run.current);
            events.emit('waypointSet', { step: s.id, gate: run.current });
            if (r === 'done') { ui.timer(null); ctx.done(s); return; }
            if (s.bonus) clock = clock != null ? clock + s.bonus : clock;
            show();
            break;
          }
        }
      },
      marker() { return run ? gates[run.current] ?? null : null; },
      exit() { for (const m of marks) markers.release(m); marks = []; gates = []; run = null; clock = null; ui.timer(null); },
      onRespawn(s) { if (run) { run.reset(); clock = s.timer ?? null; show(); } },
    };
  })();

  // ---------------------------------------------------------------- puzzle
  const puzzle = (() => {
    let plates = [], seq = null, clock = null, marks = [], cool = 0, wrongs = 0, standingOn = new Set();
    function paint() { plates.forEach((p, i) => markers.color(marks[i], seq.isLit(p.id) ? 'plateLit' : 'plate')); }
    return {
      enter(s) {
        plates = s.plates.map((p) => ({ ...p, at: pos(p.site ?? p.at) }));
        seq = createSequence(s.order);
        marks = plates.map((p) => (p.at ? markers.place('plate', p.at) : null));
        clock = s.timer ?? null;
        wrongs = 0; cool = 0; standingOn = new Set();
        if (s.riddle) hud.card?.(s.riddleTitle ?? 'RIDDLE', s.riddle, 9000);
        paint();
      },
      update(dt, s) {
        if (!seq) return;
        if (clock != null) {
          clock -= dt;
          ui.timer(clock);
          if (clock <= 0) { ui.timer(null); ctx.fail(s, s.failLines); return; }
        }
        cool = Math.max(0, cool - dt);
        const now = new Set();
        for (const h of standing()) {
          for (const p of plates) {
            if (p.at && Math.hypot(h.pos.x - p.at.x, h.pos.z - p.at.z) < (s.plateRadius ?? 1.6) && Math.abs(h.pos.y - p.at.y) < 1.6) now.add(p.id);
          }
        }
        // A plate counts when a hero steps onto it (not every frame she stands there).
        for (const id of now) {
          if (standingOn.has(id) || cool > 0) continue;
          const r = seq.press(id);
          const i = plates.findIndex((p) => p.id === id);
          if (r === 'wrong') {
            wrongs += 1;
            cool = 1.2;
            markers.color(marks[i], 'plateWrong');
            markers.flash(marks[i]);
            if (clock != null) clock = Math.max(5, clock - (s.wrongCost ?? 10));
            events.emit('puzzleWrong', { step: s.id, wrongs });
            const taunt = s.wrongLines?.[(wrongs - 1) % (s.wrongLines.length || 1)];
            if (taunt) radio?.say([taunt]);
            if (s.penalty) ctx.penalty(s, wrongs);
            setTimeout(() => { if (seq) paint(); }, 700);
          } else if (r === 'ok') {
            markers.flash(marks[i]);
            paint();
            events.emit('collectible', { step: s.id, plate: id });
          } else if (r === 'done') {
            paint();
            ui.timer(null);
            events.emit('caseSolved', { step: s.id });
            ctx.done(s);
            return;
          }
        }
        standingOn = now;
      },
      marker() { return null; },
      exit() { for (const m of marks) markers.release(m); marks = []; plates = []; seq = null; clock = null; ui.timer(null); },
      onRespawn(s) { if (seq) { seq.reset(); clock = s.timer ?? null; paint(); } },
    };
  })();

  // ---------------------------------------------------------------- fork
  const fork = (() => {
    let opts = [], marks = [];
    return {
      enter(s) { opts = s.options.map((o) => ({ ...o, at: pos(o.site) })); marks = opts.map((o) => (o.at ? markers.place('scan', o.at) : null)); },
      update(dt, s) {
        for (const h of standing()) {
          for (const o of opts) {
            if (o.at && Math.hypot(h.pos.x - o.at.x, h.pos.z - o.at.z) < (o.radius ?? s.radius ?? 10) && Math.abs(h.pos.y - o.at.y) < 6) {
              if (o.lines?.length) radio?.say(o.lines);
              ctx.done(s, o.id);
              return;
            }
          }
        }
      },
      marker() { return nearest(opts.map((o) => o.at), ctx.hero.pos); },
      exit() { for (const m of marks) markers.release(m); marks = []; opts = []; },
      onRespawn() {},
    };
  })();

  // ---------------------------------------------------------------- fear
  // [story2] Per player: each hero has their own fear, shown on their own view (src/story/viewFx.js),
  // so in split screen a partner's toxin never tints the other half. The mission fails when any
  // hero's fear fills (the team is only as brave as its most frightened member).
  const fear = (() => {
    const values = new Map(), hits = new Map();
    let phantoms = [], watchers = [], goal = null, active = false, mark = null;
    const pl = () => ctx.players?.() ?? [{ hero: ctx.hero }];
    const onImpact = ({ target }) => {
      if (!active || !target?.hallucination) return;
      // The hero who swung: the nearest standing one.
      let by = null, bd = Infinity;
      for (const h of standing()) { const d = Math.hypot(h.pos.x - target.pos.x, h.pos.z - target.pos.z); if (d < bd) { bd = d; by = h; } }
      if (by) hits.set(by, (hits.get(by) ?? 0) + 1);
      target.hallucination = false; ctx.vanish?.(target);
      events.emit('fearRising', { value: by ? values.get(by) ?? 0 : 0, player: by?.player ?? null });
    };
    events.on('impact', onImpact);
    return {
      enter(s) {
        values.clear(); hits.clear(); active = true;
        goal = pos(s.site);
        mark = goal ? markers.place('scan', goal, { color: 0xb89a62 }) : null;
        phantoms = ctx.spawnPhantoms?.(s) ?? [];
        watchers = (s.watchers ?? []).map((w) => ({ ...pos(w.at ?? w.site), yaw: w.yaw ?? 0, range: w.range ?? 9, sweep: w.sweep ?? 0.8, t: Math.random() * 6 }));
        if (s.rules) hud.card?.('FEAR TOXIN', s.rules, 7000);
      },
      update(dt, s) {
        if (!active) return;
        const zone = goal && s.radius ? s.radius : Infinity;
        for (const w of watchers) w.t += dt;
        const rules = { ...FEAR, ...(s.fear ?? {}) };
        let worst = 0;
        for (const p of pl()) {
          const h = p.hero;
          if (!h || h.dead) continue;
          let seen = false;
          for (const w of watchers) {
            const yaw = w.yaw + Math.sin(w.t * 0.6) * w.sweep;
            const range = h.crouched || h.state === 'crouch' ? w.range * 0.6 : w.range;
            if (inCone({ x: w.x, z: w.z, yaw }, h.pos, { range, half: 0.75 })) seen = true;
          }
          const inGas = !goal || Math.hypot(h.pos.x - goal.x, h.pos.z - goal.z) < zone + 40;
          const before = values.get(h) ?? 0;
          const v = fearStep(before, { inGas, seen, hits: hits.get(h) ?? 0 }, dt, rules);
          values.set(h, v);
          if (Math.floor(v / 25) > Math.floor(before / 25)) events.emit('fearRising', { value: v, player: p });
          ctx.viewFx?.meter(p, 'FEAR', v / rules.max, v > 70 ? '#c8323c' : '#b89a62');
          ctx.viewFx?.distort(p, v / rules.max, 'fear');
          worst = Math.max(worst, v);
        }
        hits.clear();
        if (worst >= rules.max) { const st = s; this.exit(); ctx.fail(st, s.failLines); return; }
        if (goal && standing().some((h) => Math.hypot(h.pos.x - goal.x, h.pos.z - goal.z) < (s.goalRadius ?? 5) && Math.abs(h.pos.y - goal.y) < 5)) ctx.done(s);
      },
      marker() { return goal; },
      exit() {
        active = false;
        ctx.viewFx?.clear();
        ctx.clearPhantoms?.(phantoms);
        phantoms = [];
        markers.release(mark); mark = null;
      },
      onRespawn(s) { this.exit(); this.enter(s); },
      get value() { let m = 0; for (const v of values.values()) m = Math.max(m, v); return m; },
      valueOf(h) { return values.get(h) ?? 0; },
      debugSolve(s) { const g = pos(s.site); return g ? [{ at: g, hold: 0.6 }] : []; },
    };
  })();

  // ---------------------------------------------------------------- wait
  const wait = (() => {
    let t = 0;
    return {
      enter(s) { t = s.seconds ?? 3; },
      update(dt, s) { t -= dt; if (t <= 0) { t = Infinity; ctx.done(s); } },
      marker() { return null; }, exit() {}, onRespawn() {},
    };
  })();

  // ---------------------------------------------------------------- nightEnd
  const nightEnd = {
    enter(s) { ctx.endNight(s); },
    update() {}, marker() { return null; }, exit() {}, onRespawn() {},
  };

  return { scan, traverse, puzzle, fork, fear, wait, nightEnd };
}
