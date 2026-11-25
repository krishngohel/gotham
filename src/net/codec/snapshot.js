// Binary snapshot and hero-state codec (workstream D2; research decision 8 and §3 "Encoding").
//
// Snapshot packet (host -> guest, state channel), each self-contained and <= LIMITS.maxSnapshot:
//   header  u8 BIN.SNAP, u8 PROTO, u16 seq, f64 hostTime, u8 part, u8 parts,
//           f32 origin x/y/z, u8 heroes, u8 enemies, u8 props                    29 bytes
//   hero    (HERO_BYTES)  slot, absolute f32 position, velocity, yaw, clip, clip time, speed,
//           health, max health, flags, movement state, seat, held actions (bit mask, HELD_ACTIONS)
//   enemy   (ENEMY_BYTES) numeric id, position as i16 at 2 cm from the packet's origin, yaw, clip,
//           clip time, speed, AI state, health, flags, glyph, target slot
//   prop    (PROP_BYTES)  a vehicle or other dynamic prop: id, f32 position, yaw/pitch/roll, speed
// A world bigger than one packet (or enemies too far apart for one i16 origin) is split into
// several self-contained parts; losing one part only loses those entities for one tick.
//
// Hero state (guest -> host): u8 BIN.HERO, u8 PROTO, u16 seq, f64 hostTime, then one hero record.
// Clock ping/pong: u8 BIN.PING|PONG, u8 PROTO, f64 t0 [, f64 t1, f64 t2].
//
// Decoders never throw: they return null for anything malformed (wrong type, wrong version,
// truncated, non-finite numbers, out-of-range counts). Fuzz-tested (tests/unit/netCodec.test.js).
import { createWriter, createReader, yawToU16, u16ToYaw, POS_Q } from './binary.js';
import { BIN, PROTO, LIMITS } from '../protocol.js';

export const HEADER_BYTES = 29;
// [net2] PROTO 2: a hero record also carries the presses since the last record (tap mask), the
// move stick (i8 x/y) and the camera's aim (u16 yaw, i16 pitch): the host drives a car, mans a
// turret and runs glue moves for a guest from them. An enemy record's glyph byte also carries the
// role bits (RF) in its top five bits: the enemy record stays 23 bytes (a 40-goon brawl, 1 packet).
export const HERO_BYTES = 49;
export const ENEMY_BYTES = 23;
export const PROP_BYTES = 22;

// Enemy AI states and hero movement states by index (unknown -> 0). Append only: an index is part
// of the protocol (bump PROTO to reorder).
export const ENEMY_STATES = ['idle', 'alert', 'engage', 'approach', 'windup', 'attack', 'recover', 'hit', 'down', 'getup', 'ko', 'stunned',
  'tied', 'chained', 'grabbed', 'frozen', 'patrol', 'search', 'hunt', 'suspicious', 'look', 'surrender', 'flee', 'fled', 'pickup', 'revive',
  'riposte', 'evade', 'cartwheel', 'throw', 'staggered', 'roam', 'swing', 'shock', 'strike', 'flinch', 'knocked', 'warn', 'drop', 'off', 'air', 'ground', 'backoff'];
export const HERO_STATES = ['ground', 'air', 'glide', 'fly', 'roll'];
export const GLYPHS = [null, 'blue', 'red', 'yellow', 'green', 'white', 'orange', 'purple'];
const STATE_INDEX = new Map(ENEMY_STATES.map((s, i) => [s, i]));
const HSTATE_INDEX = new Map(HERO_STATES.map((s, i) => [s, i]));
const GLYPH_INDEX = new Map(GLYPHS.map((s, i) => [s, i]));

// Held input actions as a bit mask (the host's remote input for the guest replays them: the
// revive hold, the glue's chords). Append only.
export const HELD_ACTIONS = ['jump', 'punch', 'kick', 'block', 'grapple', 'dodge', 'batarang', 'cape', 'sprint', 'crouch', 'vehicle', 'throw', 'special', 'detective', 'back', 'gadgetWheel', 'ping', 'chat'];
export function heldMask(input) { let m = 0; for (let i = 0; i < HELD_ACTIONS.length; i++) if (input?.down?.(HELD_ACTIONS[i])) m |= 1 << i; return m >>> 0; }
export function heldList(mask, out = []) { out.length = 0; for (let i = 0; i < HELD_ACTIONS.length; i++) if (mask & (1 << i)) out.push(HELD_ACTIONS[i]); return out; }

