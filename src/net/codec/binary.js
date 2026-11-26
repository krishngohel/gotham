// Bounds-checked DataView reader and writer for the net layer's binary messages (snapshots, hero
// state, clock pings). Workstream D2, docs/design/online-coop.md.
//
// The writer owns one ArrayBuffer and is reused every tick (no per-tick allocation); `bytes()`
// returns a view of what was written, which the transport copies when it sends. The reader never
// throws on short or garbage input: every read past the end sets `bad` and returns 0, and the
// decoders check `bad` once at the end. Malformed packets are dropped, never half-applied.

export function createWriter(size = 2048) {
  let buf = new ArrayBuffer(size);
  let view = new DataView(buf);
  let u8 = new Uint8Array(buf);
  let o = 0;
  const room = (n) => {
    if (o + n <= buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(buf.byteLength * 2, o + n));
    new Uint8Array(next).set(u8);
    buf = next; view = new DataView(buf); u8 = new Uint8Array(buf);
  };
  return {
    reset() { o = 0; return this; },
    get length() { return o; },
    u8(v) { room(1); view.setUint8(o, v & 0xff); o += 1; return this; },
    u16(v) { room(2); view.setUint16(o, v & 0xffff, true); o += 2; return this; },
    i16(v) { room(2); view.setInt16(o, clampInt(v, -32768, 32767), true); o += 2; return this; },
    u32(v) { room(4); view.setUint32(o, v >>> 0, true); o += 4; return this; },
    // [net2] A value in -1..1 as an i8 (a stick axis).
    i8q(v) { room(1); view.setInt8(o, clampInt((Number.isFinite(v) ? v : 0) * 127, -127, 127)); o += 1; return this; },
    f32(v) { room(4); view.setFloat32(o, Number.isFinite(v) ? v : 0, true); o += 4; return this; },
    f64(v) { room(8); view.setFloat64(o, Number.isFinite(v) ? v : 0, true); o += 8; return this; },
    // A short string (names, clip names in a welcome): u8 length + UTF-8 bytes, cut at 255 bytes.
    str(s) {
      const b = new TextEncoder().encode(String(s ?? '')).subarray(0, 255);
      this.u8(b.length); room(b.length); u8.set(b, o); o += b.length; return this;
    },
    // Patch a u8 already written (a count known only after the loop).
    setU8(at, v) { view.setUint8(at, v & 0xff); },
    setU16(at, v) { view.setUint16(at, v & 0xffff, true); },
    bytes() { return new Uint8Array(buf, 0, o); },
    // A copy that owns its bytes (what goes into a queue or a test).
    copy() { return u8.slice(0, o); },
  };
}

export function createReader(data) {
  const u8 = toU8(data);
  const view = u8 ? new DataView(u8.buffer, u8.byteOffset, u8.byteLength) : null;
  const len = u8 ? u8.byteLength : 0;
  let o = 0;
  const r = {
    bad: !u8,
    get offset() { return o; },
    get left() { return len - o; },
    need(n) { if (r.bad || o + n > len) { r.bad = true; return false; } return true; },
    u8() { if (!r.need(1)) return 0; const v = view.getUint8(o); o += 1; return v; },
    u16() { if (!r.need(2)) return 0; const v = view.getUint16(o, true); o += 2; return v; },
    i16() { if (!r.need(2)) return 0; const v = view.getInt16(o, true); o += 2; return v; },
    u32() { if (!r.need(4)) return 0; const v = view.getUint32(o, true); o += 4; return v; },
    i8q() { if (!r.need(1)) return 0; const v = view.getInt8(o); o += 1; return v / 127; },
    f32() { if (!r.need(4)) return 0; const v = view.getFloat32(o, true); o += 4; if (!Number.isFinite(v)) r.bad = true; return Number.isFinite(v) ? v : 0; },
    f64() { if (!r.need(8)) return 0; const v = view.getFloat64(o, true); o += 8; if (!Number.isFinite(v)) r.bad = true; return Number.isFinite(v) ? v : 0; },
    str() {
      const n = r.u8();
      if (!r.need(n)) return '';
      const s = new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(o, o + n));
      o += n;
      return s;
    },
  };
  return r;
}

export function toU8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function clampInt(v, lo, hi) {
  if (!Number.isFinite(v)) return 0;
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}

// Angles as u16 (0..2π → 0..65535), positions as i16 at 2 cm relative to an origin.
export const POS_Q = 0.02;
export const yawToU16 = (a) => {
  if (!Number.isFinite(a)) return 0;
  const t = a / (Math.PI * 2);
  return Math.round((t - Math.floor(t)) * 65536) & 0xffff;
};
export const u16ToYaw = (v) => (v / 65536) * Math.PI * 2;
// Wraps an angle into (-π, π].
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// FNV-1a 32-bit: clip names travel as a hash (both builds share the clip set; the receiver maps a
// hash back to a name through its own clip table, see clipTable below).
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// hash -> clip name over a Map of clips that grows as animation packs load (rebuilt when its size
// changes; a miss on a known size is cached as null so garbage hashes cost one lookup).
export function createClipTable() {
  const byHash = new Map();
  const memo = new Map();
  let seen = -1, src = null;
  return {
    hash(name) { let h = memo.get(name); if (h === undefined) { h = hash32(name); memo.set(name, h); } return h; },
    name(h, clips) {
      if (clips && (clips !== src || clips.size !== seen)) {
        src = clips; seen = clips.size;
        byHash.clear();
        for (const k of clips.keys()) byHash.set(hash32(k), k);
      }
      return byHash.get(h) ?? null;
    },
  };
}
