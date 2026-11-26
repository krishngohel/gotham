// Host-side replication (workstream D2; research decisions 8, 9, 13, 14, 15, 21).
//
// The host owns the world. Every SNAP_MS it packs its heroes, every live enemy and the dynamic
// props into binary snapshots on the unreliable channel; discrete things (spawns, despawns, story
// steps, hit results, attacks on the guest, locks, pickups, pings...) go as reliable events through
// event(). It accepts from the guest only: hero state, hit claims, defence reports, lock requests,
// effect claims (a gadget's freeze, a chain's hold), small requests and chat, each rate-limited and
// validated before the adapter sees it.
//
// The adapter is the game (src/net/game/hostAdapter.js) or a test world. It implements:
//   collect(out)            fill out.heroes / out.enemies / out.props with this tick's records
//   guestHero(rec, hostT)   the guest's hero state (already sanity-checked here)
//   claimHit(slot, m)       apply a guest hit claim; return { out, hp } or null (rejected)
//   defence(slot, atk, m)   the guest's report for an attack aimed at it ('countered' | 'dodged' |
//                           'hit' | 'blocked' | 'miss')
//   lockGranted(slot, ids, action) / unlocked(slot, ids)
//   claimFx(slot, m)        a status effect on an enemy (freeze, dazzle, yank, hold, release...)
//   request(slot, m)        a small request (pickup, trophy, regroup, scene done...)
//   chat(slot, m)           a ping or a quick-chat line
//   attackTimedOut(atk)     an attack's report never came (the guest is told it was hit)
import { BIN, RATES, createRateLimiter } from '../protocol.js';
import { createWriter, encodeSnapshot, decodeHeroState, binType, seqNewer } from '../codec/snapshot.js';

export const SNAP_MS = 50;           // 20 Hz
export const LOCK_MS = 4000;         // a lock nobody releases expires
export const DEFENCE_GRACE_MS = 300; // after contact + rtt + interp, the guest's report is late

