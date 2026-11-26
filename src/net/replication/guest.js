// Guest-side replication (workstream D2; research decisions 10, 13, 15).
//
// The guest runs the same game in replica mode: it never spawns enemies, advances the story or
// decides world state. Here it:
//   - buffers snapshot samples per entity and, every frame, samples them at
//     renderTime = hostNow - interpDelay (adaptive 100-250 ms; extrapolates at most 100 ms, then
//     holds) and hands the result to the adapter, which poses the puppets
//   - sends its own hero's state at HERO_HZ (it simulates its hero fully and locally)
//   - turns the adapter's claims (hits, effects, locks, defence reports) into control messages
//   - resolves enemy attacks aimed at its hero on its OWN timeline: an 'atk' event names the host
//     time of contact; the guest resolves it when its render clock reaches that time, so the
//     counter window it sees is the full designed one whatever the latency
//
// The adapter (src/net/game/guestAdapter.js, or a test world) implements:
//   spawn(m) / despawn(id) / enemyByNum(num)
//   applyEnemy(e, pos, rec, renderTime)    pos: sampled {x,y,z,yaw}; rec: the newest discrete
//                                          record at or before renderTime (state, clip, flags...)
//   hostHero(slot, pos, rec, renderTime)   the host's hero puppet
//   prop(rec, pos)                         a vehicle or other dynamic prop
//   localHero(out)                         fill a hero record for our own hero
//   resolveAttack(atk)                     our hero vs an incoming blow at contact: returns
//                                          'countered' | 'dodged' | 'hit' | 'blocked' | 'miss'
//                                          (and applies the damage locally when 'hit')
//   hurt(m)                                the host says a blow landed (ranged, timed-out...)
//   hitAck(m)                              the host's verdict on one of our hit claims
//   granted(req) / denied(req)             lock answers
//   onEvent(m)                             every other host event (step, pickup, place, ...)
import { BIN } from '../protocol.js';
import { createWriter, decodeSnapshot, encodeHeroState, binType, seqNewer, enemyId, enemyNum } from '../codec/snapshot.js';
import { createInterpDelay, createSampleBuffer } from '../clock.js';

export const HERO_HZ = 30;
const UNKNOWN_RESYNC_MS = 2500;

