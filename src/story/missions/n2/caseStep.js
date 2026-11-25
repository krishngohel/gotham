// [m23] A detective case as a main-path step: `type: 'case'`. It runs the open world's pure case
// engine (src/openworld/cases/engine.js) on a case written inside the night file, and draws the
// same case board (src/openworld/cases/board.js) for the deduction:
//
//   scene        tag every piece of evidence in detective vision (any player's scan counts)
//   reconstruct  the case board: put the event cards in the order they happened
//   trail        follow it: footprints / chemical / tyre points held in detective vision in order,
//                or `radio`: take a bearing at each receiver, then go to where the bearings cross
//
//   { id, type: 'case', text, checkpoint, lines, case: {
//       title, blurb, scene: siteId, assistAfter?,
//       evidence: [{ id, at: { site, dx, dz } | siteId, glyph, label, text, lines? }],
//       reconstruct: { prompt, cards: [{ id, text }], order: [ids], lines? },
//       trail: { kind, text, points: [...] } | { kind: 'radio', text, receivers: [...], target },
//       solvedLines } }
//
// The step has no `site` of its own (flow's reach check would finish it): the marker comes from the
// case. Flow rules: the board never pops on a marker. The last clue's line plays, then the prompt,
// then the board opens after a beat; closed unsolved, turning detective vision on opens it again.
// Online: the host's run is the one that counts (a guest's copy draws its own markers and never
// opens the board); split screen shares one board, as the open world's cases do.
import { createCaseRun, validateCase, GLYPHS } from '../../../openworld/cases/engine.js';
import { createCaseBoard } from '../../../openworld/cases/board.js';

export const BOARD_BEAT_MS = 2200;
const STAGE_TEXT = { scene: 'Scan the scene in detective vision', reconstruct: 'Put the events in order on the case board', trail: 'Follow the trail' };

const point = (p) => (typeof p === 'string' ? { site: p } : p);

// The engine's definition for a step's case (pure; the night tests validate it).
export function caseDefOf(step) {
  const c = step.case ?? {};
  const t = c.trail ?? {};
  return {
    id: step.id, title: c.title, blurb: c.blurb ?? '',
    scene: { site: c.scene },
    evidence: (c.evidence ?? []).map((e) => ({ ...e, at: point(e.at) })),
    reconstruct: c.reconstruct,
    trail: t.kind === 'radio'
      ? { kind: 'radio', text: t.text, receivers: (t.receivers ?? []).map(point), target: point(t.target) }
      : { kind: t.kind, text: t.text, points: (t.points ?? []).map(point) },
    // The story's next step is the confrontation: the case itself ends where the trail does.
    confront: { kind: 'talk', lines: [] },
    rules: { assistAfter: c.assistAfter ?? 45 },
  };
}

// Problems with a case step ([] when fine): the engine's own checks plus the story's.
export function validateCaseStep(step, site) {
  const out = validateCase(caseDefOf(step), site);
  if (step.site) out.push(`${step.id}: a case step takes no site (use case.scene)`);
  for (const e of step.case?.evidence ?? []) if (!GLYPHS.includes(e.glyph)) out.push(`${step.id}: evidence ${e.id} glyph`);
  return out;
}

// Every site id a case step names (the night tests resolve them).
export function caseSites(step) {
  const c = step.case ?? {}, t = c.trail ?? {};
  const ids = [c.scene, ...(c.evidence ?? []).map((e) => point(e.at)?.site), ...(t.points ?? []).map((p) => point(p)?.site), ...(t.receivers ?? []).map((p) => point(p)?.site), point(t.target)?.site];
  return ids.filter((x) => typeof x === 'string');
}

