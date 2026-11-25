// The online session (workstream D2; research decisions 11, 16, 17, 21): one host, one guest.
//
//   host: createHostSession({ signaller, code, hello, getWelcome, clock })
//   guest: createGuestSession({ signaller, code, hello, clock })
//   s.start()                          begin (host: wait for a guest; guest: connect)
//   s.send(msg)                        a JSON control message on 'ctl' (reliable, ordered)
//   s.sendState(bytes)                 a binary message on 'state' (may drop)
//   s.on(name, fn)                     events below
//   s.close(reason)                    leave cleanly (sends 'bye')
//
// Events:
//   status ({ state, detail })   for the UI: waiting | connecting | handshake | connected |
//                                 away (peer silent > 1 s) | reconnecting | closed
//   guest (host only) ({ rejoin, kit, name }) a guest passed the handshake (rejoin: same token)
//   welcome (guest only) (state)  the host's full state, after the chunks arrive (also after a reconnect)
//   message (msg)                 a validated control message from the peer
//   state (data: Uint8Array)      a binary state message (not ping/pong, handled here)
//   hostAway (on)                 the host's tab was hidden / shown again
//   ended ({ reason })            the session is over for good: host-left, kicked, version,
//                                 room-full, timeout, closed
//
// Handshake: the guest's first message is 'hello' { proto, build, content, kit, name, token? }.
// The host refuses another protocol, another build or other game content ('version'), and a
// second guest ('room-full'). A guest whose token matches the slot held after a drop resumes it
// (the host holds it for 60 s). Until the handshake passes every other message is dropped.
//
// Liveness: everything received counts as a heartbeat. Silent for 1 s: the peer is 'away' (its
// hero is ignored by aggro). Link closed or silent for 6 s: the guest reconnects through the same
// signaller (fresh link, same token, fresh welcome); the host waits up to 60 s for it.
import { CH, BIN, PROTO, BUILD, LIMITS, parseCtl, cleanText } from './protocol.js';
import { createWriter } from './codec/binary.js';
import { encodePing, encodePong, decodePing, binType } from './codec/snapshot.js';
import { createClockSync } from './clock.js';
import { realClock } from './transport/loopback.js';
import { randomId } from './transport/broadcast.js';

export const AWAY_MS = 1000;
export const LOST_MS = 6000;
export const HOLD_MS = 60000;
export const HELLO_TIMEOUT_MS = 10000;

// Object.assign would read getters once; this keeps them live.
function extend(target, src) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(src)); return target; }

function createEmitter() {
  const h = new Map();
  return {
    on(n, fn) { let s = h.get(n); if (!s) { s = new Set(); h.set(n, s); } s.add(fn); return () => s.delete(fn); },
    emit(n, ...a) { for (const fn of [...(h.get(n) ?? [])]) { try { fn(...a); } catch (err) { console.error(err); } } },
  };
}

// Splits a JSON string into ≤16 KiB chunks for the ctl channel.
export function chunkString(s, size = LIMITS.chunk) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [''];
}

function base({ clock = realClock, role }) {
  const em = createEmitter();
  const w = createWriter(64);
  const s = {
    role,
    link: null,
    state: 'idle',
    lastHeard: 0,
    away: false,
    ended: false,
    on: em.on,
    emit: em.emit,
    clock,
    setStatus(state, detail = null) {
      if (s.state === state && !detail) return;
      s.state = state;
      em.emit('status', { state, detail });
    },
    send(msg) {
      if (!s.link?.open) return false;
      let str;
      try { str = JSON.stringify(msg); } catch { return false; }
      if (str.length > LIMITS.maxMessage) return false;
      return s.link.send(CH.CTL, str);
    },
    sendState(bytes) { return !!s.link?.open && s.link.send(CH.STATE, bytes); },
    writer: w,
  };
  return s;
}

