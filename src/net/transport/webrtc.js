// WebRTC transport (workstream D2; research decisions 3, 5, 7, 9).
//
// One RTCPeerConnection, two negotiated data channels created on both sides with fixed ids, so no
// in-band open message and no renegotiation are needed (the connection may come from Trystero or
// from our own manual offer/answer):
//   ctl    id 100   reliable, ordered        JSON control messages
//   state  id 101   ordered:false, maxRetransmits:0   binary snapshots / hero state / pings
// Back-pressure: a 'state' send is skipped while more than ~2 snapshots are queued; 'ctl' is never
// dropped (the session chunks big payloads and paces them on bufferedamountlow).
// STUN only, two servers (Cloudflare's is the one with an explicit free-use statement). No TURN:
// some networks cannot link directly, and the UI says so.
import { createLinkBase } from './link.js';

export const ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
export const RTC_CONFIG = { iceServers: ICE_SERVERS };
const CTL_ID = 100, STATE_ID = 101;
const STATE_BACKLOG = 2400; // bytes: about two snapshots

export function webrtcAvailable() { return typeof RTCPeerConnection === 'function'; }

// Wraps a peer connection (ours or Trystero's) in a link. Call before or after it connects.
export function linkFromPeerConnection(pc, { ownsPc = true } = {}) {
  const link = createLinkBase('webrtc');
  link.pc = pc;
  const ctl = pc.createDataChannel('ctl', { negotiated: true, id: CTL_ID, ordered: true });
  const state = pc.createDataChannel('state', { negotiated: true, id: STATE_ID, ordered: false, maxRetransmits: 0 });
  ctl.binaryType = 'arraybuffer';
  state.binaryType = 'arraybuffer';
  ctl.bufferedAmountLowThreshold = 16 * 1024;
  link.channels = { ctl, state };
  const both = () => ctl.readyState === 'open' && state.readyState === 'open';
  const onOpen = () => { if (both()) link.markOpen(); };
  ctl.onopen = onOpen;
  state.onopen = onOpen;
  ctl.onclose = () => link.markClosed('channel-closed');
  state.onclose = () => link.markClosed('channel-closed');
  ctl.onmessage = (ev) => link.deliver('ctl', ev.data);
  state.onmessage = (ev) => link.deliver('state', ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : ev.data);
  ctl.onbufferedamountlow = () => link.emit('drain');
  onOpen();
  // Connection health (decision 17): 'disconnected' usually recovers, so the session waits; 'failed'
  // is final for this connection.
  let failTimer = null;
  const watch = () => {
    const s = pc.connectionState ?? pc.iceConnectionState;
    link.emit('status', { state: s });
    if (s === 'failed') link.markClosed('ice-failed');
    else if (s === 'closed') link.markClosed('closed');
    else if (s === 'disconnected') { if (!failTimer) failTimer = setTimeout(() => { failTimer = null; if ((pc.connectionState ?? pc.iceConnectionState) === 'disconnected') link.emit('status', { state: 'stalled' }); }, 5000); }
    else if (failTimer) { clearTimeout(failTimer); failTimer = null; }
  };
  pc.addEventListener('connectionstatechange', watch);
  pc.addEventListener('iceconnectionstatechange', watch);
  link.send = (ch, data) => {
    if (!link.open || link.closed) return false;
    const c = ch === 'ctl' ? ctl : ch === 'state' ? state : null;
    if (!c || c.readyState !== 'open') return false;
    if (ch === 'state' && c.bufferedAmount > STATE_BACKLOG) { link.stats.dropped += 1; return false; }
    try { c.send(data); } catch { return false; }
    link.countOut(ch, data);
    return true;
  };
  link.buffered = (ch) => (ch === 'ctl' ? ctl.bufferedAmount : state.bufferedAmount);
  link.close = (reason = 'closed') => {
    if (link.closed) return;
    link.markClosed(reason);
    try { ctl.close(); state.close(); } catch { /* closed */ }
    if (ownsPc) try { pc.close(); } catch { /* closed */ }
  };
  // The selected candidate pair's type (host / srflx / relay), logged for bug reports.
  link.pathInfo = async () => {
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((r) => { if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') pair = r; });
      if (!pair) return null;
      const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
      return { local: local?.candidateType ?? null, remote: remote?.candidateType ?? null, rtt: pair.currentRoundTripTime ?? null };
    } catch { return null; }
  };
  return link;
}

// Waits for ICE gathering to finish (non-trickle: the code carries every candidate), capped.
export function gatherComplete(pc, capMs = 3000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, capMs);
    function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    function check() { if (pc.iceGatheringState === 'complete') done(); }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// The manual flow (and the real-WebRTC e2e test, which relays these strings itself):
//   host:  const h = await createOffer();   share h.offer (an SDP string)
//   guest: const g = await acceptOffer(sdp); share g.answer
//   host:  await h.acceptAnswer(answerSdp)
// Each returns { link } wired to the two channels; the link opens once ICE + DTLS complete.
export async function createOffer({ rtcConfig = RTC_CONFIG, gatherMs = 3000 } = {}) {
  const pc = new RTCPeerConnection(rtcConfig);
  const link = linkFromPeerConnection(pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gatherComplete(pc, gatherMs);
  return {
    link, pc,
    offer: pc.localDescription.sdp,
    async acceptAnswer(sdp) { await pc.setRemoteDescription({ type: 'answer', sdp }); return link; },
  };
}

export async function acceptOffer(sdp, { rtcConfig = RTC_CONFIG, gatherMs = 3000 } = {}) {
  const pc = new RTCPeerConnection(rtcConfig);
  const link = linkFromPeerConnection(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gatherComplete(pc, gatherMs);
  return { link, pc, answer: pc.localDescription.sdp };
}

// Lobby pre-check (decision 7): no server-reflexive candidate within 3 s means UDP to the STUN
// servers is blocked, so a direct link will very likely fail. Resolves 'ok' | 'blocked' | 'unknown'.
export async function stunPrecheck({ timeoutMs = 3000 } = {}) {
  if (!webrtcAvailable()) return 'unknown';
  let pc;
  try {
    pc = new RTCPeerConnection(RTC_CONFIG);
    pc.createDataChannel('probe');
    let srflx = false;
    pc.onicecandidate = (e) => { if (e.candidate && / typ srflx /.test(e.candidate.candidate)) srflx = true; };
    await pc.setLocalDescription(await pc.createOffer());
    await gatherComplete(pc, timeoutMs);
    return srflx ? 'ok' : 'blocked';
  } catch { return 'unknown'; } finally { try { pc?.close(); } catch { /* closed */ } }
}
