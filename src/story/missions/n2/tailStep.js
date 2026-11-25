// [m23] `type: 'carTail'`: follow a car in the Batmobile without being noticed, to wherever it is
// going. It runs the vehicles' own tail (src/vehicles/chases.js startTail: hang back, never too
// close in its mirrors, never so far it is lost) and finishes when the quarry arrives. Spotted or
// lost: the quarry circles and the tail starts again (never a mission failure; a tail is patience).
//
//   { id, type: 'carTail', text, checkpoint, from: siteId, model: 'sedan_deco', nodes: 6, lines,
//     spottedLines, lostLines, arrivedLines }
//
// A `board` step comes first, as before a chase (the player is already driving). Host-only online:
// the quarry is a host-owned chase prop the guest sees (docs/design/vehicles.md 4). With no vehicle
// system (a headless run) the step ends on a short timer.
export function createTailStep(ctx) {
  const { radio, hud, events, site, theGame } = ctx;
  const replica = () => !!ctx.isReplica?.();
  let step = null, live = null, wait = 0, tries = 0, fallback = 0;

  function begin(s) {
    const V = theGame()?.vehicles;
    if (replica()) return;
    if (!V?.chases?.startTail) { fallback = 2; return; }
    // An old save resumed here on foot: the same last resort a chase uses (never the normal path).
    if (!V.active) { V.summon?.('batmobile', { instant: true }); if (V.batmobile) V.enter?.(V.batmobile); }
    const from = site(s.from) ?? null;
    const mine = s;
    live = V.chases.startTail({
      from: from ? { x: from.x, y: from.y ?? 0, z: from.z } : undefined, model: s.model ?? 'sedan_deco', nodes: s.nodes ?? 6,
      onDone: (r) => {
        if (step !== mine) return;
        live = null;
        if (r?.ok !== false) { if (s.arrivedLines?.length) radio?.say(s.arrivedLines); events.emit('storyTailed', { step: s.id }); step = null; ctx.done(mine); return; }
        // No road to start on: do not hold the story for it.
        if (r?.why === 'noRoad') { step = null; ctx.done(mine); return; }
        tries += 1;
        const lines = r?.why === 'spotted' ? s.spottedLines : s.lostLines;
        if (lines?.length) radio?.say([lines[(tries - 1) % lines.length]]);
        hud.card?.(r?.why === 'spotted' ? 'SPOTTED' : 'LOST HIM', r?.why === 'spotted' ? 'Too close. Hang back and pick him up again.' : 'Too far behind. He is circling: pick him up again.', 3200);
        wait = 3;
      },
    });
    if (!live) fallback = 2;
  }
  return {
    enter(s) { step = s; live = null; wait = 0; tries = 0; fallback = 0; begin(s); },
    update(dt, s) {
      if (s !== step) return;
      if (fallback > 0) { fallback -= dt; if (fallback <= 0) { const st = step; step = null; ctx.done(st); } return; }
      if (wait > 0) { wait -= dt; if (wait <= 0) begin(s); }
    },
    marker() { const u = live?.units?.[0]?.t; return u ? { x: u.x, y: u.y ?? 0, z: u.z } : null; },
    exit() { step = null; live = null; },
    onRespawn() {},
    debugSolve() { return []; },
    // Dev and the playthrough: the vehicles' own finish path for whatever chase is running.
    debugAct() { if (!step || replica()) return false; return !!theGame()?.vehicles?.debugWin?.(); },
    get tries() { return tries; },
  };
}