// ---------------------------------------------------------------- host
export function createHostSession({ signaller, code, hello: mine, getWelcome = () => ({}), clock = realClock, now = () => clock.now() }) {
  const s = base({ clock, role: 'host' });
  let guest = null; // { token, kit, name }
  let lostAt = 0, holdTimer = null, liveTimer = null, helloTimer = null, waiting = false;
  const offs = [];

  function attach(link) {
    for (const off of offs.splice(0)) off();
    s.link = link;
    s.lastHeard = now();
    let ok = false;
    s.setStatus('handshake');
    helloTimer = clock.setTimeout(() => { if (!ok) link.close('hello-timeout'); }, HELLO_TIMEOUT_MS);
    offs.push(link.on('message', (ch, data) => {
      s.lastHeard = now();
      if (s.away) { s.away = false; s.emit('peerAway', false); if (ok) s.setStatus('connected'); }
      if (ch === CH.STATE) {
        if (!ok) return;
        if (binType(data) === BIN.PING) {
          const p = decodePing(data);
          if (p) { const t = now(); s.sendState(encodePong(s.writer, p.t0, t, now())); }
          return;
        }
        s.emit('state', data);
        return;
      }
      const m = parseCtl(data, 'guest');
      if (!m) { s.dropped = (s.dropped ?? 0) + 1; return; }
      if (!ok) {
        if (m.t !== 'hello') return;
        clock.clearTimeout(helloTimer);
        const verdict = judge(m);
        if (verdict) { s.send({ t: 'refuse', reason: verdict }); clock.setTimeout(() => link.close(verdict), 50); return; }
        ok = true;
        const rejoin = !!guest && m.token === guest.token;
        if (!rejoin) guest = { token: randomId(), kit: cleanText(m.kit, 24), name: cleanText(m.name ?? '', LIMITS.maxName) || 'Player 2' };
        else guest.kit = cleanText(m.kit, 24) || guest.kit;
        if (holdTimer) { clock.clearTimeout(holdTimer); holdTimer = null; }
        sendWelcome();
        s.setStatus('connected');
        s.emit('guest', { rejoin, kit: guest.kit, name: guest.name });
        return;
      }
      if (m.t === 'bye') { s.emit('guestLeft', { reason: m.reason ?? 'left' }); guest = null; link.close('bye'); return; }
      if (m.t === 'resync') { sendWelcome(); return; }
      s.emit('message', m);
    }));
    offs.push(link.on('close', () => {
      clock.clearTimeout(helloTimer);
      if (s.ended || s.link !== link) return;
      s.link = null;
      if (ok && guest) lose(); else waitForGuest();
    }));
  }

  function judge(m) {
    if (m.proto !== PROTO || m.build !== mine.build || m.content !== mine.content) return 'version';
    if (guest && m.token !== guest.token && s.link && s.state === 'connected') return 'room-full';
    if (guest && m.token !== guest.token && holdTimer) return 'room-full';
    return null;
  }

  function sendWelcome() {
    let str = '{}';
    try { str = JSON.stringify(getWelcome() ?? {}); } catch { /* an empty welcome */ }
    const parts = chunkString(str);
    s.send({ t: 'welcome', slot: 1, token: guest.token, hostNow: now(), parts: parts.length, kit: mine.kit, name: mine.name ?? 'Player 1' });
    parts.forEach((data, i) => s.send({ t: 'chunk', i, n: parts.length, data }));
  }

  // The guest dropped: hold its slot for 60 s and wait for it on the same code.
  function lose() {
    lostAt = now();
    s.setStatus('reconnecting', { since: lostAt });
    s.emit('guestLost', {});
    holdTimer = clock.setTimeout(() => {
      holdTimer = null;
      s.emit('guestLeft', { reason: 'timeout' });
      guest = null;
      s.setStatus('waiting');
    }, HOLD_MS);
    waitForGuest();
  }

  async function waitForGuest() {
    if (waiting || s.ended) return;
    waiting = true;
    if (!holdTimer) s.setStatus('waiting');
    try {
      const link = await signaller.host(code, { onStatus: (st) => s.emit('signal', st) });
      waiting = false;
      if (s.ended) { link.close('ended'); return; }
      attach(link);
    } catch (err) {
      waiting = false;
      if (!s.ended) s.emit('error', { reason: err?.message ?? 'error' });
    }
  }

  function tick() {
    if (s.ended) return;
    const quiet = now() - s.lastHeard;
    if (s.link?.open && s.state === 'connected' && !s.away && quiet > AWAY_MS) { s.away = true; s.emit('peerAway', true); s.setStatus('away'); }
    if (s.link?.open && quiet > LOST_MS && s.state !== 'handshake') { const l = s.link; s.link = null; l.close('silent'); if (guest) lose(); }
    // Keepalive: a timer, so it still runs (at 1 Hz) while this tab is hidden and rAF has stopped.
    if (s.link?.open) s.send({ t: 'ping', id: 'k' });
    liveTimer = clock.setTimeout(tick, 500);
  }

  extend(s, {
    code,
    get guest() { return guest; },
    start() { s.ended = false; waitForGuest(); liveTimer = clock.setTimeout(tick, 500); return s; },
    hostAway(on) { s.send({ t: 'hostAway', on: !!on }); },
    kick() { if (s.link) { s.send({ t: 'bye', reason: 'kicked' }); const l = s.link; clock.setTimeout(() => l.close('kicked'), 50); } guest = null; },
    close(reason = 'host-left') {
      if (s.ended) return;
      s.send({ t: 'bye', reason });
      s.ended = true;
      const l = s.link;
      clock.setTimeout(() => l?.close(reason), 30);
      clock.clearTimeout(liveTimer); clock.clearTimeout(holdTimer);
      signaller.close?.();
      s.setStatus('closed');
    },
    // Tests: the link in use (to unplug it).
    get connected() { return !!s.link?.open && s.state !== 'handshake'; },
  });
  return s;
}

