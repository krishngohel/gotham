// Signalling behind one small interface (workstream D2; research decisions 1, 2, 4, 7):
//
//   const s = createXSignaller(opts)
//   s.host(code, { onStatus }) -> Promise<link>   resolves when a guest's link is up; call again to
//                                                  wait for the next one (a reconnect)
//   s.join(code, { onStatus }) -> Promise<link>   rejects with Error(reason) where reason is one of
//                                                  REASONS below (the UI words each one)
//   s.close()
//
// Implementations:
//   broadcast   two tabs of one browser (tests, local play)
//   trystero    the primary for two PCs: Trystero's Nostr strategy (public relays, SDP encrypted with
//               the room code as password), lazy-loaded so single-player never downloads it; we take
//               its RTCPeerConnection and open our own two channels on it
//   manual      the last resort: compressed offer/answer codes pasted by hand (see manualCode.js)
import { hostBroadcast, joinBroadcast } from '../transport/broadcast.js';
import { linkFromPeerConnection, RTC_CONFIG } from '../transport/webrtc.js';
import { PROTO } from '../protocol.js';

export const REASONS = {
  unreachable: 'signalling-unreachable', // no relay reachable
  noHost: 'no-host',                     // nobody hosting that code
  full: 'room-full',
  ice: 'ice-failed',                     // the networks block a direct link
  version: 'version',
  aborted: 'aborted',
};

export function createBroadcastSignaller() {
  let ctrl = null;
  return {
    kind: 'broadcast',
    host(code) { ctrl = new AbortController(); return hostBroadcast(code, { signal: ctrl.signal }); },
    join(code, { timeoutMs = 8000 } = {}) { ctrl = new AbortController(); return joinBroadcast(code, { timeoutMs, signal: ctrl.signal }).catch((e) => { throw new Error(e.message === 'room-full' ? REASONS.full : e.message === 'no-host' ? REASONS.noHost : e.message); }); },
    close() { try { ctrl?.abort(); } catch { /* done */ } },
  };
}

// Trystero (pinned exact version in package.json; see the hand-back for why it is the one new
// runtime dependency). Imported only when an online game is actually hosted or joined.
export function createTrysteroSignaller({ load = () => import('trystero'), appId = `gotham-long-night/${PROTO}`, relayTimeoutMs = 10000, peerTimeoutMs = 30000, iceTimeoutMs = 20000 } = {}) {
  let room = null, lib = null;
  const seen = new WeakSet();
  async function enter(code, onStatus) {
    if (room) return room;
    onStatus?.({ state: 'loading' });
    try { lib = await load(); } catch { throw new Error(REASONS.unreachable); }
    onStatus?.({ state: 'signalling' });
    let joinError = null;
    room = lib.joinRoom({ appId, password: code, rtcConfig: RTC_CONFIG }, code, { onJoinError: (d) => { joinError = d?.error ?? 'error'; } });
    room._joinError = () => joinError;
    // A relay must answer within relayTimeoutMs, else matchmaking is unreachable.
    const t0 = Date.now();
    while (Date.now() - t0 < relayTimeoutMs) {
      if (relaysUp()) return room;
      await sleep(250);
    }
    if (relaysUp()) return room;
    throw new Error(REASONS.unreachable);
  }
  function relaysUp() {
    try {
      const socks = lib.getRelaySockets?.() ?? {};
      return Object.values(socks).some((s) => s && s.readyState === 1);
    } catch { return true; }
  }
  // Waits for a new peer, then for its connection to come up with our channels open.
  function nextPeer(onStatus, timeoutMs, failOnTimeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = timeoutMs ? setTimeout(() => finish(new Error(failOnTimeout)), timeoutMs) : null;
      function finish(err, link) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        room.onPeerJoin = null;
        if (err) reject(err); else resolve(link);
      }
      // Trystero may race two connections for one peer and close the loser: take the peer's
      // connection only once it has settled (connected), and never the same one twice.
      const take = (peerId, tries = 0) => {
        if (settled || !room) return;
        const pc = room.getPeers()[peerId];
        if (!pc || seen.has(pc)) return;
        const st = pc.connectionState ?? pc.iceConnectionState;
        if (st !== 'connected' && st !== 'completed') { if (tries < 60) setTimeout(() => take(peerId, tries + 1), 250); return; }
        seen.add(pc);
        onStatus?.({ state: 'connecting' });
        const link = linkFromPeerConnection(pc, { ownsPc: false });
        link.peerId = peerId;
        const iceT = setTimeout(() => { if (!link.open) { link.close(REASONS.ice); finish(new Error(REASONS.ice)); } }, iceTimeoutMs);
        link.on('open', () => { clearTimeout(iceT); finish(null, link); });
        link.on('close', (r) => { clearTimeout(iceT); if (!link.open) finish(new Error(r === 'ice-failed' ? REASONS.ice : r)); });
      };
      room.onPeerJoin = take;
      for (const id of Object.keys(room.getPeers())) take(id);
    });
  }
  return {
    kind: 'trystero',
    async host(code, { onStatus } = {}) {
      await enter(code, onStatus);
      onStatus?.({ state: 'waiting' });
      return nextPeer(onStatus, 0, REASONS.noHost);
    },
    async join(code, { onStatus } = {}) {
      await enter(code, onStatus);
      onStatus?.({ state: 'searching' });
      try { return await nextPeer(onStatus, peerTimeoutMs, REASONS.noHost); } catch (e) {
        const je = room?._joinError?.();
        if (je && /decrypt|handshake/i.test(je)) throw new Error(REASONS.version);
        throw e;
      }
    },
    // A reconnect wants a fresh room (the old peer id is gone for good).
    async reset() { const r = room; room = null; try { await r?.leave(); } catch { /* gone */ } },
    close() { const r = room; room = null; try { r?.leave(); } catch { /* gone */ } },
  };
}

