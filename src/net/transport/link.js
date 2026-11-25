// The one transport interface (workstream D2). Three implementations share it:
//   loopback.js   an in-process pair with seeded latency, jitter, loss, duplication and reorder
//                 (loss/dup/reorder only on the unreliable `state` channel), for unit tests
//   broadcast.js  BroadcastChannel: two tabs of one browser (e2e, and local testing by hand)
//   webrtc.js     RTCPeerConnection with two negotiated data channels (the real thing)
//
// A link:
//   link.send(ch, data) -> boolean   ch is 'ctl' (string, reliable ordered) or 'state'
//                                    (Uint8Array, unordered, may drop); false = not sent
//                                    (closed, or dropped by back-pressure on 'state')
//   link.on('open' | 'message' | 'close' | 'status', fn) -> off()
//       message: (ch, data)  close: (reason)  status: ({ state, detail }) for the UI
//   link.open      both channels usable
//   link.buffered(ch)   bytes queued (back-pressure)
//   link.close(reason)
//   link.stats     { sent: {ctl, state}, recv: {ctl, state}, bytesOut, bytesIn, dropped }
import { LIMITS } from '../protocol.js';

export function createLinkBase(kind) {
  const handlers = new Map();
  const stats = { sent: { ctl: 0, state: 0 }, recv: { ctl: 0, state: 0 }, bytesOut: { ctl: 0, state: 0 }, bytesIn: { ctl: 0, state: 0 }, dropped: 0, rejected: 0 };
  const link = {
    kind,
    open: false,
    closed: false,
    stats,
    on(name, fn) {
      let s = handlers.get(name);
      if (!s) { s = new Set(); handlers.set(name, s); }
      s.add(fn);
      return () => s.delete(fn);
    },
    emit(name, ...args) {
      const s = handlers.get(name);
      if (!s) return;
      for (const fn of [...s]) {
        try { fn(...args); } catch (err) { if (typeof console !== 'undefined') console.error(err); }
      }
    },
    // Called by implementations for every inbound message: size cap and counting in one place.
    deliver(ch, data) {
      if (link.closed) return;
      const n = typeof data === 'string' ? data.length : data?.byteLength ?? 0;
      if (n > LIMITS.maxMessage || (ch !== 'ctl' && ch !== 'state')) { stats.rejected += 1; return; }
      stats.recv[ch] += 1;
      stats.bytesIn[ch] += n;
      link.emit('message', ch, data);
    },
    countOut(ch, data) {
      stats.sent[ch] += 1;
      stats.bytesOut[ch] += typeof data === 'string' ? data.length : data?.byteLength ?? 0;
    },
    markOpen() {
      if (link.open || link.closed) return;
      link.open = true;
      link.emit('open');
    },
    markClosed(reason = 'closed') {
      if (link.closed) return;
      link.closed = true;
      link.open = false;
      link.emit('close', reason);
    },
  };
  return link;
}

// Copies outgoing binary into a buffer the receiver may keep (the writer reuses its own).
export function ownBytes(data) {
  if (typeof data === 'string') return data;
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  return data;
}
