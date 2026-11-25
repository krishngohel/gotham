// Detective cases at run time (item 6): runs one case at a time over the open-world context
// (src/openworld/context.js). Host-only online: findings live in one shared run, so either
// player's scan tags evidence for both. The pure stage logic is engine.js; this file builds the
// facts each frame (allocation-free), draws evidence glints with the story markers (shown while a
// player has detective vision on, or always once the assist has hinted them), talks over the
// radio, saves to progress.openworld.cases and emits:
//
//   caseStart { id, title, pos }       caseMarker { id, pos }        caseClue { id, evidence }
//   caseStage { id, stage }            caseConfront { id, spec, pos } caseSolved { id }
//   caseHint { id, labels }            (the assist: unfound evidence named in text)
import { createCaseRun, CASE_STAGES, resolvePoint } from './engine.js';
import { CASES, caseById } from './data.js';
import { REGION_SITES } from '../../world/regions/data.js';
import { SITES } from '../../world/mapData.js';

const STAGE_TEXT = {
  scene: 'Scan the scene in detective vision',
  reconstruct: 'Reconstruct what happened on the case board',
  trail: 'Follow the trail',
  confront: 'Confront the culprit',
  solved: 'Solved',
};

export function createCases(ow, { cases = CASES } = {}) {
  const store = () => (ow.store.cases ??= {});
  const site = (id) => (typeof id === 'string' ? ow.site(id) ?? REGION_SITES[id] ?? SITES[id] ?? null : id);
  const ground = (p) => {
    if (!p || !ow.collision?.groundBelow) return p;
    const g = ow.collision.groundBelow(p.x, p.y + 3, p.z, 0.3);
    if (g > -Infinity && Math.abs(g - p.y) < 4) p.y = g;
    return p;
  };
  // Reused facts: one record per possible player.
  const facts = { heroes: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, detective: false, dead: true })), nHeroes: 0 };
  let active = null; // { def, run, marks: [], trailMark, targetMark, confrontMark, anyDetective }
  let saveT = 0;

  const unlocked = (def) => {
    if (!def.after) return true;
    const done = ow.progress.campaign?.nightsDone ?? [];
    return done.includes(def.after) || (def.after === 'n1' && !!ow.progress.finished);
  };

  function releaseMarks() {
    if (!active) return;
    for (const m of active.marks) if (m) ow.markers.release(m);
    for (const k of ['trailMark', 'targetMark', 'confrontMark']) if (active[k]) { ow.markers.release(active[k]); active[k] = null; }
    active.marks = [];
  }

  function persist() {
    if (!active) return;
    store()[active.def.id] = active.run.toSave();
    ow.save();
  }

  // Markers for the current stage.
  function placeStageMarks() {
    const { run } = active;
    releaseMarks();
    if (run.stageName === 'scene') active.marks = run.evidence.map((e) => (e.found || !e.pos ? null : ow.markers.place('scan', ground(e.pos))));
    if (run.stageName === 'trail') placeTrailMark();
    if (run.stageName === 'confront' && run.confrontPos) active.confrontMark = ow.markers.place('plate', ground(run.confrontPos));
  }
  function placeTrailMark() {
    const { run } = active;
    if (active.trailMark) { ow.markers.release(active.trailMark); active.trailMark = null; }
    if (active.def.trail.kind === 'radio') {
      active.marks = run.trail.map((p) => (p.done ? null : ow.markers.place('plate', ground(p.pos))));
      if (run.target.revealed && !active.targetMark) active.targetMark = ow.markers.place('scan', ground(run.target.pos));
      return;
    }
    const p = run.trail[run.trailIndex];
    if (p) active.trailMark = ow.markers.place('scan', ground(p.pos));
  }

  function enterStage() {
    const { def, run } = active;
    const name = run.stageName;
    ow.events.emit('caseStage', { id: def.id, stage: name });
    placeStageMarks();
    if (name === 'reconstruct') {
      ow.ui.hint('All the evidence is tagged. Open the case board and put the events in order.', 5000);
      ow.say([{ speaker: 'alfred', text: def.reconstruct.prompt }]);
    } else if (name === 'trail') {
      ow.ui.hint(def.trail.text, 6000);
    } else if (name === 'confront') {
      const spec = def.confront;
      const pos = run.confrontPos ? { ...run.confrontPos } : null;
      if (spec.kind === 'talk') {
        const go = () => { if (active?.run === run && run.stageName === 'confront') { run.confrontDone(true); enterStage(); } };
        Promise.resolve(ow.say(spec.lines ?? [])).then(go, go);
      } else ow.events.emit('caseConfront', { id: def.id, spec, pos });
    } else if (name === 'solved') {
      solved();
      return;
    }
    persist();
  }

  function solved() {
    const { def } = active;
    releaseMarks();
    store()[def.id] = { ...active.run.toSave(), solved: true };
    ow.save();
    ow.events.emit('caseSolved', { id: def.id });
    ow.ui.toast('Case solved', def.title, 5000);
    if (def.solvedLines?.length) ow.say(def.solvedLines);
    ow.reward(def.reward ?? [], { source: 'case', id: def.id });
    active = null;
  }

  function buildFacts() {
    const list = ow.players();
    let n = 0;
    let det = false;
    for (let i = 0; i < list.length && n < facts.heroes.length; i++) {
      const p = list[i], h = p.hero, f = facts.heroes[n];
      if (!h || h.dead) continue;
      f.x = h.pos.x; f.y = h.pos.y; f.z = h.pos.z; f.dead = false;
      f.detective = !!ow.detective(p);
      if (f.detective) det = true;
      n++;
    }
    facts.nHeroes = n;
    return det;
  }

  const api = {
    cases,
    list() {
      return cases.map((def) => {
        const s = store()[def.id];
        return { id: def.id, title: def.title, district: def.district, chain: def.chain ?? null, blurb: def.blurb, unlocked: unlocked(def), solved: !!s?.solved, stage: s?.solved ? 'solved' : CASE_STAGES[s?.stage ?? 0], active: active?.def.id === def.id };
      });
    },
    get active() { return active ? { id: active.def.id, def: active.def, run: active.run, stage: active.run.stageName } : null; },
    // Begins (or resumes) a case at its scene. A solved case replays from the start.
    start(id) {
      const def = caseById(id) ?? cases.find((c) => c.id === id);
      if (!def) return false;
      if (active) api.stop();
      const saved = store()[id];
      const run = createCaseRun(def, { site, saved: saved?.solved ? null : saved });
      active = { def, run, marks: [], trailMark: null, targetMark: null, confrontMark: null, hinted: false };
      const pos = run.scenePos ? { ...run.scenePos } : null;
      ow.events.emit('caseStart', { id, title: def.title, pos });
      ow.events.emit('caseMarker', { id, pos });
      if (run.stageName === 'scene') ow.say(def.intro ?? []);
      enterStage();
      return true;
    },
    stop() { releaseMarks(); persist(); active = null; },
    update(dt) {
      if (!active) return;
      const det = buildFacts();
      const { run } = active;
      const before = run.stage;
      const r = run.step(dt, facts);
      if (r === 'clue') {
        const c = run.lastClue;
        if (run.stageName === 'scene' || before === 0) {
          const i = run.evidence.indexOf(c);
          if (i >= 0 && active.marks[i]) { ow.markers.flash(active.marks[i]); ow.markers.release(active.marks[i]); active.marks[i] = null; }
          ow.events.emit('caseClue', { id: active.def.id, evidence: c.id });
          ow.ui.hint(`${c.label}: ${c.text}`, 6000);
        } else {
          ow.events.emit('caseClue', { id: active.def.id, evidence: `trail${c.i}` });
          if (active.def.trail.kind === 'radio') {
            const i = run.trail.indexOf(c);
            if (active.marks[i]) { ow.markers.release(active.marks[i]); active.marks[i] = null; }
            ow.ui.hint(run.target.revealed ? 'Bearings cross. The transmitter is marked.' : `Bearing taken (${run.trailIndex}/${run.trail.length}).`, 4000);
          } else ow.ui.hint(`Trail ${run.trailIndex}/${run.trail.length}`, 2500);
          placeTrailMark();
        }
        persist();
      } else if (r === 'hint') {
        const labels = run.evidence.filter((e) => !e.found).map((e) => e.label);
        ow.events.emit('caseHint', { id: active.def.id, labels });
        ow.ui.hint(`Still to find: ${labels.join('; ')}`, 7000);
        active.marks.forEach((m) => m && ow.markers.flash(m));
      }
      if (!active) return;
      if (run.stage !== before) { enterStage(); return; }
      // Evidence glints: drawn while a player is looking in detective vision, or once hinted.
      if (run.stageName === 'scene') {
        for (let i = 0; i < active.marks.length; i++) {
          const m = active.marks[i];
          if (m?.mesh) m.mesh.visible = det || run.evidence[i].hinted;
        }
      }
      saveT += dt;
      if (saveT > 10) { saveT = 0; persist(); }
    },
    answer(order) {
      if (!active) return { ok: false, wrong: 0, revealed: null };
      const res = active.run.answer(order);
      if (res.ok) enterStage();
      else if (res.stage == null) {
        ow.say([{ speaker: 'alfred', text: res.revealed ? `It doesn't hang together yet, sir. Start from this: "${active.def.reconstruct.cards.find((c) => c.id === res.revealed)?.text}"` : 'That order doesn\'t fit the evidence, sir. Try again.' }]);
      }
      return res;
    },
    confrontDone(ok = true) {
      if (!active || active.run.stageName !== 'confront') return false;
      if (!ok) { ow.ui.hint('They got away from the confrontation. Try again.', 4000); ow.events.emit('caseConfront', { id: active.def.id, spec: active.def.confront, pos: active.run.confrontPos }); return false; }
      active.run.confrontDone(true);
      enterStage();
      return true;
    },
    debugSolveStage() {
      if (!active) return null;
      const before = active.run.stage;
      active.run.skipStage();
      if (active.run.stage !== before) enterStage();
      return active?.run.stageName ?? 'solved';
    },
    debugSolve() {
      for (let i = 0; i < 8 && active; i++) api.debugSolveStage();
      return !active;
    },
    marker() {
      if (!active) return null;
      const h = ow.heroes()[0];
      return active.run.marker(h?.pos ?? null);
    },
    hud() {
      if (!active) return null;
      const { def, run } = active;
      const name = run.stageName;
      let text = STAGE_TEXT[name], meter = null;
      if (name === 'scene') { text = `${STAGE_TEXT.scene} (${run.foundCount}/${run.evidence.length})`; meter = run.foundCount / run.evidence.length; }
      else if (name === 'trail') {
        const radio = def.trail.kind === 'radio';
        text = radio ? (run.target.revealed ? 'Get to the transmitter' : `Take bearings (${run.trailIndex}/${run.trail.length})`) : `Follow the ${def.trail.kind} trail (${run.trailIndex}/${run.trail.length})`;
        meter = run.trail.length ? run.trailIndex / run.trail.length : 1;
      }
      return { title: def.title, text, meter, stage: name };
    },
    // Resolved world position of a case's scene (map, Batcomputer).
    scenePos(id) { const d = caseById(id); return d ? resolvePoint({ site: d.scene.site }, site) : null; },
  };
  return api;
}