export function createHostReplicator({ session, adapter, now = () => performance.now(), guestSlot = 1, snapMs = SNAP_MS }) {
  const w = createWriter(1400);
  const limiter = createRateLimiter(RATES, now);
  const snap = { seq: 0, hostTime: 0, heroes: [], enemies: [], props: [] };
  let nextSnap = 0;
  let lastHeroSeq = -1;
  const seenHits = new Set(), hitOrder = [];
  // Attacks aimed at the guest, by id: { id, e, kind, at, contact, contacted, report, done }.
  const attacks = new Map();
  let atkId = 1;
  // Exclusive actions: enemy id -> { slot, until, req }.
  const locks = new Map();
  const stats = { snaps: 0, snapBytes: 0, parts: 0, rejected: 0, claims: 0, accepted: 0, dropped: 0, heroIn: 0 };
  let ready = false;
  let guestDelay = 125, rtt = 100;

  const send = (msg) => session.send(msg);

  function onState(data) {
    const t = binType(data);
    if (t !== BIN.HERO) { stats.dropped++; return; }
    const m = decodeHeroState(data);
    if (!m || m.hero.slot !== guestSlot) { stats.dropped++; return; }
    if (lastHeroSeq >= 0 && !seqNewer(m.seq, lastHeroSeq)) return; // stale or duplicate
    lastHeroSeq = m.seq;
    stats.heroIn++;
    adapter.guestHero(m.hero, m.hostTime);
  }

  function onMessage(m) {
    switch (m.t) {
      case 'hit': {
        stats.claims++;
        if (!limiter.allow('hit')) { stats.rejected++; return; }
        // Each claim once (a duplicate or a retransmit never double-KOs).
        if (seenHits.has(m.seq)) return;
        seenHits.add(m.seq); hitOrder.push(m.seq);
        if (hitOrder.length > 512) seenHits.delete(hitOrder.shift());
        const lock = locks.get(m.e);
        if (lock && lock.slot !== guestSlot && lock.until > now()) { stats.rejected++; send({ t: 'hitAck', e: m.e, seq: m.seq, out: 'locked', hp: -1 }); return; }
        const r = adapter.claimHit(guestSlot, m);
        if (!r) { stats.rejected++; send({ t: 'hitAck', e: m.e, seq: m.seq, out: 'rejected', hp: -1 }); return; }
        stats.accepted++;
        send({ t: 'hitAck', e: m.e, seq: m.seq, out: r.out, hp: r.hp });
        return;
      }
      case 'defence': {
        if (!limiter.allow('defence')) return;
        const a = attacks.get(m.id);
        if (!a || a.done || a.e !== m.e) return; // late (after the timeout) or unknown: ignored
        a.report = m;
        // Reports resolve at once; the host's own contact frame only matters for the timeout.
        a.done = true;
        adapter.defence(guestSlot, a, m);
        return;
      }
      case 'lock': {
        if (!limiter.allow('lock')) { send({ t: 'deny', req: m.req }); return; }
        const t = now();
        const ok = m.ids.every((id) => { const l = locks.get(id); return !l || l.until <= t || l.slot === guestSlot; }) && adapter.canLock?.(guestSlot, m.ids, m.action) !== false;
        if (!ok) { send({ t: 'deny', req: m.req }); return; }
        for (const id of m.ids) locks.set(id, { slot: guestSlot, until: t + LOCK_MS, req: m.req });
        send({ t: 'grant', req: m.req });
        adapter.lockGranted?.(guestSlot, m.ids, m.action);
        return;
      }
      case 'unlock': {
        const ids = [];
        for (const [id, l] of locks) if (l.req === m.req && l.slot === guestSlot) { locks.delete(id); ids.push(id); }
        if (ids.length) adapter.unlocked?.(guestSlot, ids);
        return;
      }
      case 'fx': {
        if (!limiter.allow('fx')) return;
        adapter.claimFx?.(guestSlot, m);
        return;
      }
      case 'req': case 'sceneDone': {
        if (!limiter.allow('req')) return;
        adapter.request?.(guestSlot, m);
        return;
      }
      case 'chat': case 'ping': {
        if (!limiter.allow(m.t === 'chat' ? 'chat' : 'ping')) return;
        adapter.chat?.(guestSlot, m);
        return;
      }
      case 'ev': {
        if (!limiter.allow('ev')) return;
        adapter.guestEvent?.(guestSlot, m);
        return;
      }
      case 'claim': {
        // [net2] a content claim (src/net/share.js registerClaim), capped like every claim.
        if (!limiter.allow('claim')) { stats.rejected++; return; }
        adapter.claim?.(guestSlot, m);
        return;
      }
      default:
        adapter.other?.(guestSlot, m);
    }
  }

  return {
    stats,
    get ready() { return ready; },
    // The guest's run exists (it asked for the world): snapshots may flow.
    setReady(on) { ready = !!on; if (!on) { attacks.clear(); locks.clear(); lastHeroSeq = -1; } },
    onState,
    onMessage,
    // The guest's measured interpolation delay and our round trip (for the defence timeout and
    // the rewind of hit claims).
    setTiming({ delay, rttMs } = {}) { if (delay > 0) guestDelay = delay; if (rttMs > 0) rtt = rttMs; },
    get guestDelay() { return guestDelay; },
    get rtt() { return rtt; },
    // A reliable event to the guest.
    event(msg) { if (ready) send(msg); },
    // ---- attacks on the guest (defender-side resolution) ----
    // An enemy began a wind-up aimed at the guest's hero. contactInMs: when its blow lands on the
    // host's timeline. Returns the attack id.
    attackStart(e, kind, contactInMs) {
      const t = now();
      const a = { id: atkId++, e, kind, at: t, contact: t + contactInMs, contacted: false, report: null, done: false };
      attacks.set(a.id, a);
      if (attacks.size > 64) { const first = attacks.keys().next().value; attacks.delete(first); }
      send({ t: 'atk', e, p: guestSlot, id: a.id, kind, at: t, contact: a.contact });
      return a.id;
    },
    // The enemy's blow reached its contact frame on the host. True: the guest decides (the host
    // must not apply damage itself). False: no open attack record (apply host-side rules).
    attackContact(e) {
      let found = null;
      for (const a of attacks.values()) if (a.e === e && !a.contacted) { if (!found || a.at > found.at) found = a; }
      if (!found) return false;
      found.contacted = true;
      found.contactedAt = now();
      return true;
    },
    // The attack was cancelled on the host (the goon was hit, countered by the host, KO'd).
    attackCancel(e) { for (const a of attacks.values()) if (a.e === e && !a.done) { a.done = true; send({ t: 'ev', name: 'atkCancel', data: { id: a.id } }); } },
    openAttacks() { let n = 0; for (const a of attacks.values()) if (!a.done) n++; return n; },
    // ---- locks ----
    // The host's own exclusive action on an enemy (a takedown, a grab): taken locally, no message.
    hostLock(id, hostSlot = 0) { const l = locks.get(id); if (l && l.slot !== hostSlot && l.until > now()) return false; locks.set(id, { slot: hostSlot, until: now() + LOCK_MS, req: -1 }); return true; },
    hostUnlock(id, hostSlot = 0) { const l = locks.get(id); if (l && l.slot === hostSlot) locks.delete(id); },
    lockedBy(id) { const l = locks.get(id); return l && l.until > now() ? l.slot : null; },
    // ---- per frame ----
    tick() {
      const t = now();
      // Defence timeouts: contact + round trip + the guest's interpolation delay + grace.
      for (const a of attacks.values()) {
        if (a.done) { if (t - a.at > 10000) attacks.delete(a.id); continue; }
        const due = Math.max(a.contact, a.contactedAt ?? a.contact) + rtt + guestDelay + DEFENCE_GRACE_MS;
        if (t > due && (a.contacted || t > a.contact + 3000)) {
          a.done = true;
          if (a.contacted) { send({ t: 'hurt', kind: a.kind, e: a.e, id: a.id }); adapter.attackTimedOut?.(a); }
        }
      }
      for (const [id, l] of locks) if (l.until <= t) { locks.delete(id); if (l.slot === guestSlot) adapter.unlocked?.(guestSlot, [id]); }
      if (!ready || t < nextSnap) return false;
      nextSnap = Math.max(nextSnap + snapMs, t - snapMs);
      snap.seq = (snap.seq + 1) & 0xffff;
      snap.hostTime = t;
      snap.heroes.length = 0; snap.enemies.length = 0; snap.props.length = 0;
      adapter.collect(snap);
      const r = encodeSnapshot(w, snap, (bytes) => session.sendState(bytes));
      stats.snaps++; stats.snapBytes += r.bytes; stats.parts += r.parts;
      return true;
    },
  };
}
