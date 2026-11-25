// Collectibles and activities at run time (on the open-world context, src/openworld/context.js):
// hides picked up by walking onto them (some gadget-gated), riddles answered at their landmark
// (detective vision held for the `scan` ones), audio logs that play once, photo spots counted on
// 'photoSaved', trials (glide rings, El and rooftop runs, combat maps) and the post-game contracts.
// Host-only online like the rest of the open world; a guest draws from the events:
//   'collectible' { kind, id, pos }      (audio plays the pickup; credited to data.player)
//   'collectibleHint' { id, kind, pos }  once per item when a hero first comes within 80 m (map pins)
//   'trialStart' { id, kind, start }     'trialDone' { id, ok, value, medal, newBest }
//   'contractStart' { id, tier, modifiers }  'contractDone' { id, ok, tier }
// No allocation per frame: proximity checks run at 5 Hz over preresolved points.
import { RIDDLES, HIDES, LOGS, PHOTOS, TRIALS, KINDS, COLLECTIBLES, placeOf } from './data.js';
import { createRingRun, createCheckpointRun, createArenaScore, recordResult, formatResult } from '../../game/challenges.js';
import { contractUnlocked, nextContract, recordContract, MODIFIERS } from './contracts.js';
import { GADGETS } from '../../gadgets/gadgetDefs.js';
import { withPlayer } from '../../core/events.js';

const HINT_RANGE = 80, PICK = 2.4, LOG_R = 6, SCAN_HOLD = 1;
const XP = { riddles: 75, hides: 100, logs: 40, photos: 50, medal: { bronze: 100, silver: 200, gold: 300 } };
const STORE_KEY = { riddles: 'riddles', hides: 'hides', logs: 'logs', photos: 'photos' };
const gadgetName = (id) => GADGETS.find((g) => g.id === id)?.name ?? id;

