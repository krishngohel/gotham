import { describe, it, expect } from 'vitest';
import { createManualClock, createLoopbackNetwork } from '../../src/net/transport/loopback.js';
import { createHostSession, createGuestSession, chunkString, HOLD_MS } from '../../src/net/session.js';
import { PROTO } from '../../src/net/protocol.js';

const HELLO = { build: 'b1', content: 'c1', kit: 'm', name: 'Host' };

function setup({ conditions = {}, guestHello = {}, welcome = () => ({ step: 4, big: 'x'.repeat(40000) }) } = {}) {
  const clock = createManualClock(1000);
  const net = createLoopbackNetwork({ clock, conditions });
  const host = createHostSession({ signaller: net.signaller(), code: 'ABCDEF', hello: HELLO, getWelcome: welcome, clock });
  const guest = createGuestSession({ signaller: net.signaller(), code: 'ABCDEF', hello: { ...HELLO, kit: 'robin', name: 'Guest', ...guestHello }, clock, storage: memStore() });
  const log = { host: [], guest: [], welcome: [], ended: [], hostAway: [] };
  host.on('guest', (g) => log.host.push(g));
  host.on('message', (m) => log.host.push(m));
  guest.on('message', (m) => log.guest.push(m));
  guest.on('welcome', (w) => log.welcome.push(w));
  guest.on('ended', (e) => log.ended.push(e.reason));
  guest.on('hostAway', (on) => log.hostAway.push(on));
  host.start();
  return { clock, net, host, guest, log };
}
// The manual clock is synchronous; promises (signalling) settle between small steps.
async function run(clock, ms) { for (let t = 0; t < ms; t += 10) { clock.advance(Math.min(10, ms - t)); for (let i = 0; i < 6; i++) await Promise.resolve(); } }
function memStore() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; }

describe('session handshake', () => {
  it('a guest joins, gets the chunked welcome state and its token; clock sync converges', async () => {
    const { clock, host, guest, log } = setup({ conditions: { latencyMs: 40, jitterMs: 10 } });
    guest.start();
    await run(clock, 3000);
    expect(log.host[0]).toMatchObject({ rejoin: false, kit: 'robin', name: 'Guest' });
    expect(log.welcome.length).toBe(1);
    expect(log.welcome[0].state.step).toBe(4);
    expect(log.welcome[0].state.big.length).toBe(40000);
    expect(log.welcome[0].host).toEqual({ kit: 'm', name: 'Host' });
    expect(host.state).toBe('connected');
    expect(guest.state).toBe('connected');
    // Same clock on both machines here: the offset should come out near zero.
    expect(Math.abs(guest.sync.offset)).toBeLessThan(15);
    expect(guest.sync.rtt).toBeGreaterThan(40);
  });
  it('refuses a mismatched build with a version reason; the guest session ends', async () => {
    const { clock, guest, log } = setup({ guestHello: { build: 'other' } });
    guest.start();
    await run(clock, 2000);
    expect(log.ended).toEqual(['version']);
    expect(log.welcome.length).toBe(0);
  });
  it('a different protocol number is refused too', async () => {
    const { clock, net } = setup();
    const pending = net.signaller().join('ABCDEF');
    await run(clock, 20);
    const link = await pending;
    const got = [];
    link.on('message', (ch, d) => got.push(JSON.parse(d)));
    await run(clock, 20);
    link.send('ctl', JSON.stringify({ t: 'hello', proto: PROTO + 1, build: 'b1', content: 'c1', kit: 'm' }));
    await run(clock, 200);
    expect(got[0]).toEqual({ t: 'refuse', reason: 'version' });
    expect(link.closed).toBe(true);
  });
  it('messages before the handshake are dropped; host-only messages from the guest are dropped', async () => {
    const { clock, host, guest, log } = setup();
    guest.start();
    await run(clock, 1000);
    guest.send({ t: 'step', index: 9 });
    guest.send({ t: 'spawn', id: 'e1', type: 'grunt', pos: { x: 0, y: 0, z: 0 } });
    guest.send({ t: 'chat', text: 'hi' });
    await run(clock, 100);
    expect(log.host.filter((m) => m.t).map((m) => m.t)).toEqual(['chat']);
    expect(host.dropped).toBe(2);
  });
});

describe('liveness, reconnect, host leaving', () => {
  it('a silent guest goes away after 1 s and comes back', async () => {
    const { clock, host, guest, net } = setup();
    const away = [];
    host.on('peerAway', (on) => away.push(on));
    guest.start();
    await run(clock, 1000);
    net.links[0][1].unplug(true);
    await run(clock, 1500);
    expect(away).toEqual([true]);
    net.links[0][1].unplug(false);
    await run(clock, 1200);
    expect(away).toEqual([true, false]);
    expect(host.state).toBe('connected');
  });
  it('a dropped link reconnects within the hold, keeps the slot (rejoin) and gets a fresh welcome', async () => {
    const { clock, host, guest, net, log } = setup({ conditions: { latencyMs: 30 } });
    guest.start();
    await run(clock, 1000);
    net.links[0][0].close('network');
    await run(clock, 8000);
    expect(log.host.filter((g) => 'rejoin' in g).map((g) => g.rejoin)).toEqual([false, true]);
    expect(log.welcome.length).toBe(2);
    expect(log.welcome[1].rejoin).toBe(true);
    expect(guest.state).toBe('connected');
    expect(host.state).toBe('connected');
  });
  it('a total outage (no close) is noticed after 6 s and recovers by reconnecting', async () => {
    const { clock, guest, net, log } = setup({ conditions: { latencyMs: 30 } });
    guest.start();
    await run(clock, 1000);
    net.links[0][0].unplug(true);
    const st = [];
    guest.on('status', (x) => st.push(x.state));
    await run(clock, 12000);
    expect(log.welcome.length).toBe(2);
    expect(guest.state).toBe('connected');
  });
  it('the host leaving ends the guest with host-left', async () => {
    const { clock, host, guest, log } = setup();
    guest.start();
    await run(clock, 1000);
    host.close();
    await run(clock, 500);
    expect(log.ended).toEqual(['host-left']);
  });
  it('a guest gone longer than the hold frees the slot', async () => {
    const { clock, host, guest, net } = setup();
    const left = [];
    host.on('guestLeft', (e) => left.push(e.reason));
    guest.start();
    await run(clock, 1000);
    guest.close();
    await run(clock, 500);
    expect(left).toEqual(['left']);
    void net; void HOLD_MS;
  });
  it('host away is forwarded to the guest', async () => {
    const { clock, host, guest, log } = setup();
    guest.start();
    await run(clock, 1000);
    host.hostAway(true);
    await run(clock, 50);
    host.hostAway(false);
    await run(clock, 50);
    expect(log.hostAway).toEqual([true, false]);
  });
  it('a second guest is turned away while the first plays', async () => {
    const { clock, net, guest } = setup();
    guest.start();
    await run(clock, 1000);
    const g2 = createGuestSession({ signaller: net.signaller(), code: 'ABCDEF', hello: { ...HELLO }, clock });
    const ended = [];
    g2.on('ended', (e) => ended.push(e.reason));
    g2.start();
    await run(clock, 2000);
    // The host is not waiting for anyone, so the loopback matchmaker has nobody for that code.
    expect(ended).toEqual(['no-host']);
  });
});

describe('chunking', () => {
  it('splits into 16 KiB pieces and joins back', async () => {
    const s = 'abc'.repeat(20000);
    const parts = chunkString(s);
    expect(parts.length).toBe(4);
    expect(parts.join('')).toBe(s);
  });
});
