// In-process transport pair with a link conditioner (workstream D2; research decision 20).
//
//   const [a, b] = createLoopbackPair({ seed, latencyMs, jitterMs, loss, duplicate, reorder, clock })
//
// Latency and jitter apply to both channels. Loss, duplication and reordering apply only to the
// unreliable `state` channel: `ctl` stays reliable and ordered (a later message is held behind an
// earlier, slower one), exactly like an SCTP reliable ordered stream. Seeded, with an injectable
// clock, so unit tests are deterministic:
//
//   const clock = createManualClock(); ... clock.advance(16) delivers everything due.
//
// Presets: lan (5±1, 0%), good (40±10, 0.5%), bad (150±50, 5%), awful (300±120, 15%).
import { createRng } from '../../core/rng.js';
import { createLinkBase, ownBytes } from './link.js';

export const PRESETS = {
  perfect: { latencyMs: 0, jitterMs: 0, loss: 0 },
  lan: { latencyMs: 5, jitterMs: 1, loss: 0 },
  good: { latencyMs: 40, jitterMs: 10, loss: 0.005 },
  bad: { latencyMs: 150, jitterMs: 50, loss: 0.05 },
  awful: { latencyMs: 300, jitterMs: 120, loss: 0.15 },
};

// A clock tests drive by hand: timers fire in time order on advance().
export function createManualClock(start = 0) {
  let now = start;
  let seq = 0;
  const timers = [];
  return {
    now: () => now,
    setTimeout(fn, ms) { const t = { at: now + Math.max(0, ms), fn, seq: seq++ }; timers.push(t); return t; },
    clearTimeout(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let best = -1;
        for (let i = 0; i < timers.length; i++) if (timers[i].at <= end && (best < 0 || timers[i].at < timers[best].at || (timers[i].at === timers[best].at && timers[i].seq < timers[best].seq))) best = i;
        if (best < 0) break;
        const t = timers.splice(best, 1)[0];
        now = Math.max(now, t.at);
        t.fn();
      }
      now = end;
    },
    get pending() { return timers.length; },
  };
}

export const realClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

// Normal-ish jitter from a seeded rng (sum of uniforms), clamped at zero.
function delayOf(rng, latency, jitter) {
  if (!jitter) return latency;
  const n = (rng.next() + rng.next() + rng.next() - 1.5) * 2; // ~N(0, 1)
  return Math.max(0, latency + n * jitter);
}

export function createLoopbackPair(opts = {}) {
  const clock = opts.clock ?? realClock;
  const a = createEnd('loopback', clock);
  const b = createEnd('loopback', clock);
  a.peer = b; b.peer = a;
  a.cond = conditioner(opts, opts.seed ?? 1, clock);
  b.cond = conditioner(opts.back ?? opts, (opts.seed ?? 1) + 7919, clock);
  // Open on the next tick, like a real connection.
  clock.setTimeout(() => { a.markOpen(); b.markOpen(); }, 0);
  return [a, b];
}

// A pretend matchmaking service for unit tests: hosts wait on a code, a join pairs a fresh
// conditioned loopback link with the waiting host. Each signaller() is one machine's.
export function createLoopbackNetwork({ clock = realClock, conditions = {}, seed = 1 } = {}) {
  const waiting = new Map(); // code -> resolve(link)
  let n = 0;
  const links = [];
  return {
    links,
    // Applies new conditions to every live link (and the ones made later).
    condition(next) { Object.assign(conditions, next); for (const [a, b] of links) { a.condition(next); b.condition(next); } },
    signaller() {
      return {
        kind: 'loopback',
        host(code) { return new Promise((resolve) => { waiting.set(code, resolve); }); },
        join(code) {
          const resolve = waiting.get(code);
          if (!resolve) return Promise.reject(new Error('no-host'));
          waiting.delete(code);
          const [h, g] = createLoopbackPair({ clock, seed: seed + 101 * n++, ...conditions });
          links.push([h, g]);
          return new Promise((res) => { h.on('open', () => { resolve(h); res(g); }); });
        },
        close() {},
      };
    },
  };
}

function conditioner(o, seed, clock) {
  const rng = createRng(seed);
  return {
    o: { latencyMs: 0, jitterMs: 0, loss: 0, duplicate: 0, reorder: 0, ...o },
    rng,
    // ctl delivers in order: never before the previous ctl message.
    lastCtlAt: 0,
    set(next) { Object.assign(this.o, next); },
    clock,
  };
}

function createEnd(kind, clock) {
  const link = createLinkBase(kind);
  link.peer = null;
  link.cond = null;
  // While "unplugged" (a test's network outage) everything sent is lost, ctl included.
  link.unplugged = false;
  link.send = (ch, data) => {
    if (!link.open || link.closed || !link.peer || link.peer.closed) return false;
    if (ch !== 'ctl' && ch !== 'state') return false;
    link.countOut(ch, data);
    if (link.unplugged || link.peer.unplugged) return true;
    const c = link.cond;
    const o = c.o;
    const copy = ownBytes(data);
    const peer = link.peer;
    if (ch === 'state') {
      if (o.loss && c.rng.next() < o.loss) { link.stats.dropped += 1; return true; }
      let d = delayOf(c.rng, o.latencyMs, o.jitterMs);
      if (o.reorder && c.rng.next() < o.reorder) d += o.jitterMs * 2 + 5;
      clock.setTimeout(() => peer.deliver('state', copy), d);
      if (o.duplicate && c.rng.next() < o.duplicate) clock.setTimeout(() => peer.deliver('state', ownBytes(copy)), d + c.rng.next() * 20);
    } else {
      const now = clock.now();
      const at = Math.max(now + delayOf(c.rng, o.latencyMs, o.jitterMs), c.lastCtlAt);
      c.lastCtlAt = at;
      clock.setTimeout(() => peer.deliver('ctl', copy), at - now);
    }
    return true;
  };
  link.buffered = () => 0;
  link.close = (reason = 'closed') => {
    const peer = link.peer;
    link.markClosed(reason);
    if (peer && !peer.closed) clock.setTimeout(() => peer.markClosed('peer-closed'), link.cond?.o.latencyMs ?? 0);
  };
  // Test helpers: change conditions mid-run; cut the wire without closing (an outage).
  link.condition = (next) => link.cond.set(next);
  link.unplug = (on = true) => { link.unplugged = on; };
  return link;
}
