import { describe, it, expect } from 'vitest';
import { createWriter, createReader, yawToU16, u16ToYaw, hash32, createClipTable } from '../../src/net/codec/binary.js';
import {
  encodeSnapshot, decodeSnapshot, encodeHeroState, decodeHeroState, encodePing, encodePong, decodePing,
  HEADER_BYTES, HERO_BYTES, ENEMY_BYTES, PROP_BYTES, EF, HF, enemyNum, seqNewer,
} from '../../src/net/codec/snapshot.js';
import { parseCtl, normalizeCode, makeRoomCode, cleanText, createRateLimiter, LIMITS, PROTO } from '../../src/net/protocol.js';
import { createRng } from '../../src/core/rng.js';

const hero = (o = {}) => ({ slot: 0, x: 1234.5, y: 30.25, z: -812.75, vx: 3.5, vy: -1, vz: 0.25, yaw: 1.25, clip: hash32('Run_Loop'), clipT: 0.734, speed: 1.25, health: 87, maxHealth: 100, flags: HF.blocking | HF.grounded, state: 'glide', seat: 2, held: 0b1011, ...o });
const enemy = (i, o = {}) => ({ num: i, x: 100 + i * 1.37, y: 2 + i * 0.01, z: -50 - i, yaw: (i * 0.4) % 6, clip: hash32('Goon_Hook'), clipT: 0.25 + i * 0.01, speed: 1.5, state: i % 2 ? 'windup' : 'engage', health: 3 + i * 0.5, flags: EF.alive | EF.aware, glyph: i % 3 ? 'blue' : null, target: i % 2, ...o });

describe('binary writer / reader', () => {
  it('round-trips every field type and grows its buffer', () => {
    const w = createWriter(4);
    w.u8(250).u16(65000).i16(-1234).u32(4000000000).f32(1.5).f64(Math.PI).str('héllo');
    const r = createReader(w.copy());
    expect([r.u8(), r.u16(), r.i16(), r.u32(), r.f32(), r.f64(), r.str()]).toEqual([250, 65000, -1234, 4000000000, 1.5, Math.PI, 'héllo']);
    expect(r.bad).toBe(false);
    expect(r.left).toBe(0);
  });
  it('reading past the end flags bad and returns 0 instead of throwing', () => {
    const r = createReader(new Uint8Array([1]));
    expect(r.u32()).toBe(0);
    expect(r.bad).toBe(true);
  });
  it('angles survive quantisation within 0.0001 rad', () => {
    for (const a of [0, 1, -1, Math.PI, -3, 6.2]) {
      const b = u16ToYaw(yawToU16(a));
      expect(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))).toBeLessThan(1e-4);
    }
  });
  it('the clip table maps a hash back to a clip name and refreshes when packs add clips', () => {
    const clips = new Map([['Idle_Loop', 1]]);
    const t = createClipTable();
    expect(t.name(t.hash('Idle_Loop'), clips)).toBe('Idle_Loop');
    expect(t.name(hash32('Goon_Hook'), clips)).toBe(null);
    clips.set('Goon_Hook', 2);
    expect(t.name(hash32('Goon_Hook'), clips)).toBe('Goon_Hook');
  });
});

