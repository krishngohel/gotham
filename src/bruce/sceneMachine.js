// The Bruce-day scene interpreter (workstream K). Pure: a scene is data (src/bruce/scenes/*.js) and
// this walks it, applying effects to the double-life state. The runtime (src/bruce/runtime.js)
// only renders what the machine says and feeds it the player's choices, arrivals and the clock, so
// every scene can be played to each of its outcomes headlessly in the unit tests.
//
// SCENE DATA
//   { id, title, blurb, venue: { pocket, room }, outfit, hour, cast: [{ id, name, look, at }],
//     commitment: type (calendar.js), start: nodeId, nodes: { [id]: Node } }
// NODES (every node but 'end' names its `next`)
//   line     { lines: [Line], next }                      Line = { s: speaker id, t: text, a?: clip }
//   event    { event: 'batsignal' | 'phone' | 'caveAlarm' | 'scanner' | 'cut', lines?, next }
//   choice   { prompt?, who?, options: [Option] }
//            Option = { id, tag: charm | deflect | honest | act | sharp | plain, text, req?, excuse?,
//                       effects?, say?: [Line], next }
//   pressure { prompt, seconds, lines?, stay: Branch, slip: Branch, timeout: 'stay' | 'slip',
//              cover?: { cost, seconds, say?: [Line] } }    Branch = { text, effects?, say?, next }
//            The stay-or-slip-away decision under time pressure. cover() is Alfred buying minutes
//            (it costs his patience thread); assist() is the co-op partner buying a few seconds once.
//   goto     { prompt, target: { id, room?, station?, x?, z?, radius? }, seconds?, next, late? }
//            Walk somewhere in the room before the time runs out (late = where a timeout goes).
//   inspect  { prompt, spots: [{ id, label, clue?, effects? }], need, seconds?, next, late? }
//   branch   { cases: [{ if: Cond, next }], else }
//            Cond = { fatigueAbove, fatigueBelow, standingAbove, standingBelow, cityBelow, flag,
//                     noFlag, thread: { id: rank }, finishersAbove, injured, suspicionAbove: { w: n },
//                     outfit: [ids] }
//   end      { outcome, title, summary, effects?, lines?, night?: { flags } }
import { applyEffects, useExcuse, optionAvailable, threadRank, injured } from './doubleLife.js';

export const NODE_TYPES = Object.freeze(['line', 'event', 'choice', 'pressure', 'goto', 'inspect', 'branch', 'end']);
export const TAGS = Object.freeze(['charm', 'deflect', 'honest', 'act', 'sharp', 'plain']);
export const EVENTS = Object.freeze(['batsignal', 'phone', 'caveAlarm', 'scanner', 'cut', 'toast', 'sleep', 'outfit']);
export const EFFECT_KEYS = Object.freeze(['standing', 'city', 'fatigue', 'patience', 'suspicion', 'threads', 'injuries', 'flags', 'open', 'close', 'credit', 'freeze', 'ship']);

export function testCond(cond = {}, state, ctx = {}) {
  if (typeof cond.fatigueAbove === 'number' && !(state.fatigue > cond.fatigueAbove)) return false;
  if (typeof cond.fatigueBelow === 'number' && !(state.fatigue < cond.fatigueBelow)) return false;
  if (typeof cond.standingAbove === 'number' && !(state.standing > cond.standingAbove)) return false;
  if (typeof cond.standingBelow === 'number' && !(state.standing < cond.standingBelow)) return false;
  if (typeof cond.cityBelow === 'number' && !(state.city < cond.cityBelow)) return false;
  if (cond.flag && !state.flags[cond.flag]) return false;
  if (cond.noFlag && state.flags[cond.noFlag]) return false;
  for (const [id, r] of Object.entries(cond.thread ?? {})) if (threadRank(state, id) < r) return false;
  if (typeof cond.finishersAbove === 'number' && !((state.lastNight?.finishers ?? 0) > cond.finishersAbove)) return false;
  if (cond.injured === true && !injured(state)) return false;
  if (cond.injured === false && injured(state)) return false;
  for (const [w, n] of Object.entries(cond.suspicionAbove ?? {})) if (!(state.suspicion[w] > n)) return false;
  if (Array.isArray(cond.outfit) && !cond.outfit.includes(ctx.outfit)) return false;
  return true;
}