// Enemy flags.
export const EF = { alive: 1, down: 2, aware: 4, air: 8, stunned: 16, countered: 32, once: 64, room: 128 };
// Hero flags.
export const HF = { dead: 1, blocking: 2, crouched: 4, invulnerable: 8, once: 16, grounded: 32, away: 64, hidden: 128 };
// [net2] Enemy role bits (5): weapon kind in bits 0-1 (0 none, 1 baton, 2 knife, 3 other), a
// charged baton, a fear phantom, a stripped shield. (Surrender, flee, revive, pickup are states.)
export const RF = { weaponMask: 3, charged: 4, phantom: 8, shieldLost: 16 };
export const WEAPONS = [null, 'baton', 'knife'];

// Ids on the wire: enemies are 'e<number>' (game.js spawn). Anything else has no snapshot slot.
// The boss is the one named enemy: the Joker rides on a fixed wire number.
export const JOKER_NUM = 65000;
// [net2] Every other named enemy (a campaign boss: 'penguin', 'freeze', ... any def a later night
// registers) rides on 65001 + a hash of its id: no table to keep in step between builds.
export const BOSS_NUM = 65001;
const BOSS_ID = /^[a-z][a-zA-Z0-9]{1,15}$/;
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const NOT_BOSS = new Set(['joker', 'boss', 'hero', 'player', 'enemy']);
export const isBossId = (id) => typeof id === 'string' && !NOT_BOSS.has(id) && BOSS_ID.test(id) && !/^e\d+$/.test(id);
export const enemyNum = (id) => {
  if (id === 'joker') return JOKER_NUM;
  const m = /^e(\d{1,5})$/.exec(id);
  if (m) return Number(m[1]) < JOKER_NUM ? Number(m[1]) : -1;
  return isBossId(id) ? BOSS_NUM + (hashId(id) % 500) : -1;
};
export const enemyId = (n) => (n === JOKER_NUM ? 'joker' : `e${n}`);
export const isNetEnemyId = (id) => enemyNum(id) >= 0;

const clampU8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const speedQ = (s) => clampU8((Number.isFinite(s) ? s : 1) * 32);
const timeQ = (t) => Math.round(Math.max(0, Number.isFinite(t) ? t : 0) * 1000) % 65536;

// ---- writers ----
function writeHero(w, h) {
  w.u8(h.slot);
  w.f32(h.x); w.f32(h.y); w.f32(h.z);
  w.i16(h.vx * 100); w.i16(h.vy * 100); w.i16(h.vz * 100);
  w.u16(yawToU16(h.yaw));
  w.u32(h.clip >>> 0);
  w.u16(timeQ(h.clipT));
  w.u8(speedQ(h.speed));
  w.u16(Math.max(0, Math.min(65535, Math.round(h.health))));
  w.u16(Math.max(1, Math.min(65535, Math.round(h.maxHealth))));
  w.u8(h.flags);
  w.u8(HSTATE_INDEX.get(h.state) ?? 0);
  w.u8(h.seat & 0xff);
  w.u32(h.held >>> 0);
  w.u32((h.tap ?? 0) >>> 0);
  w.i8q(h.mx ?? 0); w.i8q(h.my ?? 0);
  w.u16(yawToU16(h.camYaw ?? 0));
  w.i16(Math.round((Number.isFinite(h.camPitch) ? h.camPitch : 0) * 10000));
}
function writeEnemy(w, e, ox, oy, oz) {
  w.u16(e.num);
  w.i16((e.x - ox) / POS_Q); w.i16((e.y - oy) / POS_Q); w.i16((e.z - oz) / POS_Q);
  w.u16(yawToU16(e.yaw));
  w.u32(e.clip >>> 0);
  w.u16(timeQ(e.clipT));
  w.u8(speedQ(e.speed));
  w.u8(STATE_INDEX.get(e.state) ?? 0);
  w.i16(Math.round(e.health * 10));
  w.u8(e.flags);
  w.u8(((GLYPH_INDEX.get(e.glyph ?? null) ?? 0) & 7) | (((e.role ?? 0) & 31) << 3));
  w.u8(e.target ?? 0xff);
}
function writeProp(w, p) {
  w.u8(p.id);
  w.f32(p.x); w.f32(p.y); w.f32(p.z);
  w.u16(yawToU16(p.yaw)); w.u16(yawToU16(p.pitch ?? 0)); w.u16(yawToU16(p.roll ?? 0));
  w.i16((p.speed ?? 0) * 100);
  w.u8(p.flags ?? 0);
}

