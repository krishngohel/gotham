// The detective case engine (item 6). Pure: no three.js, no DOM, nothing allocated per step.
// A case runs through five stages:
//
//   scene        scan and tag evidence: a hero within `reach` m of an evidence point with
//                detective vision on for `hold` s tags it. Any player's scan counts; findings are
//                shared (one run per case, not per player). After `assistAfter` s here, every
//                unfound piece is flagged `hinted` (the runtime pulses its marker and names it in
//                a text hint: clues are never colour-only, each has a glyph word and a label).
//   reconstruct  ordered deduction: put the event cards in order (answer(order)). A wrong order
//                costs only a line; after two, the first card is revealed (the assist).
//   trail        footprints / chemical / tyre: points held in detective vision, in order.
//                radio: visit the receivers (any order, no detective vision needed), then the
//                transmitter's position is triangulated and the hero has to get there.
//   confront     a spec the runtime plays: { kind: 'talk', lines } resolves itself; 'fight',
//                'crime' and 'chain' wait for confrontDone(ok) from the runtime.
//   solved
//
//   const run = createCaseRun(def, { site, saved })   site(id) -> {x,y,z}; saved = store.cases[id]
//   run.step(dt, facts) -> null | 'clue' | 'stage' | 'hint'     facts = { heroes: [{x,y,z,detective,dead}], nHeroes }
//   run.answer(order) -> { ok, wrong, revealed }
//   run.confrontDone(ok); run.toSave() -> { stage, found, trail, solved }
export const CASE_STAGES = ['scene', 'reconstruct', 'trail', 'confront', 'solved'];
export const TRAIL_KINDS = ['footprints', 'chemical', 'tyre', 'radio'];
export const GLYPHS = ['print', 'drop', 'mark', 'object', 'wave'];
export const CASE_RULES = { reach: 3, hold: 1, assistAfter: 90, trailRadius: 4, receiverRadius: 5, targetRadius: 6, yTol: 5 };

// A point spec ({ site, dx, dy, dz } or { x, y, z }) to world coordinates, or null.
export function resolvePoint(p, site) {
  if (!p) return null;
  if (typeof p.site === 'string') {
    const s = site(p.site);
    if (!s) return null;
    return { x: s.x + (p.dx ?? 0), y: (s.y ?? 0) + (p.dy ?? 0), z: s.z + (p.dz ?? 0) };
  }
  if (Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, y: p.y ?? 0, z: p.z };
  return null;
}

// Problems with a case definition ([] when fine). `site` resolves site ids.
export function validateCase(def, site) {
  const out = [];
  const bad = (m) => out.push(`${def?.id ?? '?'}: ${m}`);
  if (!def?.id || !/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(def.id)) bad('id');
  if (!def.title) bad('title');
  if (!resolvePoint({ site: def.scene?.site }, site) && !resolvePoint(def.scene, site)) bad('scene site');
  const ev = def.evidence ?? [];
  if (ev.length < 2) bad('needs 2+ evidence');
  const ids = new Set();
  for (const e of ev) {
    if (ids.has(e.id)) bad(`evidence ${e.id} twice`);
    ids.add(e.id);
    if (!GLYPHS.includes(e.glyph)) bad(`evidence ${e.id} glyph`);
    if (!e.label || !e.text) bad(`evidence ${e.id} label/text`);
    if (!resolvePoint(e.at, site)) bad(`evidence ${e.id} position`);
  }
  const r = def.reconstruct;
  const cards = (r?.cards ?? []).map((c) => c.id);
  if (cards.length < 3 || cards.length > 5) bad('3-5 cards');
  if (!r?.order || r.order.length !== cards.length || new Set(r.order).size !== cards.length || r.order.some((id) => !cards.includes(id))) bad('order is not a permutation of the cards');
  const t = def.trail;
  if (!TRAIL_KINDS.includes(t?.kind)) bad('trail kind');
  else if (t.kind === 'radio') {
    if ((t.receivers ?? []).length < 2 || (t.receivers ?? []).length > 3) bad('radio: 2-3 receivers');
    for (const p of t.receivers ?? []) if (!resolvePoint(p, site)) bad('receiver position');
    if (!resolvePoint(t.target, site)) bad('radio target');
  } else {
    if ((t.points ?? []).length < 2) bad('trail needs 2+ points');
    for (const p of t.points ?? []) if (!resolvePoint(p, site)) bad('trail point position');
  }
  if (!['fight', 'talk', 'crime', 'chain'].includes(def.confront?.kind)) bad('confront kind');
  if (def.confront?.kind !== 'talk' && def.confront?.kind !== 'chain' && !resolvePoint(def.confront?.at, site)) bad('confront position');
  return out;
}

const d2 = (h, p) => Math.hypot(h.x - p.x, h.z - p.z);

