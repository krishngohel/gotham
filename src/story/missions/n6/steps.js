// [m67] Mission step types first used by Night Six's added missions (Night Seven uses them too).
// Each is { enter(step), update(dt, step), exit(), marker(), onRespawn(step), debugSolve(step) } and
// finishes through ctx.done(step) or fails through ctx.fail(step, lines), exactly like the types in
// src/story/stepTypes.js. Rules are in ../logic.js (pure, unit-tested). None of them takes a
// `site`: the flow's reach check never finishes one, they place their own markers and answer
// marker() for the waypoint.
//
//   freeing    people pinned at several places and a clock: stand by each for `hold` seconds, any
//              order, two players can take one each. Out of time: the mission retries.
//              { points: [{ site, label, lines }], hold 2.5, radius 3.5, timer, bonus, verb 'FREEING',
//                failLines, doneLines }
//   hack       terminals to crack: the Remote Hacking Device from range (each is a registered hack
//              target), or a manual override by standing at one for `hold` seconds. `ordered` makes
//              the order matter; `timer` fails the mission when it runs out.
//              { terminals: [{ site, label, lines }], hold 5, radius 3, ordered, timer, verb, failLines }
//   escape     the story raises police attention (src/wanted) and the step lasts until the city has
//              lost you. `mercy` seconds in, the chase is called off (`mercyLines`).
//              { level 2, at (where they saw you), hide (a suggested place to go to ground), mercy 150,
//                doneLines, mercyLines }
//   caseboard  evidence in the world (detective vision, like a scan), then the case board
//              (src/openworld/cases/board.js): put the event cards in order. Wrong twice: the first
//              card is marked.
//              { caseTitle, blurb, prompt, evidence: [{ id, site, glyph, label, text, lines }],
//                cards: [{ id, text }], order: [ids], readyLines, solvedLines, wrongLines }
import { registerMissionStep } from '../stepRegistry.js';
import { createHoldPoints, createEscape, createDeduction } from '../logic.js';
import { nearest } from '../../stepLogic.js';
import { isReplica } from '../../../net/mode.js';

const GOLD = 0xf2d24b, CYAN = 0x7fd8ff;
const up = (p, dy = 2) => ({ x: p.x, y: (p.y ?? 0) + dy, z: p.z });