const inRange = (v) => v > -650 && v < 650;

// Encodes one tick into as many packets as it needs; calls send(bytes) for each (bytes is a view
// into the writer, valid only during the call). Heroes and props go in the first packet.
export function encodeSnapshot(w, { seq, hostTime, heroes = [], enemies = [], props = [] }, send) {
  const budget = LIMITS.maxSnapshot;
  const parts = [];
  // Partition enemies into packets: same origin range, under budget.
  let cur = { enemies: [], ox: 0, oy: 0, oz: 0, heroes, props };
  let size = HEADER_BYTES + heroes.length * HERO_BYTES + props.length * PROP_BYTES;
  for (const e of enemies) {
    if (e.num < 0) continue;
    if (!cur.enemies.length) { cur.ox = Math.round(e.x); cur.oy = Math.round(e.y); cur.oz = Math.round(e.z); }
    const fits = inRange(e.x - cur.ox) && inRange(e.y - cur.oy) && inRange(e.z - cur.oz) && size + ENEMY_BYTES <= budget && cur.enemies.length < 255;
    if (!fits) {
      parts.push(cur);
      cur = { enemies: [], ox: Math.round(e.x), oy: Math.round(e.y), oz: Math.round(e.z), heroes: [], props: [] };
      size = HEADER_BYTES;
    }
    cur.enemies.push(e);
    size += ENEMY_BYTES;
  }
  parts.push(cur);
  const n = Math.min(255, parts.length);
  let bytes = 0;
  for (let i = 0; i < n; i++) {
    const p = parts[i];
    w.reset();
    w.u8(BIN.SNAP).u8(PROTO).u16(seq).f64(hostTime).u8(i).u8(n);
    w.f32(p.ox).f32(p.oy).f32(p.oz);
    w.u8(p.heroes.length).u8(p.enemies.length).u8(p.props.length);
    for (const h of p.heroes) writeHero(w, h);
    for (const e of p.enemies) writeEnemy(w, e, p.ox, p.oy, p.oz);
    for (const q of p.props) writeProp(w, q);
    bytes += w.length;
    send(w.bytes());
  }
  return { parts: n, bytes };
}

export function encodeHeroState(w, { seq, hostTime, hero }) {
  w.reset();
  w.u8(BIN.HERO).u8(PROTO).u16(seq).f64(hostTime);
  writeHero(w, hero);
  return w.bytes();
}

export function encodePing(w, t0) { w.reset(); w.u8(BIN.PING).u8(PROTO).f64(t0); return w.bytes(); }
export function encodePong(w, t0, t1, t2) { w.reset(); w.u8(BIN.PONG).u8(PROTO).f64(t0).f64(t1).f64(t2); return w.bytes(); }

