// Online co-op wire protocol (workstream D2): versions, channel names, binary message ids, limits
// and the JSON control-message catalogue with its validators. docs/design/online-coop.md lists
// every message; this file is the source of truth.
//
// Two channels (docs/design/research/coop-netcode.md decisions 3, 8):
//   ctl    reliable, ordered: JSON control messages (handshake, events, claims, locks, chat)
//   state  unordered, no retransmits: binary snapshots (host→guest), hero state (guest→host),
//          clock pings
// Every inbound message is validated here before anything reads it (decision 21).

// Bump on any change to a message's shape or meaning. Mismatched peers refuse each other.
export const PROTO = 2; // [net2] 2: campaign position, content seams (sev/claim/st), vehicles, env

// The build: a hashed production chunk URL changes whenever the shipped code does (Vite names
// chunks by content), so two builds of the site refuse each other even with the same PROTO. In dev
// both tabs load the same module path, so they always match.
export const BUILD = (() => {
  try {
    const u = new URL(import.meta.url);
    return u.pathname.split('/').pop() || 'dev';
  } catch { return 'dev'; }
})();

export const CH = { CTL: 'ctl', STATE: 'state' };

// Binary message ids (first byte on the state channel).
export const BIN = { SNAP: 1, HERO: 2, PING: 3, PONG: 4 };

export const LIMITS = {
  maxMessage: 64 * 1024,     // bytes; anything bigger is dropped unread
  maxSnapshot: 1100,         // bytes per snapshot packet (one SCTP packet, no fragmentation)
  chunk: 16 * 1024,          // welcome state chunk size on ctl
  maxName: 24,               // player name characters
  maxChat: 120,              // quick-chat characters
  maxEnemies: 120,           // ids the guest will track at once
};

// Rates (per second) the host accepts from a guest before dropping (decision 21: claims are capped).
export const RATES = { hit: 14, defence: 10, lock: 6, chat: 2, ping: 4, req: 6, fx: 8, ev: 20, claim: 10 };

// Who may send what. The guest may only send its own hero state, input-level claims, defence
// reports, lock requests, small requests (pickup, trophy, regroup) and lobby/chat. The host sends
// everything else. Anything outside the sender's list is dropped and counted.
export const FROM_GUEST = new Set(['hello', 'ready', 'lobby', 'bye', 'hit', 'defence', 'lock', 'unlock', 'fx', 'req', 'chat', 'ping', 'sceneDone', 'ev', 'resync', 'claim']);
export const FROM_HOST = new Set(['welcome', 'refuse', 'bye', 'chunk', 'spawn', 'despawn', 'hitAck', 'hurt', 'atk', 'grant', 'deny', 'step', 'flow', 'scene', 'pickup', 'trophy', 'crime', 'chat', 'ping', 'hostAway', 'slowMo', 'down', 'revived', 'regroup', 'respawn', 'boss', 'ev', 'place', 'veh', 'kick', 'lobby', 'start', 'stealth', 'sev', 'st']);

// Room codes: 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L, 5/S, 2/Z).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY346789';
export function makeRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}
export function normalizeCode(s) {
  const up = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (up.length !== 6) return null;
  for (const c of up) if (!CODE_ALPHABET.includes(c)) return null;
  return up;
}

// ---- validation helpers (never throw) ----
export const isNum = (v, lo = -1e7, hi = 1e7) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export const isInt = (v, lo = 0, hi = 0x7fffffff) => Number.isInteger(v) && v >= lo && v <= hi;
export const isStr = (v, max = 64) => typeof v === 'string' && v.length <= max;
export const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 16 && /^[A-Za-z0-9_-]+$/.test(v);
export const isVec = (v) => !!v && typeof v === 'object' && isNum(v.x) && isNum(v.y) && isNum(v.z);

// Strips anything a peer could use to inject markup or control characters into a name or a chat
// line. Text is only ever shown with textContent, never innerHTML; this is the second fence.
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max).trim();
}