export function createCaseStep(ctx) {
  const { markers, radio, hud, events, site, theGame } = ctx;
  const replica = () => !!ctx.isReplica?.();
  const facts = { heroes: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, detective: false, dead: true })), nHeroes: 0 };
  let step = null, def = null, run = null, marks = [], trailMarks = [], targetMark = null;
  let board = null, boardAt = 0, shownStage = -1, wasDetective = false, answered = false;

  const detectiveOf = (p) => {
    const G = theGame();
    return p?.slot === 0 || p?.hero === ctx.hero ? !!G?.state?.detectiveOn : !!p?.rig?.detectiveOn;
  };
  function buildFacts() {
    const list = ctx.players?.() ?? [{ hero: ctx.hero, slot: 0 }];
    // A partner standing at a clue counts while anyone's detective vision is on (the scan step's rule).
    let any = false;
    for (const p of list) if (detectiveOf(p)) any = true;
    let n = 0;
    for (let i = 0; i < list.length && n < facts.heroes.length; i++) {
      const h = list[i].hero, f = facts.heroes[n];
      if (!h || h.dead) continue;
      f.x = h.pos.x; f.y = h.pos.y; f.z = h.pos.z; f.dead = false; f.detective = any;
      n++;
    }
    facts.nHeroes = n;
    return any;
  }
  function ground(p) {
    const y = ctx.collision?.groundBelow?.(p.x, p.y + 3, p.z, 0.3);
    if (y > -Infinity && Math.abs(y - p.y) < 4) p.y = y;
    return p;
  }

  // What the board draws from (the open world's cases object, for one case).
  const adapter = {
    get active() { return run ? { id: def.id, def, run, stage: run.stageName } : null; },
    hud() { return run ? { title: def.title, text: objective(), stage: run.stageName } : null; },
    answer(order) {
      if (!run) return { ok: false, wrong: 0, revealed: null };
      const res = run.answer(order);
      if (res.ok) { answered = true; setTimeout(() => board?.close(), 900); }
      else if (res.stage == null) {
        const first = def.reconstruct.cards.find((c) => c.id === res.revealed)?.text;
        radio?.say([{ speaker: 'alfred', portrait: 'alfred', text: first ? `It does not hang together yet, sir. Start from this: "${first}"` : 'That order does not fit the evidence, sir. Try again.' }]);
      }
      return res;
    },
  };
  function openBoard() {
    if (replica() || typeof document === 'undefined' || !run || run.stageName !== 'reconstruct') return;
    board ??= createCaseBoard({ root: document.body, cases: adapter, onClose: closed });
    if (board.isOpen) return;
    // The world keeps running (a partner may be walking about); player one's keys go to the board.
    theGame()?.input?.setEnabled?.(false);
    board.open();
  }
  function closed() {
    theGame()?.input?.setEnabled?.(true);
    if (run?.stageName === 'reconstruct') hud.hint?.('Case board closed. Turn detective vision on to open it again.', 5000);
  }

  function objective() {
    if (!run) return step?.text ?? '';
    const name = run.stageName;
    if (name === 'scene') return `${STAGE_TEXT.scene} (${run.foundCount}/${run.evidence.length})`;
    if (name === 'reconstruct') return STAGE_TEXT.reconstruct;
    if (name === 'trail') {
      if (def.trail.kind !== 'radio') return `${def.trail.text} (${run.trailIndex}/${run.trail.length})`;
      return run.target.revealed ? 'The bearings cross. Get to the transmitter.' : `${def.trail.text} (${run.trailIndex}/${run.trail.length})`;
    }
    return step?.text ?? '';
  }
  function releaseMarks() {
    for (const m of [...marks, ...trailMarks, targetMark]) if (m) markers.release(m);
    marks = []; trailMarks = []; targetMark = null;
  }
  function placeTrail() {
    for (const m of trailMarks) if (m) markers.release(m);
    trailMarks = [];
    if (def.trail.kind === 'radio') {
      trailMarks = run.trail.map((p) => (p.done || !p.pos ? null : markers.place('plate', ground(p.pos))));
      if (run.target.revealed && !targetMark && run.target.pos) targetMark = markers.place('scan', ground(run.target.pos));
      return;
    }
    const p = run.trail[run.trailIndex];
    if (p?.pos) trailMarks = [markers.place('scan', ground(p.pos))];
  }
  function enterStage() {
    const name = run.stageName;
    shownStage = run.stage;
    events.emit('storyCaseStage', { step: step.id, stage: name });
    hud.setObjective?.(objective());
    if (name === 'reconstruct') {
      for (const m of marks) if (m) markers.release(m);
      marks = [];
      const lines = def.reconstruct.lines ?? [{ speaker: 'alfred', portrait: 'alfred', text: def.reconstruct.prompt }];
      radio?.say(lines);
      boardAt = BOARD_BEAT_MS / 1000;
    } else if (name === 'trail') {
      if (step.case.trailLines?.length) radio?.say(step.case.trailLines);
      placeTrail();
    } else if (name === 'confront' || name === 'solved') {
      // The trail's end is the case's end here: the next step takes it from there.
      releaseMarks();
      events.emit('caseSolved', { step: step.id });
      if (step.case.solvedLines?.length) radio?.say(step.case.solvedLines);
      const s = step;
      run = null;
      ctx.done(s);
    }
  }

  return {
    enter(s) {
      step = s; def = caseDefOf(s);
      run = createCaseRun(def, { site });
      answered = false; boardAt = 0; wasDetective = false;
      marks = run.evidence.map((e) => (e.pos ? markers.place('scan', ground(e.pos)) : null));
      for (const m of marks) if (m?.mesh) m.mesh.visible = false;
      shownStage = run.stage;
      hud.setObjective?.(objective());
      ctx.prompts?.show?.(['detective']);
    },
    update(dt, s) {
      if (!run || s !== step) return;
      const det = buildFacts();
      const before = run.stage;
      const r = run.step(dt, facts);
      if (r === 'clue') {
        const c = run.lastClue;
        if (before === 0) {
          const i = run.evidence.indexOf(c);
          if (marks[i]) { markers.flash(marks[i]); markers.release(marks[i]); marks[i] = null; }
          events.emit('caseClue', { step: s.id, evidence: c.id });
          const lines = s.case.evidence[i]?.lines;
          if (lines?.length) radio?.say(lines);
          for (const h of hud.all?.() ?? [hud]) h.chip?.(`case:${s.id}:${c.id}`, `${c.label}`, 'checkpoint');
        } else {
          events.emit('caseClue', { step: s.id, evidence: `trail${c.i}` });
          placeTrail();
        }
        hud.setObjective?.(objective());
      } else if (r === 'hint') {
        const labels = run.evidence.filter((e) => !e.found).map((e) => e.label);
        hud.hint?.(`Still to find: ${labels.join('; ')}`, 7000);
        for (const m of marks) if (m) markers.flash(m);
      }
      if (!run) return;
      if (run.stage !== shownStage) { enterStage(); return; }
      const name = run.stageName;
      if (name === 'scene') {
        // Evidence glints show in detective vision, or once the assist has named them.
        for (let i = 0; i < marks.length; i++) { const m = marks[i]; if (m?.mesh) m.mesh.visible = det || run.evidence[i].hinted; }
      } else if (name === 'reconstruct') {
        if (boardAt > 0) { boardAt -= dt; if (boardAt <= 0) openBoard(); }
        else if (det && !wasDetective && !board?.isOpen) openBoard();
      }
      wasDetective = det;
    },
    marker() {
      if (!run) return null;
      return run.marker(ctx.hero?.pos ?? null);
    },
    exit() {
      releaseMarks();
      if (board?.isOpen) board.close();
      run = null; step = null; def = null;
    },
    onRespawn() {},
    // Dev, the playthrough and the night simulator: where to stand next (detective vision on), and
    // the one thing standing somewhere cannot do (the board's answer, through the board's own path).
    debugSolve() {
      if (!run) return [];
      if (run.stageName === 'scene') return run.evidence.filter((e) => !e.found && e.pos).map((e) => ({ at: e.pos, hold: 1.8, detective: true }));
      if (run.stageName === 'trail') {
        if (def.trail.kind === 'radio') return [...run.trail.filter((p) => !p.done).map((p) => ({ at: p.pos, hold: 0.6 })), { at: run.target.pos, hold: 0.8 }];
        return run.trail.slice(run.trailIndex).map((p) => ({ at: p.pos, hold: 1.8, detective: true }));
      }
      return [];
    },
    debugAct() {
      if (!run || run.stageName !== 'reconstruct' || answered || replica()) return false;
      if (board?.isOpen) { for (const id of def.reconstruct.order) board.pick(id); board.submit(); }
      else adapter.answer(def.reconstruct.order.slice());
      return true;
    },
    get run() { return run; },
    get boardOpen() { return !!board?.isOpen; },
  };
}