// ---------------------------------------------------------------- shared: hold points in the world
function holdStep(ctx, { kind, color, defaults }) {
  const { markers, ui, radio, hud, events, standing, site } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  let pts = [], marks = [], run = null, occupied = [], unhack = [], ordered = false;
  const listOf = (s) => s.points ?? s.terminals ?? [];
  function build(s) {
    pts = listOf(s).map((p) => ({ ...p, at: pos(p.site ?? p.at) }));
    ordered = !!s.ordered;
    run = createHoldPoints(pts.length, { hold: s.hold ?? defaults.hold, timer: s.timer ?? null, bonus: s.bonus ?? 0, ordered: !!s.ordered });
    marks = pts.map((p) => (p.at ? markers.place('scan', p.at, { color }) : null));
  }
  function finished(s, i) {
    const p = pts[i];
    markers.color(marks[i], 'plateLit'); markers.flash(marks[i]);
    setTimeout(() => markers.release(marks[i]), 600);
    if (p.at) events.emit('word', { text: defaults.word, pos: up(p.at, 2.2), big: false });
    events.emit(kind === 'rescue' ? 'storyFreed' : 'collectible', { night: ctx.nightId(), step: s.id, index: i });
    if (p.lines?.length) radio?.say(p.lines);
    if (run.left > 0) hud.chip?.(`${s.id}:${i}`, `${p.label ?? defaults.noun}: ${defaults.tick} (${pts.length - run.left}/${pts.length})`, 'checkpoint');
  }
  return {
    enter(s) {
      build(s);
      // The Remote Hacking Device cracks a terminal from range (lazy: the gadget module is browser code).
      if (kind === 'hack' && typeof window !== 'undefined') {
        const step = s;
        import('../../../gadgets/g/hack.js').then((m) => {
          if (!run || ctx.theGame()?.flow?.objectives?.step !== step) return;
          unhack = pts.map((p, i) => (p.at ? m.registerHackTarget({ id: `${step.id}:${i}`, kind: 'terminal', label: p.label ?? 'Terminal', pos: up(p.at, 1.2), canHack: () => !!run && !run.isDone(i) && (!step.ordered || run.next === i), onHack: () => { if (run?.finish(i)) finished(step, i); } }) : null));
        }).catch(() => {});
      }
    },
    update(dt, s) {
      if (!run || run.state !== 'run') return;
      occupied.length = 0;
      const r = s.radius ?? defaults.radius;
      for (let i = 0; i < pts.length; i++) {
        const at = pts[i].at;
        if (!at || run.isDone(i)) continue;
        for (const h of standing()) if (Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < r && Math.abs(h.pos.y - at.y) < 4) { occupied.push(i); break; }
      }
      const out = run.tick(dt, occupied);
      for (const i of out.finished) finished(s, i);
      if (run.clock != null) ui.timer(run.clock);
      const a = run.active();
      ui.meter(a >= 0 ? `${s.verb ?? defaults.verb}: ${pts[a].label ?? defaults.noun}` : null, a >= 0 ? run.fraction(a) : 0, kind === 'hack' ? '#7fd8ff' : '#f2d24b');
      if (out.state === 'done') {
        ui.timer(null); ui.meter(null);
        if (s.doneLines?.length) radio?.say(s.doneLines);
        events.emit('caseSolved', { step: s.id });
        ctx.done(s);
      } else if (out.state === 'fail') {
        ui.timer(null); ui.meter(null);
        ctx.fail(s, s.failLines);
      }
    },
    marker() {
      if (!run) return null;
      if (ordered) return pts[run.next]?.at ?? null;
      return nearest(pts.filter((p, i) => !run.isDone(i)).map((p) => p.at), ctx.hero.pos);
    },
    exit() {
      for (const m of marks) markers.release(m);
      for (const off of unhack) off?.();
      marks = []; pts = []; unhack = []; run = null;
      ui.timer(null); ui.meter(null);
    },
    onRespawn(s) { if (run) { for (const m of marks) markers.release(m); run.reset(); marks = pts.map((p) => (p.at ? markers.place('scan', p.at, { color }) : null)); void s; } },
    debugSolve(s) { return listOf(s).map((p) => ({ at: pos(p.site ?? p.at), hold: (s.hold ?? defaults.hold) + 0.8 })); },
    // How many points are still to do (the scripted players wait on it: a hold is game time).
    debugLeft() { return run ? run.left : 0; },
    get run() { return run; },
  };
}

registerMissionStep('freeing', (ctx) => holdStep(ctx, { kind: 'rescue', color: GOLD, defaults: { hold: 2.5, radius: 3.5, verb: 'FREEING', noun: 'Civilian', word: 'SAFE!', tick: 'safe' } }));
registerMissionStep('hack', (ctx) => holdStep(ctx, { kind: 'hack', color: CYAN, defaults: { hold: 5, radius: 3, verb: 'OVERRIDE', noun: 'Terminal', word: 'CLICK', tick: 'done' } }));