describe('snapshot codec', () => {
  it('round-trips heroes, enemies and props; enemies within 2 cm, health exactly to 0.1', () => {
    const w = createWriter();
    const packets = [];
    const snap = { seq: 41, hostTime: 123456.789, heroes: [hero()], enemies: [enemy(1), enemy(2), enemy(3)], props: [{ id: 3, x: 1, y: 2, z: 3, yaw: 0.5, pitch: 0.1, roll: -0.1, speed: 22.5, flags: 1 }] };
    const r = encodeSnapshot(w, snap, (b) => packets.push(b.slice()));
    expect(r.parts).toBe(1);
    expect(packets[0].byteLength).toBe(HEADER_BYTES + HERO_BYTES + 3 * ENEMY_BYTES + PROP_BYTES);
    const d = decodeSnapshot(packets[0]);
    expect(d.seq).toBe(41);
    expect(d.hostTime).toBeCloseTo(123456.789, 6);
    const h = d.heroes[0];
    expect(h.x).toBeCloseTo(1234.5, 3);
    expect(h.state).toBe('glide');
    expect(h.seat).toBe(2);
    expect(h.held).toBe(0b1011);
    expect(h.health).toBe(87);
    expect(h.flags).toBe(HF.blocking | HF.grounded);
    expect(h.clipT).toBeCloseTo(0.734, 3);
    for (let i = 0; i < 3; i++) {
      const a = snap.enemies[i], b = d.enemies[i];
      expect(b.num).toBe(a.num);
      expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(0.011);
      expect(Math.abs(b.z - a.z)).toBeLessThanOrEqual(0.011);
      expect(b.health).toBeCloseTo(a.health, 5);
      expect(b.state).toBe(a.state);
      expect(b.glyph).toBe(a.glyph);
      expect(b.target).toBe(a.target);
      expect(b.clip).toBe(a.clip);
    }
    expect(d.props[0].speed).toBeCloseTo(22.5, 2);
  });
  it('splits a big or spread-out world into self-contained parts of at most 1,100 bytes', () => {
    const w = createWriter();
    const packets = [];
    const enemies = [];
    for (let i = 0; i < 100; i++) enemies.push(enemy(i, { x: i < 50 ? 10 + i : 3000 + i }));
    const r = encodeSnapshot(w, { seq: 1, hostTime: 5, heroes: [hero(), hero({ slot: 1 })], enemies }, (b) => packets.push(b.slice()));
    expect(r.parts).toBeGreaterThan(2);
    let total = 0;
    for (const p of packets) {
      expect(p.byteLength).toBeLessThanOrEqual(LIMITS.maxSnapshot);
      const d = decodeSnapshot(p);
      expect(d).not.toBe(null);
      expect(d.parts).toBe(r.parts);
      total += d.enemies.length;
      for (const e of d.enemies) expect(Math.abs(e.x - enemies[e.num].x)).toBeLessThan(0.011);
    }
    expect(total).toBe(100);
  });
  it('a 40-goon brawl fits one packet (the bandwidth budget)', () => {
    const w = createWriter();
    const sizes = [];
    const enemies = Array.from({ length: 40 }, (_, i) => enemy(i));
    encodeSnapshot(w, { seq: 1, hostTime: 5, heroes: [hero()], enemies }, (b) => sizes.push(b.byteLength));
    expect(sizes.length).toBe(1);
    expect(sizes[0]).toBeLessThanOrEqual(1000);
  });
  it('hero state and pings round-trip', () => {
    const w = createWriter();
    const d = decodeHeroState(encodeHeroState(w, { seq: 9, hostTime: 77.5, hero: hero({ slot: 1 }) }).slice());
    expect(d.seq).toBe(9);
    expect(d.hero.slot).toBe(1);
    expect(decodePing(encodePing(w, 12.5).slice())).toEqual({ type: 'ping', t0: 12.5 });
    expect(decodePing(encodePong(w, 1, 2, 3).slice())).toEqual({ type: 'pong', t0: 1, t1: 2, t2: 3 });
  });
  it('refuses another protocol version', () => {
    const w = createWriter();
    const b = encodeHeroState(w, { seq: 1, hostTime: 1, hero: hero() }).slice();
    b[1] = PROTO + 1;
    expect(decodeHeroState(b)).toBe(null);
  });
  it('enemy ids map to wire numbers; sequence numbers wrap', () => {
    expect(enemyNum('e42')).toBe(42);
    expect(enemyNum('boss')).toBe(-1);
    expect(seqNewer(2, 65530)).toBe(true);
    expect(seqNewer(65530, 2)).toBe(false);
  });
});