export function createGuestReplicator({ session, adapter, now = () => performance.now(), hostNow = () => session.hostNow(), slot = 1 }) {
  const w = createWriter(128);
  const delay = createInterpDelay();
  // Per entity: a position buffer and a short ring of discrete records.
  const tracks = new Map(); // key -> { buf, recs: [], kind, num }
  const heroTracks = new Map();
  const propTracks = new Map();
  const unknown = new Map(); // enemy num -> first seen (local ms)
  let heroSeq = 0, nextHero = 0, claimSeq = 1, lockReq = 1, lastSnapSeq = -1;
  const pendingAtk = new Map(); // id -> { m, resolved }
  const heroRec = { slot, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, clip: 0, clipT: 0, speed: 1, health: 0, maxHealth: 1, flags: 0, state: 'ground', seat: 0, held: 0 };
  const stats = { snaps: 0, parts: 0, bytesIn: 0, claims: 0, acks: 0, rejected: 0, resyncs: 0, defences: { countered: 0, dodged: 0, hit: 0, blocked: 0, miss: 0 } };
  let lastResync = -1e9;

  function track(map, key, make) {
    let t = map.get(key);
    if (!t) { t = make(); map.set(key, t); }
    return t;
  }
  const newTrack = () => ({ buf: createSampleBuffer(16), recs: [] });
  function pushRec(t, time, rec) {
    if (!t.buf.push(time, rec.x, rec.y, rec.z, rec.yaw)) return false;
    rec.time = time;
    t.recs.push(rec);
    if (t.recs.length > 16) t.recs.shift();
    return true;
  }
  // The newest record at or before `at` (the oldest when none is that old yet).
  function recAt(t, at) {
    let best = null;
    for (let i = t.recs.length - 1; i >= 0; i--) if (t.recs[i].time <= at) { best = t.recs[i]; break; }
    return best ?? t.recs[0] ?? null;
  }

  function onState(data) {
    if (binType(data) !== BIN.SNAP) return;
    const s = decodeSnapshot(data);
    if (!s) return;
    stats.parts++;
    stats.bytesIn += data.byteLength;
    if (s.part === 0) {
      stats.snaps++;
      if (lastSnapSeq < 0 || seqNewer(s.seq, lastSnapSeq)) lastSnapSeq = s.seq;
      delay.note(hostNow(), s.hostTime);
    }
    for (const h of s.heroes) {
      if (adapter.hostHeroRecord) adapter.hostHeroRecord(h, s.hostTime);
      else pushRec(track(heroTracks, h.slot, newTrack), s.hostTime, h);
    }
    for (const e of s.enemies) {
      const ent = adapter.enemyByNum(e.num);
      if (!ent) {
        // A snapshot can overtake the reliable spawn: wait a moment before asking for the world.
        if (!unknown.has(e.num)) unknown.set(e.num, now());
        else if (now() - unknown.get(e.num) > UNKNOWN_RESYNC_MS && now() - lastResync > 5000) { lastResync = now(); stats.resyncs++; session.send({ t: 'resync' }); unknown.clear(); }
        continue;
      }
      unknown.delete(e.num);
      const t = track(tracks, e.num, newTrack);
      pushRec(t, s.hostTime, e);
    }
    for (const p of s.props) pushRec(track(propTracks, p.id, newTrack), s.hostTime, p);
  }

  function onMessage(m) {
    switch (m.t) {
      case 'spawn': unknown.delete(enemyNum(m.id)); adapter.spawn(m); return;
      case 'despawn': { const num = enemyNum(m.id); tracks.delete(num); adapter.despawn(m.id); return; }
      case 'hitAck': stats.acks++; if (m.out === 'rejected' || m.out === 'locked') stats.rejected++; adapter.hitAck?.(m); return;
      case 'atk': pendingAtk.set(m.id, { m, resolved: false }); adapter.attackStart?.(m); return;
      case 'hurt': {
        const p = m.id !== undefined ? pendingAtk.get(m.id) : null;
        if (p) { if (p.resolved) return; p.resolved = true; }
        adapter.hurt(m);
        return;
      }
      case 'grant': adapter.granted?.(m.req); return;
      case 'deny': adapter.denied?.(m.req); return;
      case 'ev':
        if (m.name === 'atkCancel' && m.data && pendingAtk.has(m.data.id)) { pendingAtk.get(m.data.id).resolved = true; return; }
        adapter.onEvent(m);
        return;
      default: adapter.onEvent(m);
    }
  }

  function report(id, p, result, dmg) {
    if (p.resolved) return;
    p.resolved = true;
    stats.defences[result] = (stats.defences[result] ?? 0) + 1;
    session.send({ t: 'defence', id, e: p.m.e, result, ...(dmg !== undefined ? { dmg } : {}) });
  }

  return {
    stats,
    delay,
    onState,
    onMessage,
    get renderTime() { return hostNow() - delay.value; },
    // Every frame: pose puppets at renderTime, resolve due attacks, send our hero's state.
    tick() {
      const rt = hostNow() - delay.value;
      for (const [num, t] of tracks) {
        const e = adapter.enemyByNum(num);
        if (!e) { tracks.delete(num); continue; }
        const pos = t.buf.sample(rt, 100);
        if (pos) adapter.applyEnemy(e, pos, recAt(t, rt), rt);
      }
      for (const [s, t] of heroTracks) { const pos = t.buf.sample(rt, 100); if (pos) adapter.hostHero(s, pos, recAt(t, rt), rt); }
      for (const [id, t] of propTracks) { const pos = t.buf.sample(rt, 150); if (pos) adapter.prop?.(recAt(t, rt), pos); }
      // Attacks aimed at us, resolved on our timeline: when our render clock reaches the host's
      // contact time we see the blow land exactly as the host's goon threw it.
      for (const [id, p] of pendingAtk) {
        if (p.resolved) { if (rt - p.m.at > 15000) pendingAtk.delete(id); continue; }
        const e = adapter.enemyByNum(enemyNum(p.m.e));
        if (!e) { p.resolved = true; continue; }
        // The wind-up starts on our timeline when the render clock reaches the host's start time,
        // from the reliable event, whatever snapshots were lost.
        if (!p.begun && rt >= p.m.at) { p.begun = true; adapter.attackBegin?.(e, p.m, rt); }
        if (adapter.isCounteredLocally?.(e, p.m)) { report(id, p, 'countered'); continue; }
        if (rt >= p.m.contact) {
          const r = adapter.resolveAttack(e, p.m);
          if (r) report(id, p, r.result ?? r, r.dmg);
          else p.resolved = true;
        }
      }
      const t = now();
      if (t >= nextHero) {
        nextHero = Math.max(nextHero + 1000 / HERO_HZ, t - 1000 / HERO_HZ);
        if (adapter.localHero(heroRec) !== false) {
          heroSeq = (heroSeq + 1) & 0xffff;
          session.sendState(encodeHeroState(w, { seq: heroSeq, hostTime: hostNow(), hero: heroRec }));
        }
      }
    },
    // ---- claims ----
    claimHit(e, move, o = {}) {
      const seq = claimSeq++;
      stats.claims++;
      session.send({ t: 'hit', e, move, seq, at: hostNow() - delay.value, o });
      return seq;
    },
    // The guest countered an attack early (before contact): tell the host at once.
    counterNow(eId) {
      for (const [id, p] of pendingAtk) if (!p.resolved && p.m.e === eId) { report(id, p, 'countered'); return true; }
      return false;
    },
    lock(ids, action) { const req = lockReq++; session.send({ t: 'lock', req, ids, action }); return req; },
    unlock(req) { session.send({ t: 'unlock', req }); },
    fx(e, fx, arg, v) { session.send({ t: 'fx', e, fx, ...(arg !== undefined ? { arg } : {}), ...(v ? { v } : {}) }); },
    request(what, extra = {}) { session.send({ t: 'req', what, ...extra }); },
    chat(m) { session.send(m); },
    send(m) { session.send(m); },
    // A fresh world (welcome, reconnect): drop every buffered sample.
    reset() { tracks.clear(); heroTracks.clear(); propTracks.clear(); unknown.clear(); pendingAtk.clear(); lastSnapSeq = -1; },
    enemyKey: enemyId,
  };
}
