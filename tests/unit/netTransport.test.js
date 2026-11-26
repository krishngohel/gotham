import { describe, it, expect } from 'vitest';
import { createLoopbackPair, createManualClock, PRESETS } from '../../src/net/transport/loopback.js';
import { createClockSync, createInterpDelay, createSampleBuffer } from '../../src/net/clock.js';
import { packSdp, unpackSdp } from '../../src/net/signal/signallers.js';

function pair(opts) {
  const clock = createManualClock();
  const [a, b] = createLoopbackPair({ clock, ...opts });
  clock.advance(1);
  return { a, b, clock };
}

describe('loopback transport and its link conditioner', () => {
  it('opens both ends and delivers both channels', () => {
    const { a, b, clock } = pair({ latencyMs: 20 });
    expect(a.open && b.open).toBe(true);
    const got = [];
    b.on('message', (ch, d) => got.push([ch, typeof d === 'string' ? d : [...d]]));
    a.send('ctl', 'hello');
    a.send('state', new Uint8Array([1, 2, 3]));
    clock.advance(19);
    expect(got).toEqual([]);
    clock.advance(2);
    expect(got).toEqual([['ctl', 'hello'], ['state', [1, 2, 3]]]);
  });
  it('ctl stays ordered and lossless under jitter and 15% loss; only state loses', () => {
    const { a, b, clock } = pair({ ...PRESETS.awful, seed: 3 });
    const ctl = [], state = [];
    b.on('message', (ch, d) => (ch === 'ctl' ? ctl.push(Number(d)) : state.push(d[0])));
    for (let i = 0; i < 400; i++) { a.send('ctl', String(i)); a.send('state', new Uint8Array([i & 255])); clock.advance(5); }
    clock.advance(2000);
    expect(ctl).toEqual(Array.from({ length: 400 }, (_, i) => i));
    expect(state.length).toBeLessThan(400);
    expect(state.length).toBeGreaterThan(300);
  });
  it('reorders and duplicates the state channel when asked', () => {
    const { a, b, clock } = pair({ latencyMs: 30, jitterMs: 20, reorder: 0.3, duplicate: 0.2, seed: 8 });
    const got = [];
    b.on('message', (ch, d) => got.push(d[0]));
    for (let i = 0; i < 100; i++) { a.send('state', new Uint8Array([i])); clock.advance(3); }
    clock.advance(1000);
    expect(got.length).toBeGreaterThan(100);
    expect(got.some((v, i) => i > 0 && v < got[i - 1])).toBe(true);
  });
  it('a sender keeping the buffer cannot change what was sent', () => {
    const { a, b, clock } = pair({ latencyMs: 10 });
    const got = [];
    b.on('message', (ch, d) => got.push(d[0]));
    const buf = new Uint8Array([7]);
    a.send('state', buf);
    buf[0] = 9;
    clock.advance(20);
    expect(got).toEqual([7]);
  });
  it('closing one end closes the other; sends after close fail', () => {
    const { a, b, clock } = pair({ latencyMs: 10 });
    let reason = null;
    b.on('close', (r) => { reason = r; });
    a.close('bye');
    clock.advance(20);
    expect(reason).toBe('peer-closed');
    expect(a.send('ctl', 'x')).toBe(false);
  });
  it('oversized messages are rejected on receipt', () => {
    const { a, b, clock } = pair({});
    let n = 0;
    b.on('message', () => n++);
    a.send('ctl', 'x'.repeat(70000));
    clock.advance(5);
    expect(n).toBe(0);
    expect(b.stats.rejected).toBe(1);
  });
});

describe('clock sync', () => {
  it('converges on the true offset from the minimum-RTT sample, slewing smoothly', () => {
    let local = 1000;
    const trueOffset = 50000;
    const c = createClockSync({ now: () => local, slew: 1 });
    // Asymmetric jitter: the min-RTT sample is the accurate one.
    const jit = [40, 5, 90, 12, 3, 60];
    for (const j of jit) {
      const t0 = local; local += 10 + j; const t1 = local + trueOffset; local += 1; const t2 = local + trueOffset; local += 10; c.sample(t0, t1, t2, local);
    }
    expect(Math.abs(c.offset - trueOffset)).toBeLessThan(50);
    for (let i = 0; i < 200; i++) c.tick();
    expect(Math.abs(c.hostNow() - (local + trueOffset))).toBeLessThan(3);
  });
  it('interp delay = one-way lag + a buffer that adapts between 100 and 250 ms', () => {
    const d = createInterpDelay();
    expect(d.value).toBe(125);
    for (let i = 0; i < 300; i++) d.note(i * 50 + 80 + (i % 10) * 30, i * 50);
    expect(d.buffer).toBeLessThanOrEqual(250);
    expect(d.buffer).toBeGreaterThan(200);
    const q = createInterpDelay();
    for (let i = 0; i < 300; i++) q.note(i * 50 + 200, i * 50);
    expect(q.buffer).toBeGreaterThanOrEqual(100);
    expect(q.buffer).toBeLessThan(110);
    expect(q.lag).toBeGreaterThan(190);
    expect(q.value).toBeGreaterThan(290);
  });
});

describe('sample buffer', () => {
  it('interpolates, extrapolates at most 100 ms, then holds; drops out-of-order samples', () => {
    const b = createSampleBuffer();
    b.push(0, 0, 0, 0, 0);
    b.push(100, 10, 0, 0, 1);
    expect(b.push(50, 99, 0, 0, 0)).toBe(false);
    expect(b.sample(50).x).toBeCloseTo(5);
    expect(b.sample(50).yaw).toBeCloseTo(0.5);
    expect(b.sample(150).x).toBeCloseTo(15);
    expect(b.sample(150).extrapolated).toBe(true);
    expect(b.sample(900).x).toBeCloseTo(20);
    expect(b.sample(-10).x).toBe(0);
  });
  it('yaw interpolates the short way round', () => {
    const b = createSampleBuffer();
    b.push(0, 0, 0, 0, 3.0);
    b.push(100, 0, 0, 0, -3.0);
    const y = b.sample(50).yaw;
    expect(Math.abs(Math.cos(y) - Math.cos(Math.PI))).toBeLessThan(0.01);
  });
});

describe('manual codes', () => {
  it('SDP packs to a short base64url code and back', async () => {
    const sdp = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:abcd\r\na=ice-pwd:aaaaaaaaaaaaaaaaaaaaaaaa\r\na=fingerprint:sha-256 ' + 'AB:'.repeat(31) + 'AB\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n';
    const code = await packSdp(sdp);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(sdp.length);
    expect(await unpackSdp(code)).toBe(sdp);
    await expect(unpackSdp('!!!')).rejects.toBeTruthy();
  });
});