describe('fuzz: malformed packets never throw and never decode to garbage', () => {
  it('10,000 random buffers and 10,000 mutated real packets', () => {
    const rng = createRng(1234);
    const w = createWriter();
    const real = [];
    encodeSnapshot(w, { seq: 1, hostTime: 5, heroes: [hero()], enemies: [enemy(1), enemy(2)] }, (b) => real.push(b.slice()));
    real.push(encodeHeroState(w, { seq: 1, hostTime: 1, hero: hero() }).slice());
    real.push(encodePong(w, 1, 2, 3).slice());
    let decoded = 0;
    const check = (buf) => {
      for (const dec of [decodeSnapshot, decodeHeroState, decodePing]) {
        let out;
        expect(() => { out = dec(buf); }).not.toThrow();
        if (out) {
          decoded++;
          // Whatever decodes is finite everywhere.
          JSON.stringify(out, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`non-finite ${k}`); return v; });
        }
      }
    };
    for (let i = 0; i < 10000; i++) {
      const n = Math.floor(rng.next() * 200);
      const b = new Uint8Array(n);
      for (let j = 0; j < n; j++) b[j] = Math.floor(rng.next() * 256);
      if (n > 1 && rng.chance(0.5)) { b[0] = 1 + Math.floor(rng.next() * 4); b[1] = PROTO; }
      check(b);
    }
    for (let i = 0; i < 10000; i++) {
      const src = real[i % real.length];
      const b = src.slice(0, rng.chance(0.3) ? Math.floor(rng.next() * src.length) : src.length);
      const flips = 1 + Math.floor(rng.next() * 4);
      for (let k = 0; k < flips && b.length; k++) b[Math.floor(rng.next() * b.length)] = Math.floor(rng.next() * 256);
      check(b);
    }
    // Some mutations stay valid (a flipped position byte is still a position): that is fine.
    expect(decoded).toBeGreaterThan(0);
  });
  it('random JSON and junk strings on the control channel are dropped, never thrown', () => {
    const rng = createRng(99);
    const junk = ['', '{', 'null', '[]', '{"t":5}', '{"t":"spawn"}', '{"t":"hello","proto":"x"}', '{"t":"__proto__"}', 'x'.repeat(70000)];
    for (let i = 0; i < 2000; i++) {
      const o = { t: rng.pick(['hit', 'spawn', 'step', 'hello', 'chat', 'defence', 'lock', 'nope']), e: rng.pick(['e1', 3, null, '<b>', 'e'.repeat(40)]), seq: rng.pick([1, -1, 1.5, 'x']), at: rng.pick([1, NaN, 1e20]), move: rng.pick(['punch', 7]), index: rng.pick([3, -2, 'a']) };
      junk.push(JSON.stringify(o));
    }
    for (const s of junk) for (const from of ['host', 'guest']) expect(() => parseCtl(s, from)).not.toThrow();
  });
});

describe('control messages', () => {
  it('a guest may not send host-only messages', () => {
    expect(parseCtl(JSON.stringify({ t: 'spawn', id: 'e1', type: 'grunt', pos: { x: 0, y: 0, z: 0 } }), 'guest')).toBe(null);
    expect(parseCtl(JSON.stringify({ t: 'step', index: 3 }), 'guest')).toBe(null);
    expect(parseCtl(JSON.stringify({ t: 'step', index: 3 }), 'host')).toEqual({ t: 'step', index: 3 });
  });
  it('validates types and ranges', () => {
    expect(parseCtl(JSON.stringify({ t: 'hit', e: 'e1', move: 'punch', seq: 1, at: 100 }), 'guest')).not.toBe(null);
    expect(parseCtl(JSON.stringify({ t: 'hit', e: 'e1', move: 'punch', seq: 1, at: 'soon' }), 'guest')).toBe(null);
    expect(parseCtl(JSON.stringify({ t: 'defence', id: 3, e: 'e1', result: 'teleported' }), 'guest')).toBe(null);
    expect(parseCtl(JSON.stringify({ t: 'lock', req: 1, ids: [], action: 'grab' }), 'guest')).toBe(null);
  });
  it('room codes: six unambiguous characters, normalised from what a player types', () => {
    const c = makeRoomCode(createRng(5).next);
    expect(c).toMatch(/^[A-Z0-9]{6}$/);
    expect(normalizeCode(c.toLowerCase().split('').join(' '))).toBe(c);
    expect(normalizeCode('ABC')).toBe(null);
    expect(normalizeCode('OOOOOO')).toBe(null);
  });
  it('peer text cannot carry markup or control characters', () => {
    expect(cleanText('<img src=x onerror=alert(1)>hi\u0007', 40)).toBe('img src=x onerror=alert(1)hi');
    expect(cleanText(42, 10)).toBe('');
  });
  it('rate limiter caps bursts and refills over time', () => {
    let t = 0;
    const rl = createRateLimiter({ hit: 10 }, () => t);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (rl.allow('hit')) ok++;
    expect(ok).toBe(10);
    t = 1000;
    ok = 0;
    for (let i = 0; i < 100; i++) if (rl.allow('hit')) ok++;
    expect(ok).toBe(10);
  });
});
