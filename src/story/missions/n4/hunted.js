// [m45] The `hunted` step type (Night Four, "Friendly Fire"; docs/design/story-format.md 3.2): the
// GCPD is hunting the heroes as plot, and the step ends when they have gone to ground.
//
//   { type: 'hunted', at: site (where they were seen), hide: site (a suggested place to go to
//     ground: the marker), level, maxTime, heading, rules (a card), escapedLines, calledOffLines,
//     failLines, retry: true }
//
// It only talks to the police system through its story API (window.__game.wanted: set, clear,
// level, stateName; docs/design/wanted.md 4). The host raises the level; an online guest draws
// what the host sends and never sets anything. Caught is a mission retry (the level is cleared
// before the cell), so the night never detours through the holding cell. Rules: huntedLogic.js.
import { isReplica } from '../../../net/mode.js';
import { huntedRules, huntedLevel, huntedVerdict } from './huntedLogic.js';

export function createHuntedStep(ctx) {
  const { markers, radio, hud, events, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p ?? null);
  const police = () => theGame()?.wanted ?? null;
  const reason = (s) => `${ctx.nightId?.() ?? 'night'}:${s.id}`;
  const run = { t: 0, fails: 0, armed: false };
  const facts = { present: false, level: 0, state: 'clear' };
  let forStep = null, mark = null, hide = null, over = true;

  function arm(s) {
    const W = police();
    run.armed = false;
    if (!W?.set || isReplica()) return;
    const rules = huntedRules(s);
    if (run.fails >= rules.callOffAfter) return;
    W.set(huntedLevel(run.fails, rules), { scripted: true, reason: reason(s), at: pos(s.at) ?? ctx.hero.pos });
    run.armed = true;
  }
  function finish(s, lines) {
    over = true;
    if (lines?.length) radio?.say(lines);
    events.emit('storyHunted', { night: ctx.nightId?.() ?? null, step: s.id, fails: run.fails });
    run.fails = 0; forStep = null;
    ctx.done(s);
  }
  return {
    enter(s) {
      // A retry re-enters the same step: the failed attempts carry over (Gordon thins the line).
      if (forStep !== s.id) { run.fails = 0; forStep = s.id; }
      run.t = 0; over = false;
      hide = pos(s.hide);
      mark = hide ? markers.place('scan', hide, { color: 0x9fe0ff }) : null;
      arm(s);
      if (s.rules) hud.card?.(s.heading ?? 'HUNTED', s.rules, 7000);
    },
    update(dt, s) {
      if (over || isReplica()) return;
      run.t += dt;
      const W = police();
      facts.present = !!W?.set; facts.level = W?.level ?? 0; facts.state = W?.stateName ?? 'clear';
      const v = huntedVerdict(run, facts, huntedRules(s));
      if (v === 'run') return;
      if (v === 'escaped') { finish(s, s.escapedLines); return; }
      if (v === 'calledOff') { W?.clear?.(`${reason(s)}:calledOff`); finish(s, s.calledOffLines ?? s.escapedLines); return; }
      // Caught: clear the response before it becomes a cell, and go again from the checkpoint.
      over = true;
      run.fails += 1;
      W?.clear?.(`${reason(s)}:retry`);
      ctx.fail(s, s.failLines);
    },
    marker() { return hide; },
    exit() {
      markers.release(mark); mark = null; hide = null;
      // Leaving any other way (a dev jump, a replay ending): the scripted hunt goes with the step.
      if (!over && run.armed && !isReplica()) police()?.clear?.('story:huntedExit');
      over = true;
    },
    onRespawn(s) { if (!over && !run.armed) arm(s); },
    debugSolve(s) { const h = pos(s.hide); return h ? [{ at: h, hold: 1 }] : []; },
    get fails() { return run.fails; },
  };
}