// ---- readers ----
function readHero(r) {
  const h = {
    slot: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(),
    vx: r.i16() / 100, vy: r.i16() / 100, vz: r.i16() / 100,
    yaw: u16ToYaw(r.u16()), clip: r.u32(), clipT: r.u16() / 1000, speed: r.u8() / 32,
    health: r.u16(), maxHealth: r.u16(), flags: r.u8(),
  };
  h.state = HERO_STATES[r.u8()] ?? 'ground';
  h.seat = r.u8();
  h.held = r.u32();
  h.tap = r.u32();
  h.mx = r.i8q(); h.my = r.i8q();
  h.camYaw = u16ToYaw(r.u16());
  h.camPitch = r.i16() / 10000;
  return h;
}
function readEnemy(r, ox, oy, oz) {
  const e = {
    num: r.u16(), x: ox + r.i16() * POS_Q, y: oy + r.i16() * POS_Q, z: oz + r.i16() * POS_Q,
    yaw: u16ToYaw(r.u16()), clip: r.u32(), clipT: r.u16() / 1000, speed: r.u8() / 32,
  };
  e.state = ENEMY_STATES[r.u8()] ?? 'idle';
  e.health = r.i16() / 10;
  e.flags = r.u8();
  const g = r.u8();
  e.glyph = GLYPHS[g & 7] ?? null;
  e.role = g >> 3;
  const t = r.u8();
  e.target = t === 0xff ? null : t;
  return e;
}
function readProp(r) {
  return { id: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(), yaw: u16ToYaw(r.u16()), pitch: u16ToYaw(r.u16()), roll: u16ToYaw(r.u16()), speed: r.i16() / 100, flags: r.u8() };
}
const sane = (v) => Math.abs(v) < 1e6;

// The first byte of a state-channel message (or -1).
export function binType(data) {
  if (!(data instanceof Uint8Array) || data.byteLength < 2) return -1;
  return data[0];
}

export function decodeSnapshot(data) {
  try {
    const r = createReader(data);
    if (r.u8() !== BIN.SNAP || r.u8() !== PROTO) return null;
    const seq = r.u16(), hostTime = r.f64(), part = r.u8(), parts = r.u8();
    const ox = r.f32(), oy = r.f32(), oz = r.f32();
    const nh = r.u8(), ne = r.u8(), np = r.u8();
    if (r.bad || parts < 1 || part >= parts || nh > 4 || np > 16) return null;
    if (r.left !== nh * HERO_BYTES + ne * ENEMY_BYTES + np * PROP_BYTES) return null;
    if (!sane(ox) || !sane(oy) || !sane(oz) || hostTime < 0) return null;
    const heroes = [], enemies = [], props = [];
    for (let i = 0; i < nh; i++) heroes.push(readHero(r));
    for (let i = 0; i < ne; i++) enemies.push(readEnemy(r, ox, oy, oz));
    for (let i = 0; i < np; i++) props.push(readProp(r));
    if (r.bad) return null;
    for (const h of heroes) if (!sane(h.x) || !sane(h.y) || !sane(h.z) || h.slot > 3) return null;
    for (const p of props) if (!sane(p.x) || !sane(p.y) || !sane(p.z)) return null;
    return { seq, hostTime, part, parts, heroes, enemies, props };
  } catch { return null; }
}

export function decodeHeroState(data) {
  try {
    const r = createReader(data);
    if (r.u8() !== BIN.HERO || r.u8() !== PROTO) return null;
    const seq = r.u16(), hostTime = r.f64();
    if (r.left !== HERO_BYTES) return null;
    const hero = readHero(r);
    if (r.bad || !sane(hero.x) || !sane(hero.y) || !sane(hero.z) || hero.slot > 3 || hostTime < 0) return null;
    return { seq, hostTime, hero };
  } catch { return null; }
}

export function decodePing(data) {
  try {
    const r = createReader(data);
    const t = r.u8();
    if ((t !== BIN.PING && t !== BIN.PONG) || r.u8() !== PROTO) return null;
    const t0 = r.f64();
    if (t === BIN.PING) return r.bad || r.left !== 0 ? null : { type: 'ping', t0 };
    const t1 = r.f64(), t2 = r.f64();
    return r.bad || r.left !== 0 ? null : { type: 'pong', t0, t1, t2 };
  } catch { return null; }
}

// Sequence numbers wrap at 65536: a is newer than b when (a - b) mod 65536 is in (0, 32768).
export const seqNewer = (a, b) => { const d = (a - b + 65536) % 65536; return d > 0 && d < 32768; };

export { createWriter };