// Shape checks per control message type. Each returns true when the message is safe to read.
// Unknown fields are ignored; unknown types are dropped by the caller.
const V = {
  hello: (m) => isInt(m.proto, 0, 1e6) && isStr(m.build, 200) && isStr(m.content, 64) && isStr(m.kit, 24) && (m.name === undefined || isStr(m.name, 64)) && (m.token === undefined || isStr(m.token, 64)),
  welcome: (m) => isInt(m.slot, 0, 3) && isStr(m.token, 64) && isNum(m.hostNow, 0, 1e12) && isInt(m.parts, 0, 4096),
  refuse: (m) => isStr(m.reason, 32),
  bye: (m) => m.reason === undefined || isStr(m.reason, 32),
  chunk: (m) => isInt(m.i, 0, 4096) && isInt(m.n, 1, 4096) && isStr(m.data, LIMITS.chunk * 2),
  ready: () => true,
  spawn: (m) => isId(m.id) && isStr(m.type, 24) && isVec(m.pos) && isNum(m.yaw ?? 0),
  despawn: (m) => isId(m.id),
  hit: (m) => isId(m.e) && isStr(m.move, 24) && isInt(m.seq, 0, 1e9) && isNum(m.at, 0, 1e12) && (m.o === undefined || (typeof m.o === 'object' && m.o !== null)),
  hitAck: (m) => isId(m.e) && isInt(m.seq, 0, 1e9) && isStr(m.out, 16) && isNum(m.hp, -1e4, 1e5),
  atk: (m) => isId(m.e) && isInt(m.p, 0, 3) && isInt(m.id, 0, 1e9) && isStr(m.kind, 24) && isNum(m.at, 0, 1e12) && isNum(m.contact, 0, 1e12),
  defence: (m) => isInt(m.id, 0, 1e9) && isId(m.e) && ['countered', 'dodged', 'hit', 'blocked', 'miss'].includes(m.result) && (m.dmg === undefined || isNum(m.dmg, 0, 1000)),
  hurt: (m) => isStr(m.kind, 24) && (m.e === undefined || m.e === null || isId(m.e)) && (m.dmg === undefined || isNum(m.dmg, 0, 1000)) && (m.id === undefined || isInt(m.id, 0, 1e9)),
  lock: (m) => isInt(m.req, 0, 1e9) && Array.isArray(m.ids) && m.ids.length > 0 && m.ids.length <= 8 && m.ids.every(isId) && isStr(m.action, 24),
  unlock: (m) => isInt(m.req, 0, 1e9),
  grant: (m) => isInt(m.req, 0, 1e9),
  deny: (m) => isInt(m.req, 0, 1e9),
  fx: (m) => isId(m.e) && isStr(m.fx, 16) && (m.arg === undefined || isNum(m.arg, -1e5, 1e5)) && (m.v === undefined || isVec(m.v)),
  req: (m) => isStr(m.what, 16) && (m.index === undefined || isInt(m.index, 0, 10000)) && (m.item === undefined || isStr(m.item, 32)),
  step: (m) => isInt(m.index, 0, 10000) && (m.id === undefined || m.id === null || isStr(m.id, 64)) && (m.night === undefined || m.night === null || isStr(m.night, 32)),
  flow: (m) => isStr(m.mode, 16),
  scene: (m) => isStr(m.name, 32),
  sceneDone: (m) => isInt(m.index, 0, 10000),
  pickup: (m) => isStr(m.item, 32),
  trophy: (m) => isInt(m.index, 0, 1000) && (m.by === undefined || isInt(m.by, 0, 3)),
  crime: (m) => typeof m.data === 'object' && m.data !== null,
  chat: (m) => isStr(m.text, 200) && (m.id === undefined || isStr(m.id, 24)) && (m.kind === undefined || isStr(m.kind, 12)),
  ping: (m) => isStr(m.id, 24) && (m.pos === undefined || isVec(m.pos)) && (m.e === undefined || isId(m.e)),
  hostAway: (m) => typeof m.on === 'boolean',
  slowMo: (m) => isNum(m.sec, 0, 10) && isNum(m.scale, 0.01, 1) && isNum(m.at, 0, 1e12),
  down: (m) => isInt(m.p, 0, 3),
  revived: (m) => isInt(m.p, 0, 3) && (m.hp === undefined || isNum(m.hp, 0, 1e4)),
  regroup: (m) => isInt(m.p, 0, 3) && isVec(m.pos) && isNum(m.yaw),
  place: (m) => isVec(m.pos) && isNum(m.yaw) && (m.hp === undefined || isNum(m.hp, 0, 1e4)),
  respawn: (m) => isVec(m.pos) && isNum(m.yaw),
  boss: (m) => typeof m.data === 'object' && m.data !== null,
  ev: (m) => isStr(m.name, 32) && (m.data === undefined || (typeof m.data === 'object')),
  veh: (m) => typeof m.data === 'object' && m.data !== null,
  kick: () => true,
  lobby: (m) => typeof m.data === 'object' && m.data !== null,
  start: (m) => isStr(m.kit, 24),
  stealth: (m) => typeof m.data === 'object' && m.data !== null,
  resync: () => true,
  // [net2] content seams (src/net/share.js): a shared event, a guest claim, a host state blob.
  sev: (m) => isStr(m.n, 32) && (m.d === undefined || (typeof m.d === 'object' && m.d !== null)),
  claim: (m) => isStr(m.n, 32) && (m.d === undefined || (typeof m.d === 'object' && m.d !== null)),
  st: (m) => isStr(m.k, 32) && m.v !== undefined,
};

// Parses and validates one ctl message. Returns the message or null (dropped). `from` is 'host'
// or 'guest': a type outside the sender's whitelist is dropped too.
export function parseCtl(data, from) {
  if (typeof data !== 'string' || data.length > LIMITS.maxMessage) return null;
  let m;
  try { m = JSON.parse(data); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  const allowed = from === 'guest' ? FROM_GUEST : FROM_HOST;
  if (!allowed.has(m.t)) return null;
  const check = V[m.t];
  try { if (!check || !check(m)) return null; } catch { return null; }
  return m;
}

// A token-bucket rate limiter per message kind (decision 21: claim rates are capped).
export function createRateLimiter(rates = RATES, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  const buckets = new Map();
  return {
    allow(kind) {
      const rate = rates[kind] ?? 30;
      const t = now();
      let b = buckets.get(kind);
      if (!b) { b = { tokens: rate, at: t }; buckets.set(kind, b); }
      b.tokens = Math.min(rate * 1.5, b.tokens + ((t - b.at) / 1000) * rate);
      b.at = t;
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
  };
}