export function createCollectibles(ow, { devContracts = false } = {}) {
  const { events } = ow;
  const C = () => ow.store.collect;
  const found = (kind, id) => C()[STORE_KEY[kind]].includes(id);
  // Preresolved points: [{ kind, item, pos }].
  const items = [];
  for (const kind of KINDS) for (const item of COLLECTIBLES[kind]) { const pos = placeOf(kind, item); if (pos) items.push({ kind, item, pos, hinted: false, scan: 0, gateT: 0 }); }
  let tick = 0;
  let trial = null; // { def, run, score, t, prev: {x,y,z}[], done }
  let contract = null; // { def, t, ok }
  const prev = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];

  const hasGadget = (id) => {
    const p = ow.progress;
    return !id || !!p.finished || (p.gadgets?.unlocked ?? []).includes(id) || (p.campaign?.nightsDone ?? []).includes('n1');
  };

  function collect(kind, item, player, pos) {
    const list = C()[STORE_KEY[kind]];
    if (list.includes(item.id)) return false;
    list.push(item.id);
    const it = items.find((x) => x.item === item);
    if (it?.mark) { ow.markers?.release(it.mark); it.mark = null; }
    ow.save();
    events.emit('collectible', withPlayer({ kind, id: item.id, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null }, player));
    ow.xp(XP[kind], `collect:${kind}`);
    const total = COLLECTIBLES[kind].length, n = list.length;
    if (kind === 'riddles') ow.ui.toast('Riddle answered', `${item.riddle.split('.')[0]}... (${n}/${total})`, 4500);
    else if (kind === 'hides') ow.ui.toast('Cache found', `A stash the crews thought was safe. (${n}/${total})`, 4500);
    else if (kind === 'photos') ow.ui.toast('Photo spot', `${item.subject}. (${n}/${total})`, 4500);
    else if (kind === 'logs') ow.ui.toast('City story', `${item.title} (${n}/${total})`, 4000);
    if (n === total) {
      if (kind === 'riddles') ow.reward(['lore:riddleMap']);
      if (kind === 'logs') ow.reward(['lore:cityStories']);
      if (kind === 'hides') ow.reward(['xp:500']);
      if (kind === 'photos') ow.reward(['lore:photoAlbum']);
    }
    return true;
  }

  function proximity(dt) {
    const players = ow.players();
    for (const it of items) {
      if (found(it.kind, it.item.id)) continue;
      let near = null, nearD = Infinity, nearP = null;
      for (const p of players) {
        const h = p.hero;
        if (!h || h.dead) continue;
        const d = Math.hypot(h.pos.x - it.pos.x, h.pos.z - it.pos.z);
        if (d < nearD && Math.abs(h.pos.y - it.pos.y) < 8) { nearD = d; near = h; nearP = p; }
        if (!it.hinted && d < HINT_RANGE) {
          it.hinted = true;
          events.emit('collectibleHint', { id: it.item.id, kind: it.kind, pos: { x: it.pos.x, y: it.pos.y, z: it.pos.z } });
          // A faint glint over a cache once a hero is in the area (riddles and logs announce
          // themselves by their landmark and their voice).
          if (it.kind === 'hides' && ow.markers?.place) it.mark = ow.markers.place('scan', it.pos);
        }
      }
      if (!near) continue;
      if (it.kind === 'hides') {
        if (nearD > PICK || Math.abs(near.pos.y - it.pos.y) > 3) continue;
        if (!hasGadget(it.item.gate)) {
          it.gateT -= dt;
          if (it.gateT <= 0) { it.gateT = 6; ow.ui.hintFor(nearP, `Something is hidden here. It needs the ${gadgetName(it.item.gate)}.`, 3500); }
          continue;
        }
        collect('hides', it.item, nearP, it.pos);
      } else if (it.kind === 'riddles') {
        const a = it.item.answer;
        if (nearD > a.radius) { it.scan = 0; continue; }
        if (a.scan && !ow.detective(nearP)) { it.scan = 0; continue; }
        it.scan += dt;
        if (!a.scan || it.scan >= SCAN_HOLD) collect('riddles', it.item, nearP, it.pos);
      } else if (it.kind === 'logs') {
        if (nearD > LOG_R) continue;
        collect('logs', it.item, nearP, it.pos);
        ow.say(it.item.lines);
      }
    }
  }

  // Photo spots: any hero within the spot's radius when a photo is saved.
  events.on('photoSaved', () => {
    for (const it of items) {
      if (it.kind !== 'photos' || found('photos', it.item.id)) continue;
      for (const p of ow.players()) {
        const h = p.hero;
        if (h && Math.hypot(h.pos.x - it.pos.x, h.pos.z - it.pos.z) <= it.item.radius && Math.abs(h.pos.y - it.pos.y) < 10) { collect('photos', it.item, p, it.pos); break; }
      }
    }
  });

  // ---------------------------------------------------------------- trials
  const trialFightId = (id) => `trial:${id}`;
  const liveArena = () => trial && !trial.done && trial.def.kind === 'arena';
  events.on('impact', (d = {}) => { if (liveArena() && d.outcome !== 'parried' && d.outcome !== 'immune') trial.score.hit(d.move); });
  events.on('takedown', () => { if (liveArena()) trial.score.hit('takedown'); });
  events.on('heroHurt', (d = {}) => { if (liveArena() && !d.blocking) trial.score.hurt(); });
  events.on('fightDone', ({ id } = {}) => {
    if (liveArena() && id === trialFightId(trial.def.id)) finishTrial(true, Math.round(trial.score.score));
    if (contract && !contract.over && id === contract.def.id) finishContract(true);
  });
  events.on('gadgetUse', () => { if (contract && !contract.over && contract.def.modifiers.includes('noGadgets')) finishContract(false, 'You used a gadget. The contract said clean.'); });
  events.on('playerDown', () => {
    if (trial && !trial.done && ow.heroes().length === 0) finishTrial(false);
    if (contract && !contract.over && ow.heroes().length === 0) finishContract(false, 'Down and out. The contract stays open.');
  });

  function startTrial(id) {
    const def = TRIALS.find((t) => t.id === id);
    if (!def || trial || contract) return false;
    ow.teleport(def.start);
    trial = { def, t: 0, done: false, run: def.rings ? createRingRun(def) : def.checkpoints ? createCheckpointRun(def) : null, score: def.kind === 'arena' ? createArenaScore() : null };
    for (let i = 0; i < 2; i++) { const h = ow.players()[i]?.hero; if (h) { prev[i].x = h.pos.x; prev[i].y = h.pos.y; prev[i].z = h.pos.z; } }
    if (def.kind === 'arena') { ow.encounters?.begin(trialFightId(id), def.fight); ow.encounters?.trigger(); }
    showGates();
    ow.ui.radio(def.name, def.blurb, 5000);
    events.emit('trialStart', { id, kind: def.kind, start: { x: def.start.x, y: def.start.y, z: def.start.z } });
    return true;
  }
  function finishTrial(ok, value = null) {
    const t = trial;
    if (!t || t.done) return;
    t.done = true;
    if (t.def.kind === 'arena' && ow.encounters?.id === trialFightId(t.def.id)) ow.encounters.end();
    let medal = null, newBest = false;
    if (ok && value != null) {
      const before = C().trials[t.def.id]?.medal ?? null;
      const r = recordResult(C().trials, t.def, value);
      C().trials[t.def.id] = { ...r.entry, opts: C().trials[t.def.id]?.opts ?? [] };
      medal = r.medal; newBest = r.newBest;
      ow.save();
      if (r.entry.medal && r.entry.medal !== before) ow.xp(XP.medal[r.entry.medal] - (before ? XP.medal[before] : 0), 'trial');
      ow.ui.toast(t.def.name, `${formatResult(t.def, value)}${medal ? ` · ${medal.toUpperCase()}` : ''}${newBest ? ' · new best' : ''}`, 5000);
    } else ow.ui.radio(t.def.name, 'Trial over. Try it again from the Batcomputer.', 4000);
    events.emit('trialDone', { id: t.def.id, ok, value, medal, newBest });
    trial = null;
    clearGates();
  }
  // The course in the world: the next ring (and the one after, dimmer) as gates; checkpoints as
  // pillars. Story markers (pooled, unlit, no lights).
  const gateMarks = [];
  function clearGates() { for (const m of gateMarks) ow.markers?.release(m); gateMarks.length = 0; }
  function showGates() {
    clearGates();
    const t = trial;
    if (!t?.run || !ow.markers?.place) return;
    const pts = t.def.rings ?? t.def.checkpoints ?? [];
    for (let k = 0; k < 2; k++) {
      const p = pts[t.run.next + k];
      if (!p) break;
      const ring = !!t.def.rings;
      const m = ring
        ? ow.markers.place('gate', { x: p.x, y: p.y - 2.8, z: p.z, yaw: Math.atan2(p.nx ?? 0, p.nz ?? 1) }, { scale: (p.r ?? 4) / 2.6 })
        : ow.markers.place('pillar', { x: p.x, y: p.y, z: p.z }, { scale: Math.max(1, (p.r ?? 4) / 3) });
      if (m && k === 1) ow.markers.color(m, 'safe');
      if (m) gateMarks.push(m);
    }
  }
  function updateTrial(dt) {
    const t = trial;
    t.t += dt;
    if (t.def.kind === 'arena') { t.score.tick(dt); return; }
    if (t.def.limit && t.t > t.def.limit) { finishTrial(false); return; }
    const players = ow.players();
    let r = null;
    if (t.def.rings) {
      // The run's own clock advances once per frame; every hero's segment can pass the ring.
      for (let i = 0; i < players.length && i < 2; i++) {
        const h = players[i].hero;
        const res = t.run.update(i === 0 ? dt : 0, prev[i], h.pos);
        prev[i].x = h.pos.x; prev[i].y = h.pos.y; prev[i].z = h.pos.z;
        if (res) r = res;
        if (t.run.done) break;
      }
    } else if (t.def.checkpoints) {
      for (let i = 0; i < players.length && i < 2; i++) { const res = t.run.update(i === 0 ? dt : 0, players[i].hero.pos); if (res) r = res; if (t.run.done) break; }
    }
    if (r === 'finish') finishTrial(true, Math.round(t.run.time * 100) / 100);
    else if (r === 'ring' || r === 'checkpoint') showGates();
    else if (r === 'needs') ow.ui.hint('Use the move this checkpoint asks for, then come back through.', 2500);
  }

  // ---------------------------------------------------------------- contracts
  function startContract() {
    if (trial || contract || !contractUnlocked(ow.progress, { dev: devContracts })) return null;
    const def = nextContract(ow.store, ow.rng);
    contract = { def, t: 0, over: false };
    ow.encounters?.begin(def.id, def.fight);
    ow.encounters?.trigger();
    ow.ui.radio(`Most Wanted: ${def.name}`, def.modifiers.map((m) => MODIFIERS[m].text).join(' '), 6000);
    events.emit('contractStart', { id: def.id, tier: def.tier, modifiers: def.modifiers.slice(), pos: { ...def.fight.site } });
    return def;
  }
  function finishContract(ok, why = null) {
    const c = contract;
    if (!c || c.over) return;
    c.over = true;
    if (ow.encounters?.id === c.def.id) ow.encounters.end();
    if (ok) { recordContract(ow.store, c.def, true); ow.save(); ow.xp(c.def.xp, 'contract'); ow.ui.toast('Contract closed', `${c.def.name}: tier ${c.def.tier + 1} done. The next one is worse.`, 5000); }
    else ow.ui.radio('Most Wanted', why ?? 'The contract stays open.', 4500);
    events.emit('contractDone', { id: c.def.id, ok, tier: c.def.tier });
    contract = null;
  }

  return {
    update(dt) {
      if (trial) updateTrial(dt);
      if (contract && !contract.over) {
        contract.t += dt;
        if (contract.def.timer && contract.t > contract.def.timer) finishContract(false, 'Out of time. The contract stays open.');
      }
      tick += dt;
      if (tick < 0.2) return;
      const step = tick;
      tick = 0;
      proximity(step);
    },
    startTrial, quitTrial: () => finishTrial(false),
    // Cheap per-frame check for the director and the crime runtime (no object built).
    get busy() { return !!(trial || (contract && !contract.over)); },
    get trial() { return trial ? { id: trial.def.id, name: trial.def.name, kind: trial.def.kind, t: trial.t, next: trial.run?.next ?? null, total: trial.run?.total ?? null, score: trial.score ? Math.round(trial.score.score) : null, multiplier: trial.score?.multiplier ?? null } : null; },
    startContract, quitContract: () => finishContract(false),
    get contract() { return contract ? { ...contract.def, t: contract.t } : null; },
    contractUnlocked: () => contractUnlocked(ow.progress, { dev: devContracts }),
    // Every item of a kind with found/where (Batcomputer lists, the map).
    list(kind) {
      if (kind === 'trials') return TRIALS.map((t) => ({ id: t.id, name: t.name, kind: t.kind, district: t.district, blurb: t.blurb, medals: t.medals, best: C().trials[t.id]?.best ?? null, medal: C().trials[t.id]?.medal ?? null, start: t.start }));
      return (COLLECTIBLES[kind] ?? []).map((item) => ({ id: item.id, found: found(kind, item.id), district: item.district ?? ow.districtAt(placeOf(kind, item).x, placeOf(kind, item).z), pos: placeOf(kind, item), title: item.title ?? item.subject ?? item.riddle ?? item.id, gate: item.gate ?? null }));
    },
    // Per district: done/total over riddles, hides, logs, photos and trials (a medal counts).
    districtCompletion() {
      const out = {};
      const add = (d, part, done) => {
        const r = (out[d] ??= { done: 0, total: 0, parts: {} });
        const p = (r.parts[part] ??= { done: 0, total: 0 });
        r.total += 1; p.total += 1;
        if (done) { r.done += 1; p.done += 1; }
      };
      for (const it of items) add(it.item.district ?? ow.districtAt(it.pos.x, it.pos.z), it.kind, found(it.kind, it.item.id));
      for (const t of TRIALS) add(t.district, 'trials', !!C().trials[t.id]?.medal);
      return out;
    },
    // e2e / dev: mark every item of a kind found (no rewards).
    debugCollectAll(kind) {
      const list = C()[STORE_KEY[kind]];
      for (const item of COLLECTIBLES[kind] ?? []) if (!list.includes(item.id)) list.push(item.id);
      ow.save();
      return list.length;
    },
    debugFinishTrial(value) { if (trial) finishTrial(true, value ?? (trial.def.kind === 'arena' ? trial.def.medals.gold : trial.def.medals.gold)); },
  };
}

export { RIDDLES, HIDES, LOGS, PHOTOS, TRIALS };