// ---------------------------------------------------------------- escape
// Being caught during a story pursuit would normally end in the GCPD holding cell, half a city from
// the mission. Here it is a mission retry instead: if a hero is still surrounded when the struggle
// window is nearly up, the pursuit is cleared and the step fails back to its checkpoint
// (`caughtLines`). Struggling free in time (or a warning from Gordon) carries on as usual.
const STRUGGLE_S = 2.5; // the police runtime gives 3.2 s to struggle free (src/wanted)
registerMissionStep('escape', (ctx) => {
  const { markers, radio, hud, events, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  let esc = null, mark = null, hide = null, hinted = false, surrounded = -1, failing = false;
  // Seconds already spent on a step across its retries: the mercy call counts all of them, so a
  // player who keeps being caught is let off at the same moment as one who keeps running.
  const spent = new Map();
  const MIN_MERCY = 15;
  const wanted = () => theGame()?.wanted ?? null;
  const reason = (s) => `${ctx.nightId()}:${s.id}`;
  function raise(s) {
    // The host owns police attention; an online guest gets it through the wanted snapshot.
    if (isReplica()) return;
    const W = wanted();
    if (!W?.set) return;
    const at = pos(s.at);
    W.set(s.level ?? 2, { scripted: true, reason: reason(s), ...(at ? { at: { x: at.x, z: at.z } } : {}) });
  }
  return {
    enter(s) {
      esc = createEscape({ mercy: Math.max(MIN_MERCY, (s.mercy ?? 150) - (spent.get(s.id) ?? 0)) });
      hide = pos(s.hide);
      hinted = false; surrounded = -1; failing = false;
      mark = hide ? markers.place('scan', hide, { color: 0x9fe0ff }) : null;
      raise(s);
    },
    update(dt, s) {
      if (!esc || esc.result !== 'run' || failing) return;
      const W = wanted();
      // Surrounded: the struggle window, then a retry instead of the cell.
      if (W?.caughtHero && !isReplica()) {
        surrounded = surrounded < 0 ? 0 : surrounded + dt;
        if (surrounded >= STRUGGLE_S) {
          failing = true;
          spent.set(s.id, (spent.get(s.id) ?? 0) + esc.t);
          W.clear?.(reason(s));
          ctx.fail(s, s.caughtLines);
        }
        return;
      }
      surrounded = -1;
      // In a cell (the window was missed by a frame): the pursuit is not over.
      const level = W?.custody ? Math.max(1, W.level ?? 0) : W?.level ?? 0;
      const r = esc.tick(dt, { present: !!W?.set, level });
      // Half way to the mercy call with the level still up: say how the city loses you.
      if (!hinted && esc.t > (s.mercy ?? 150) * 0.45 && r === 'run') { hinted = true; if (s.hintLines?.length) radio?.say(s.hintLines); }
      if (r === 'run') return;
      if (r === 'mercy' && !isReplica()) {
        W?.clear?.(reason(s));
        if (s.mercyLines?.length) radio?.say(s.mercyLines);
      } else if (s.doneLines?.length) radio?.say(s.doneLines);
      hud.chip?.(`${s.id}:lost`, s.doneChip ?? 'You lost them', 'checkpoint');
      spent.delete(s.id);
      events.emit('storyEscape', { night: ctx.nightId(), step: s.id, how: r });
      ctx.done(s);
    },
    marker() { return hide; },
    exit() { markers.release(mark); mark = null; esc = null; },
    onRespawn(s) { failing = false; surrounded = -1; raise(s); },
    // Where the scripted player goes to ground (the step ends when the city has lost it, or at mercy).
    debugSolve(s) { const h = pos(s.hide); return [{ at: h ?? null, hold: 1, wait: true }]; },
    get escape() { return esc; },
  };
});

// ---------------------------------------------------------------- caseboard
registerMissionStep('caseboard', (ctx) => {
  const { markers, radio, hud, events, standing, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  let ded = null, pts = [], marks = [], held = 0, current = -1, board = null, opening = false, finishing = false, step = null, shown = false, needAway = false;
  const detectiveOn = () => !!theGame()?.state?.detectiveOn;
  const modal = () => theGame()?.side?.openworld?.modal ?? null;
  function openBoard() {
    if (!ded || ded.solved || board?.isOpen || isReplica() || typeof document === 'undefined') return;
    opening = true;
    import('../../../openworld/cases/board.js').then(({ createCaseBoard }) => {
      opening = false;
      if (!ded || ded.solved || theGame()?.flow?.objectives?.step !== step) return;
      const s = step, d = ded;
      const cases = {
        get active() { return d.active; },
        hud: () => d.hud(),
        answer(order) {
          const res = d.answer(order);
          if (res.ok) { finishing = true; setTimeout(() => { board?.close(); }, 1100); }
          else { events.emit('puzzleWrong', { step: s.id, wrongs: res.wrong }); }
          return res;
        },
      };
      board = createCaseBoard({ root: document.body, cases, onClose: () => { modal()?.close?.(); closed(s); } });
      modal()?.open?.();
      board.open();
      events.emit('caseStage', { step: s.id, stage: 'board' });
    }).catch((e) => { opening = false; console.error('case board', e); });
  }
  function closed(s) {
    if (!ded) return;
    if (ded.solved) {
      if (s.solvedLines?.length) radio?.say(s.solvedLines);
      events.emit('caseSolved', { step: s.id });
      ctx.done(s);
      return;
    }
    // Closed without an answer: the board comes back when a hero steps up to any evidence marker.
    held = 0; needAway = true;
    hud.hint?.('The case is not closed. Stand by any piece of evidence to open the board again.', 5000);
    marks.forEach((m, i) => { if (!m && pts[i].at) marks[i] = markers.place('scan', pts[i].at, { color: GOLD }); });
  }
  return {
    enter(s) {
      step = s; finishing = false; opening = false; held = 0; current = -1; board = null; shown = false; needAway = false;
      ded = createDeduction(s);
      pts = (s.evidence ?? []).map((e) => ({ ...e, at: pos(e.site ?? e.at) }));
      marks = pts.map((p) => (p.at ? markers.place('scan', p.at) : null));
      ctx.prompts?.show?.(['detective']);
    },
    update(dt, s) {
      if (!ded || finishing || opening || board?.isOpen) return;
      const heroes = standing();
      let on = -1;
      for (let i = 0; i < pts.length; i++) {
        const at = pts[i].at;
        if (!at) continue;
        if (heroes.some((h) => Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < (s.radius ?? 4) && Math.abs(h.pos.y - at.y) < 4)) { on = i; break; }
      }
      if (ded.ready) {
        // All in: the board opens once the last find's line has had a beat (and again, if it was
        // closed unanswered, when a hero comes back to the evidence).
        if (on < 0) needAway = false;
        held += dt;
        if (held > (s.boardDelay ?? 2.4) && (!shown || (on >= 0 && !needAway))) { shown = true; held = 0; openBoard(); }
        return;
      }
      if (on >= 0 && ded.run.evidence[on].found) on = -1;
      if (on !== current) { current = on; held = 0; }
      if (on < 0 || !detectiveOn()) { held = Math.max(0, held - dt); return; }
      held += dt;
      if (held < (s.hold ?? 1.2)) return;
      held = 0; current = -1;
      ded.find(on);
      markers.color(marks[on], 'plateLit'); markers.flash(marks[on]);
      const m = marks[on]; marks[on] = null;
      setTimeout(() => markers.release(m), 600);
      events.emit('caseClue', { step: s.id, index: on });
      hud.chip?.(`${s.id}:${on}`, `Evidence: ${pts[on].label} (${ded.run.foundCount}/${pts.length})`, 'checkpoint');
      if (pts[on].lines?.length) radio?.say(pts[on].lines);
      if (ded.ready && s.readyLines?.length) radio?.say(s.readyLines);
    },
    marker() { if (!ded) return null; return nearest(pts.filter((p, i) => !ded.run.evidence[i].found).map((p) => p.at), ctx.hero.pos); },
    exit() {
      for (const m of marks) markers.release(m);
      marks = []; pts = [];
      if (board?.isOpen) { const b = board; board = null; ded = null; b.close(); }
      board = null; ded = null; step = null;
    },
    onRespawn() {},
    debugSolve(s) { return (s.evidence ?? []).map((e) => ({ at: pos(e.site ?? e.at), hold: (s.hold ?? 1.2) + 0.6 })); },
    // Dev and the scripted players: the answer, for typing into the board (keys 1-5, Enter).
    debugOrder(s) { return s.order.map((id) => s.cards.findIndex((c) => c.id === id) + 1); },
    debugLeft() { return ded ? ded.run.evidence.length - ded.run.foundCount : 0; },
    get deduction() { return ded; },
    get board() { return board; },
  };
});
