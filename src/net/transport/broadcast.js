// BroadcastChannel transport (workstream D2): two tabs of one browser profile play together with
// no network at all. Used by the e2e tests (two pages in one Playwright context share it) and for
// trying online co-op on one PC. BroadcastChannel is reliable and ordered, so the `state` channel
// simply never drops; back-pressure does not apply.
//
// Rendezvous on one BroadcastChannel per room code ('gotham-net/<code>'):
//   host:  listens; answers the first 'knock' with 'accept' and pairs with that tab
//   guest: posts 'knock' (with its tab id) every 300 ms until accepted or the deadline passes
// After pairing, frames are { k: 'm', from, to, ch, d } and only the paired tab reads them. A tab
// closing posts 'bye'; a silent peer is the session's heartbeat to notice.
import { createLinkBase, ownBytes } from './link.js';

const PREFIX = 'gotham-net/';

export function broadcastAvailable() { return typeof BroadcastChannel === 'function'; }

// host: resolves to a link once a guest knocks. guest: resolves once accepted, rejects after
// `timeoutMs` with Error('no-host').
export function hostBroadcast(code, { id = randomId(), signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(PREFIX + code);
    let link = null;
    const onMsg = (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      if (!link && m.k === 'knock' && typeof m.from === 'string') {
        link = makeLink(bc, id, m.from);
        bc.postMessage({ k: 'accept', from: id, to: m.from });
        link.markOpen();
        resolve(link);
        return;
      }
      // A second guest knocking at a full room is told so.
      if (link && m.k === 'knock' && m.from !== link.peerId) bc.postMessage({ k: 'full', from: id, to: m.from });
      if (link) link.onFrame(m);
    };
    bc.addEventListener('message', onMsg);
    signal?.addEventListener?.('abort', () => { if (!link) { bc.close(); reject(new Error('aborted')); } });
  });
}

export function joinBroadcast(code, { id = randomId(), timeoutMs = 8000, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(PREFIX + code);
    let link = null, done = false;
    const knock = () => { if (!done) bc.postMessage({ k: 'knock', from: id }); };
    const timer = setInterval(knock, 300);
    const deadline = setTimeout(() => finish(new Error('no-host')), timeoutMs);
    function finish(err) {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(deadline);
      if (err) { bc.close(); reject(err); }
    }
    bc.addEventListener('message', (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object' || m.to !== id) return;
      if (!link && m.k === 'accept') {
        link = makeLink(bc, id, m.from);
        finish(null);
        link.markOpen();
        resolve(link);
        return;
      }
      if (!link && m.k === 'full') { finish(new Error('room-full')); return; }
      if (link) link.onFrame(m);
    });
    signal?.addEventListener?.('abort', () => finish(new Error('aborted')));
    knock();
  });
}

function makeLink(bc, id, peerId) {
  const link = createLinkBase('broadcast');
  link.peerId = peerId;
  // A test hook: drop everything both ways without closing (a network outage).
  link.unplugged = false;
  link.onFrame = (m) => {
    if (m.from !== peerId || m.to !== id) return;
    if (m.k === 'bye') { link.markClosed('peer-closed'); try { bc.close(); } catch { /* closed */ } return; }
    if (m.k !== 'm' || link.unplugged) return;
    let data = m.d;
    if (m.ch === 'state' && data instanceof ArrayBuffer) data = new Uint8Array(data);
    link.deliver(m.ch, data);
  };
  link.send = (ch, data) => {
    if (!link.open || link.closed) return false;
    link.countOut(ch, data);
    if (link.unplugged) return true;
    let d = ownBytes(data);
    if (d instanceof Uint8Array) d = d.buffer;
    try { bc.postMessage({ k: 'm', from: id, to: peerId, ch, d }); } catch { return false; }
    return true;
  };
  link.buffered = () => 0;
  link.close = (reason = 'closed') => {
    if (link.closed) return;
    try { bc.postMessage({ k: 'bye', from: id, to: peerId }); } catch { /* closed */ }
    link.markClosed(reason);
    try { bc.close(); } catch { /* closed */ }
  };
  link.unplug = (on = true) => { link.unplugged = on; };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => link.close('page-closed'));
  return link;
}

export function randomId() {
  const a = new Uint8Array(8);
  (globalThis.crypto ?? { getRandomValues: (x) => { for (let i = 0; i < x.length; i++) x[i] = Math.floor(Math.random() * 256); return x; } }).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