// Manual codes (decision 4): the offer/answer SDP deflated and base64url-encoded.
//   host: const o = await manualHost(); show o.code; o.accept(answerCode) -> link
//   guest: const a = await manualJoin(offerCode); show a.code; a.link opens when the host accepts
// The answer must reach the host within ~10-15 s of the guest making it (ICE/DTLS gives up), so the
// UI runs a countdown and regenerates the offer when it lapses.
export const MANUAL_WINDOW_S = 15;

export async function manualHost({ rtc = null } = {}) {
  const { createOffer } = rtc ?? await import('../transport/webrtc.js');
  const o = await createOffer();
  return {
    code: 'GH' + await packSdp(o.offer),
    link: o.link,
    async accept(code) {
      const sdp = await unpackCode(code, 'GG');
      if (!sdp) throw new Error('bad-code');
      await o.acceptAnswer(sdp);
      return o.link;
    },
    close() { try { o.link.close('closed'); } catch { /* closed */ } },
  };
}

export async function manualJoin(code, { rtc = null } = {}) {
  const { acceptOffer } = rtc ?? await import('../transport/webrtc.js');
  const sdp = await unpackCode(code, 'GH');
  if (!sdp) throw new Error('bad-code');
  const a = await acceptOffer(sdp);
  return { code: 'GG' + await packSdp(a.answer), link: a.link };
}

async function unpackCode(code, prefix) {
  const c = String(code ?? '').replace(/\s+/g, '');
  if (!c.startsWith(prefix) || c.length > 8000) return null;
  try { return await unpackSdp(c.slice(prefix.length)); } catch { return null; }
}

// deflate-raw + base64url (CompressionStream exists in every current browser and in Node 18+).
export async function packSdp(sdp) {
  const bytes = new TextEncoder().encode(sdp);
  const out = await pipe(bytes, new CompressionStream('deflate-raw'));
  return toB64url(out);
}
export async function unpackSdp(s) {
  const bytes = fromB64url(s);
  const out = await pipe(bytes, new DecompressionStream('deflate-raw'));
  const text = new TextDecoder().decode(out);
  if (!text.startsWith('v=0')) throw new Error('not an sdp');
  return text;
}
async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes); w.close();
  const chunks = [];
  const r = stream.readable.getReader();
  let n = 0;
  for (;;) {
    const { value, done } = await r.read();
    if (done) break;
    chunks.push(value); n += value.length;
    if (n > 200000) throw new Error('too big');
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
function toB64url(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return u8;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