// ---------------------------------------------------------------- guest
export function createGuestSession({ signaller, code, hello: mine, clock = realClock, now = () => clock.now(), storage = null }) {
  const s = base({ clock, role: 'guest' });
  const sync = createClockSync({ now });
  let token = null;
  try { const saved = JSON.parse(storage?.getItem?.('gotham-net-token') ?? 'null'); if (saved?.code === code) token = saved.token; } catch { /* none */ }
  let welcomed = false, pingT = 0, liveTimer = null, connecting = false, reconnectUntil = 0, started = 0;
  let chunks = null, welcomeMsg = null;
  const offs = [];
  let host = null;

  function attach(link) {
    for (const off of offs.splice(0)) off();
    s.link = link;
    s.lastHeard = now();
    welcomed = false;
    chunks = null;
    s.setStatus('handshake');
    sync.reset();
    started = now();
    const sayHello = () => s.send({ t: 'hello', proto: PROTO, build: mine.build ?? BUILD, content: mine.content, kit: mine.kit, name: mine.name ?? 'Player 2', ...(token ? { token } : {}) });
    sayHello();
    // A negotiated channel can open on one side a moment before the other has made its own: say
    // hello again until the host answers.
    const again = () => { if (s.link === link && !welcomed && link.open && !s.ended) { sayHello(); clock.setTimeout(again, 1000); } };
    clock.setTimeout(again, 1000);
    offs.push(link.on('message', (ch, data) => {
      s.lastHeard = now();
      if (s.away) { s.away = false; s.emit('peerAway', false); if (welcomed) s.setStatus('connected'); }
      if (ch === CH.STATE) {
        if (binType(data) === BIN.PONG) {
          const p = decodePing(data);
          if (p?.type === 'pong') sync.sample(p.t0, p.t1, p.t2, now());
          return;
        }
        if (welcomed) s.emit('state', data);
        return;
      }
      const m = parseCtl(data, 'host');
      if (!m) { s.dropped = (s.dropped ?? 0) + 1; return; }
      if (m.t === 'refuse') { end(m.reason === 'room-full' ? 'room-full' : m.reason === 'version' ? 'version' : 'refused'); return; }
      if (m.t === 'bye') { end(m.reason === 'kicked' ? 'kicked' : 'host-left'); return; }
      if (m.t === 'welcome') {
        token = m.token;
        try { storage?.setItem?.('gotham-net-token', JSON.stringify({ code, token })); } catch { /* private mode */ }
        host = { kit: cleanText(m.kit ?? 'm', 24), name: cleanText(m.name ?? 'Player 1', LIMITS.maxName) };
        welcomeMsg = m;
        chunks = new Array(m.parts).fill(null);
        if (!m.parts) finishWelcome('{}');
        return;
      }
      if (m.t === 'chunk') {
        if (!chunks || m.n !== chunks.length) return;
        chunks[m.i] = m.data;
        if (chunks.every((c) => c !== null)) { const str = chunks.join(''); chunks = null; finishWelcome(str); }
        return;
      }
      if (m.t === 'hostAway') { s.emit('hostAway', m.on); return; }
      if (m.t === 'ping' && m.id === 'k') return;
      if (!welcomed) return;
      s.emit('message', m);
    }));
    offs.push(link.on('close', (reason) => {
      if (s.ended || s.link !== link) return;
      s.link = null;
      if (!welcomed && !token) { end(reason === 'ice-failed' ? 'ice-failed' : 'closed'); return; }
      reconnect();
    }));
  }

  function finishWelcome(str) {
    let state = {};
    try { state = JSON.parse(str); } catch { state = {}; }
    // Clock: the welcome's hostNow is a first guess (one-way delay unknown) until pings answer.
    welcomed = true;
    s.setStatus('connected');
    s.emit('welcome', { state, host, rejoin: s.rejoining ?? false, msg: welcomeMsg });
    s.rejoining = false;
  }

  function end(reason) {
    if (s.ended) return;
    s.ended = true;
    clock.clearTimeout(liveTimer);
    const l = s.link; s.link = null;
    try { l?.close(reason); } catch { /* closed */ }
    signaller.close?.();
    s.setStatus('closed', { reason });
    s.emit('ended', { reason });
  }

  async function connect() {
    if (connecting || s.ended) return;
    connecting = true;
    s.setStatus('connecting');
    try {
      await signaller.reset?.();
      const link = await signaller.join(code, { onStatus: (st) => s.emit('signal', st) });
      connecting = false;
      if (s.ended) { link.close('ended'); return; }
      attach(link);
    } catch (err) {
      connecting = false;
      const reason = err?.message ?? 'error';
      // A first attempt fails for good; a reconnect keeps trying until its minute is up.
      if (reconnectUntil && now() < reconnectUntil && reason !== 'version' && reason !== 'room-full') clock.setTimeout(connect, 1500);
      else end(reconnectUntil ? 'timeout' : reason);
    }
  }

  function reconnect() {
    if (s.ended) return;
    if (!reconnectUntil) reconnectUntil = now() + HOLD_MS;
    welcomed = false;
    s.rejoining = true;
    s.setStatus('reconnecting', { until: reconnectUntil });
    s.emit('lost', {});
    connect();
  }

  function tick() {
    if (s.ended) return;
    sync.tick();
    const t = now();
    if (s.link?.open && welcomed) {
      const quiet = t - s.lastHeard;
      if (!s.away && quiet > AWAY_MS) { s.away = true; s.emit('peerAway', true); s.setStatus('away'); }
      if (quiet > LOST_MS) { const l = s.link; s.link = null; l.close('silent'); reconnect(); }
    }
    // Clock pings: 4 Hz for the first 2 s of a link, then 1 Hz (on 'state', so retransmits never
    // inflate the round trip).
    if (s.link?.open && t >= pingT) {
      s.sendState(encodePing(s.writer, t));
      pingT = t + (t - started < 2000 ? 250 : 1000);
    }
    if (welcomed && s.link?.open) reconnectUntil = 0;
    liveTimer = clock.setTimeout(tick, 100);
  }

  extend(s, {
    code,
    sync,
    get host() { return host; },
    get welcomed() { return welcomed; },
    hostNow: () => sync.hostNow(),
    start() { connect(); liveTimer = clock.setTimeout(tick, 100); return s; },
    resync() { s.send({ t: 'resync' }); },
    close(reason = 'left') {
      if (s.ended) return;
      s.send({ t: 'bye', reason });
      const l = s.link;
      clock.setTimeout(() => l?.close(reason), 30);
      s.link = null;
      end('closed');
    },
  });
  return s;
}