export function createCaseRun(def, { site = () => null, saved = null, rules = CASE_RULES } = {}) {
  const R = { ...CASE_RULES, ...rules, ...(def.rules ?? {}) };
  const evidence = def.evidence.map((e, i) => ({ i, id: e.id, glyph: e.glyph, label: e.label, text: e.text, pos: resolvePoint(e.at, site), found: false, held: 0, hinted: false }));
  const t = def.trail;
  const radio = t.kind === 'radio';
  const trailPts = (radio ? t.receivers : t.points).map((p, i) => ({ i, pos: resolvePoint(p, site), done: false, held: 0 }));
  const target = radio ? { pos: resolvePoint(t.target, site), revealed: false, reached: false } : null;
  const confrontPos = resolvePoint(def.confront?.at, site);
  const scenePos = resolvePoint({ site: def.scene.site, dx: def.scene.dx, dz: def.scene.dz }, site) ?? resolvePoint(def.scene, site);
  const order = def.reconstruct.order;

  let stage = 0, sceneT = 0, wrong = 0, revealed = null, trailAt = 0, confronting = false;
  const run = {
    def, evidence, trail: trailPts, target, scenePos, confrontPos,
    lastClue: null,
    get stage() { return stage; },
    get stageName() { return CASE_STAGES[stage]; },
    get solved() { return stage === 4; },
    get wrong() { return wrong; },
    get revealed() { return revealed; },
    get trailIndex() { return trailAt; },
    get foundCount() { let n = 0; for (const e of evidence) if (e.found) n++; return n; },
    get confronting() { return confronting; },
    get sceneTime() { return sceneT; },
  };

  function setStage(s) {
    stage = s;
    if (s === 3) confronting = true;
    return 'stage';
  }

  // Restore a saved run.
  if (saved) {
    for (const id of saved.found ?? []) { const e = evidence.find((x) => x.id === id); if (e) e.found = true; }
    stage = Math.min(saved.solved ? 4 : Math.max(0, saved.stage ?? 0), 4);
    trailAt = Math.min(saved.trail ?? 0, trailPts.length);
    for (let i = 0; i < trailAt; i++) trailPts[i].done = true;
    if (radio && trailAt >= trailPts.length) target.revealed = true;
    if (stage === 0 && evidence.every((e) => e.found)) stage = 1;
    if (stage === 3) confronting = true;
  }

  function heroNear(f, p, r, needDetective) {
    if (!p) return false;
    for (let i = 0; i < f.nHeroes; i++) {
      const h = f.heroes[i];
      if (h.dead || Math.abs(h.y - p.y) > R.yTol || d2(h, p) > r) continue;
      if (needDetective && !h.detective) continue;
      return true;
    }
    return false;
  }

  run.step = (dt, f) => {
    if (stage === 0) {
      sceneT += dt;
      let res = null;
      for (const e of evidence) {
        if (e.found) continue;
        if (heroNear(f, e.pos, R.reach, true)) e.held += dt;
        else e.held = Math.max(0, e.held - dt);
        if (e.held >= R.hold) { e.found = true; e.hinted = false; run.lastClue = e; res = 'clue'; break; }
      }
      if (res) {
        if (evidence.every((e) => e.found)) setStage(1);
        return res;
      }
      if (sceneT >= R.assistAfter) {
        let hinted = false;
        for (const e of evidence) if (!e.found && !e.hinted) { e.hinted = true; hinted = true; }
        if (hinted) return 'hint';
      }
      return null;
    }
    if (stage === 2) {
      if (trailAt < trailPts.length) {
        if (radio) {
          for (const p of trailPts) {
            if (p.done || !heroNear(f, p.pos, R.receiverRadius, false)) continue;
            p.done = true;
            trailAt += 1;
            run.lastClue = p;
            if (trailAt >= trailPts.length) target.revealed = true;
            return 'clue';
          }
          return null;
        }
        const p = trailPts[trailAt];
        if (heroNear(f, p.pos, R.trailRadius, true)) p.held += dt;
        else p.held = Math.max(0, p.held - dt);
        if (p.held < R.hold) return null;
        p.done = true;
        trailAt += 1;
        run.lastClue = p;
        if (trailAt >= trailPts.length) return setStage(3);
        return 'clue';
      }
      if (radio && !target.reached && heroNear(f, target.pos, R.targetRadius, false)) { target.reached = true; return setStage(3); }
      return null;
    }
    return null;
  };

  run.answer = (list) => {
    if (stage !== 1) return { ok: false, wrong, revealed, stage: CASE_STAGES[stage] };
    const ok = Array.isArray(list) && list.length === order.length && list.every((id, i) => id === order[i]);
    if (ok) { setStage(2); return { ok: true, wrong, revealed }; }
    wrong += 1;
    if (wrong >= 2) revealed = order[0];
    return { ok: false, wrong, revealed };
  };

  run.confrontDone = (ok = true) => {
    if (stage !== 3) return false;
    if (!ok) return false;
    confronting = false;
    setStage(4);
    return true;
  };

  // Dev / e2e: finish the current stage at once.
  run.skipStage = () => {
    if (stage === 0) { for (const e of evidence) e.found = true; return setStage(1); }
    if (stage === 1) { run.answer(order.slice()); return 'stage'; }
    if (stage === 2) { for (const p of trailPts) p.done = true; trailAt = trailPts.length; if (target) { target.revealed = true; target.reached = true; } return setStage(3); }
    if (stage === 3) { run.confrontDone(true); return 'stage'; }
    return null;
  };

  // Where the waypoint should point now (null: nowhere in particular).
  run.marker = (from = null) => {
    if (stage === 0) {
      let best = null, bd = Infinity;
      for (const e of evidence) {
        if (e.found || !e.hinted || !e.pos) continue;
        const d = from ? d2(from, e.pos) : 0;
        if (d < bd) { bd = d; best = e.pos; }
      }
      return best ?? scenePos;
    }
    if (stage === 2) {
      if (trailAt < trailPts.length) {
        if (!radio) return trailPts[trailAt].pos;
        let best = null, bd = Infinity;
        for (const p of trailPts) { if (p.done) continue; const d = from ? d2(from, p.pos) : 0; if (d < bd) { bd = d; best = p.pos; } }
        return best;
      }
      return target?.pos ?? null;
    }
    if (stage === 3) return confrontPos ?? scenePos;
    return null;
  };

  run.toSave = () => ({ stage, found: evidence.filter((e) => e.found).map((e) => e.id), trail: trailAt, solved: stage === 4 });
  return run;
}