export function createSceneMachine(def, { life, outfit = def.outfit ?? 'suit', coop = false } = {}) {
  const ctx = { outfit };
  const m = {
    def, nodeId: null, node: null, done: false, outcome: null, changes: [],
    timer: 0, timerMax: 0, covered: 0, assisted: false, said: [], chosen: [], found: [],
    get life() { return life; },
  };
  const apply = (effects, reason) => { if (effects) m.changes.push(...applyEffects(life, effects, reason)); };
  function enter(id) {
    // Branches resolve on entry, so the runtime never sees one.
    let guard = 0;
    while (guard++ < 32) {
      const n = def.nodes[id];
      if (!n) throw new Error(`scene ${def.id}: no node ${id}`);
      if (n.type === 'branch') {
        const hit = n.cases.find((c) => testCond(c.if, life, ctx));
        id = hit ? hit.next : n.else;
        continue;
      }
      m.nodeId = id; m.node = n;
      m.timer = n.seconds ?? 0; m.timerMax = m.timer; m.covered = 0; m.found = [];
      if (n.type === 'end') {
        m.done = true; m.outcome = n.outcome;
        apply(n.effects, `${def.title}: ${n.title ?? n.outcome}`);
        if (n.night?.flags) apply({ flags: n.night.flags }, `${def.title}: tonight`);
        life.scenes[def.id] = n.outcome;
      }
      return n;
    }
    throw new Error(`scene ${def.id}: branch loop`);
  }
  function go(next) { if (!m.done) enter(next); }

  Object.assign(m, {
    start() { enter(def.start); return m; },
    // Lines to show for this node (line, event, end; a pressure's interruption lines).
    lines() { return m.node?.lines ?? []; },
    // line / event: done reading.
    next() { if (m.node && (m.node.type === 'line' || m.node.type === 'event')) go(m.node.next); },
    options() {
      if (m.node?.type !== 'choice') return [];
      return m.node.options.map((o) => {
        const a = optionAvailable(life, o, { outfit, who: o.who ?? m.node.who });
        return { id: o.id, text: o.text, tag: o.tag, ok: a.ok, reason: a.reason, worn: !!a.worn };
      });
    },
    choose(id) {
      if (m.node?.type !== 'choice') return null;
      const o = m.node.options.find((x) => x.id === id);
      if (!o) return null;
      if (!optionAvailable(life, o, { outfit, who: o.who ?? m.node.who }).ok) return null;
      m.chosen.push(id);
      if (o.excuse) {
        const r = useExcuse(life, o.excuse, o.who ?? m.node.who ?? 'guest', { visible: injured(life) });
        m.changes.push(...r.changes);
      }
      apply(o.effects, `${def.title}: ${o.tag === 'act' ? 'the playboy act' : o.tag} ("${o.text}")`);
      m.said = o.say ?? [];
      go(o.next);
      return o;
    },
    // ---- pressure ----
    stay() { if (m.node?.type !== 'pressure') return; const b = m.node.stay; m.chosen.push('stay'); apply(b.effects, `${def.title}: stayed`); m.said = b.say ?? []; go(b.next); },
    slip() { if (m.node?.type !== 'pressure') return; const b = m.node.slip; m.chosen.push('slip'); apply(b.effects, `${def.title}: slipped away`); m.said = b.say ?? []; go(b.next); },
    // Alfred covers: more time, at his patience. Refused once his patience is gone.
    canCover() { return m.node?.type === 'pressure' && !!m.node.cover && life.patience > m.node.cover.cost && m.covered < 2; },
    cover() {
      if (!m.canCover()) return false;
      const c = m.node.cover;
      m.covered += 1;
      m.timer += c.seconds; m.timerMax = Math.max(m.timerMax, m.timer);
      apply({ patience: -c.cost, threads: { alfred: -0.15 } }, `${def.title}: Alfred covered for you`);
      m.said = c.say ?? [];
      return true;
    },
    // The co-op partner buys a little time once per scene (a spilled tray, a question to the room).
    assist() {
      if (!coop || m.assisted || !(m.node?.type === 'pressure' || m.node?.type === 'goto')) return false;
      m.assisted = true;
      m.timer += 10; m.timerMax = Math.max(m.timerMax, m.timer);
      apply({ threads: { ward: 0.3 } }, `${def.title}: your partner made a scene`);
      return true;
    },
    // ---- goto / inspect ----
    reach(id) {
      if (m.node?.type !== 'goto' || m.node.target.id !== id) return false;
      go(m.node.next);
      return true;
    },
    inspect(id) {
      if (m.node?.type !== 'inspect' || m.found.includes(id)) return false;
      const s = m.node.spots.find((x) => x.id === id);
      if (!s) return false;
      m.found.push(id);
      apply(s.effects, `${def.title}: noticed ${s.label}`);
      m.said = s.clue ? [{ s: 'bruce', t: s.clue }] : [];
      if (m.found.length >= (m.node.need ?? m.node.spots.length)) go(m.node.next);
      return true;
    },
    // Real seconds. Only the timed nodes (pressure, goto, inspect with seconds) count down.
    tick(dt) {
      if (m.done || !m.node || !(m.timerMax > 0)) return;
      const t = m.node.type;
      if (t !== 'pressure' && t !== 'goto' && t !== 'inspect') return;
      m.timer -= dt;
      if (m.timer > 0) return;
      m.timer = 0;
      if (t === 'pressure') { if (m.node.timeout === 'slip') m.slip(); else m.stay(); }
      else go(m.node.late ?? m.node.next);
    },
  });
  return m;
}

