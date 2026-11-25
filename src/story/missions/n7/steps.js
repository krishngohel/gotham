// [m67] Mission step types first used by Night Seven's added missions.
//
//   tail   follow a car in the Batmobile without being made (vehicles.chases.startTail, the [move]
//          workstream's building block: too close in its mirrors fills the meter, too far for six
//          seconds loses it). Spotted or lost: a line, and the car is picked up again from where
//          the Batmobile is (never a mission fail: a tail you cannot retry on the spot is a wall).
//          { from (where the car pulls out), model 'sedan_deco', nodes 10, lostLines, spottedLines,
//            doneLines }
// Needs the hero at the wheel: the step before it is a `board`. With no vehicle system (a headless
// run) it ends after a moment, as the flow's own async types do.
import { registerMissionStep } from '../stepRegistry.js';
import { isReplica } from '../../../net/mode.js';

registerMissionStep('tail', (ctx) => {
  const { radio, hud, events, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  let step = null, running = null, wait = 0, tries = 0, fallback = 0, finished = false;
  const V = () => theGame()?.vehicles ?? null;
  function begin(s) {
    const v = V();
    const from = tries === 0 ? pos(s.from) : null; // a retry picks the car up near the Batmobile
    running = v.chases.startTail({
      ...(from ? { from: { x: from.x, y: from.y ?? 0, z: from.z } } : {}), model: s.model ?? 'sedan_deco', nodes: s.nodes ?? 10,
      onDone: (r) => {
        running = null;
        if (step !== s || finished) return;
        if (r?.ok !== false) { finished = true; if (s.doneLines?.length) radio?.say(s.doneLines); ctx.done(s); return; }
        tries += 1;
        wait = 3;
        const lines = r.why === 'spotted' ? s.spottedLines : s.lostLines;
        if (lines?.length) radio?.say([lines[(tries - 1) % lines.length]]);
        hud.card?.(r.why === 'spotted' ? 'MADE' : 'LOST HIM', r.why === 'spotted' ? 'He saw the car. Hang further back: Oracle has him again.' : 'Too far behind. Oracle has him again: close up, not too close.', 3200);
      },
    });
    if (!running) wait = 3;
    else events.emit('storyTail', { night: ctx.nightId(), step: s.id, tries });
  }
  return {
    enter(s) { step = s; running = null; wait = 1.2; tries = 0; fallback = 0; finished = false; },
    update(dt, s) {
      if (finished || isReplica()) return;
      const v = V();
      if (!v?.chases?.startTail) { fallback += dt; if (fallback > 2.2) { finished = true; ctx.done(s); } return; }
      if (running) return;
      // At the wheel of the Batmobile, or the tail waits for her to get in.
      if (v.active !== v.batmobile) { hud.setObjective?.(s.boardText ?? 'Back in the Batmobile: the tail is on wheels.'); return; }
      wait -= dt;
      if (wait <= 0) { hud.setObjective?.(s.text ?? ''); begin(s); }
    },
    marker() { return null; },
    exit() { if (running && V()?.chases?.stop) { const id = running.id; running = null; V().chases.stop(id, false); } step = null; },
    onRespawn() {},
    // The scripted players win it through vehicles.debugWin(), the path every chase takes.
    debugSolve() { return []; },
    get tries() { return tries; },
  };
});