// Every problem with a scene's data (empty = good): dangling nexts, unreachable nodes, unknown
// speakers, tags, events and effect keys, a pressure without both choices, fewer than two endings.
export function validateScene(def, { speakers = [] } = {}) {
  const out = [];
  const ids = Object.keys(def.nodes ?? {});
  const known = new Set(['bruce', 'alfred', 'narrator', ...speakers, ...(def.cast ?? []).map((c) => c.id)]);
  if (!def.id || !def.title) out.push('missing id or title');
  if (!def.nodes?.[def.start]) out.push(`start ${def.start} missing`);
  const nexts = (n) => {
    switch (n.type) {
      case 'line': case 'event': return [n.next];
      case 'choice': return n.options.map((o) => o.next);
      case 'pressure': return [n.stay?.next, n.slip?.next];
      case 'goto': case 'inspect': return [n.next, n.late].filter(Boolean);
      case 'branch': return [...n.cases.map((c) => c.next), n.else];
      default: return [];
    }
  };
  const lines = (n) => [...(n.lines ?? []), ...(n.options ?? []).flatMap((o) => o.say ?? []), ...(n.stay?.say ?? []), ...(n.slip?.say ?? []), ...(n.cover?.say ?? [])];
  const effects = (n) => [n.effects, ...(n.options ?? []).map((o) => o.effects), n.stay?.effects, n.slip?.effects, ...(n.spots ?? []).map((s) => s.effects)].filter(Boolean);
  for (const [id, n] of Object.entries(def.nodes ?? {})) {
    if (!NODE_TYPES.includes(n.type)) { out.push(`${id}: unknown type ${n.type}`); continue; }
    for (const x of nexts(n)) if (!def.nodes[x]) out.push(`${id}: next ${x} missing`);
    for (const l of lines(n)) {
      if (!known.has(l.s)) out.push(`${id}: unknown speaker ${l.s}`);
      if (typeof l.t !== 'string' || !l.t.trim()) out.push(`${id}: empty line`);
    }
    for (const e of effects(n)) for (const k of Object.keys(e)) if (!EFFECT_KEYS.includes(k)) out.push(`${id}: unknown effect ${k}`);
    if (n.type === 'choice') {
      if (!n.options?.length) out.push(`${id}: no options`);
      const oids = new Set();
      for (const o of n.options ?? []) {
        if (oids.has(o.id)) out.push(`${id}: duplicate option ${o.id}`);
        oids.add(o.id);
        if (!TAGS.includes(o.tag)) out.push(`${id}.${o.id}: unknown tag ${o.tag}`);
        if (!o.text) out.push(`${id}.${o.id}: no text`);
      }
      // Never a dead end: at least one option needs nothing.
      if (!(n.options ?? []).some((o) => !o.req && o.tag !== 'sharp')) out.push(`${id}: every option is gated`);
    }
    if (n.type === 'pressure') {
      if (!n.stay || !n.slip) out.push(`${id}: pressure needs stay and slip`);
      if (!(n.seconds > 0)) out.push(`${id}: pressure needs seconds`);
      if (!['stay', 'slip'].includes(n.timeout)) out.push(`${id}: timeout must be stay or slip`);
    }
    if (n.type === 'event' && !EVENTS.includes(n.event)) out.push(`${id}: unknown event ${n.event}`);
    if (n.type === 'inspect' && !(n.spots?.length)) out.push(`${id}: no spots`);
    if (n.type === 'goto' && !n.target?.id) out.push(`${id}: goto needs target.id`);
    if (n.type === 'branch' && !def.nodes[n.else]) out.push(`${id}: branch needs else`);
  }
  // Reachability from start.
  const seen = new Set();
  const stack = [def.start];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id) || !def.nodes[id]) continue;
    seen.add(id);
    for (const x of nexts(def.nodes[id])) stack.push(x);
  }
  for (const id of ids) if (!seen.has(id)) out.push(`${id}: unreachable`);
  const outcomes = new Set(ids.filter((id) => def.nodes[id].type === 'end').map((id) => def.nodes[id].outcome));
  if (outcomes.size < 2) out.push('needs at least two outcomes');
  if (!ids.some((id) => def.nodes[id].type === 'pressure')) out.push('needs a stay-or-slip pressure node');
  return out;
}
