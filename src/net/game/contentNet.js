// [net2] The content seams on the wire (src/net/share.js): shared events host -> guest ('sev'),
// content claims guest -> host ('claim'), small host state blobs host -> guest ('st').
// Game-free apart from the event bus and the lookups it is handed, so it unit-tests on loopback.
//
//   host:  const c = createContentHost({ registry, events, send, remote, enemyOk })
//          c.tick(dt)  c.claim(m)  c.welcome() -> { key: value }  c.dispose()
//   guest: const c = createContentGuest({ registry, events, playerBySlot, enemyById, makeVec, send })
//          c.onEvent(m) -> true when it was a seam message   c.loadStates(obj)   c.dispose()
import { withPlayer } from '../../core/events.js';

export const STATE_MAX = 4096;
const MAX_DEPTH = 4, MAX_LIST = 64, MAX_STR = 200;

// A payload on the wire: plain numbers/strings/booleans, vectors as {x,y,z}, enemies as
// { enemy: id }, players and heroes as { player: netSlot }; anything else (functions, meshes,
// cycles) is dropped. The event's own `player` (non-enumerable, withPlayer) travels as `by`.
export function toWire(d, { enemyOk = () => true } = {}) {
  const seen = new Set();
  const conv = (v, depth) => {
    if (v === null || v === undefined) return undefined;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? v : undefined;
    if (t === 'boolean') return v;
    if (t === 'string') return v.slice(0, MAX_STR);
    if (t !== 'object' || depth > MAX_DEPTH || seen.has(v)) return undefined;
    if (v.isObject3D || v.isMaterial || v.isTexture) return undefined;
    if (v.isVector3 || (Number.isFinite(v.x) && Number.isFinite(v.z) && Object.keys(v).length <= 4 && !('id' in v))) return { x: +(+v.x).toFixed(2), y: +(+(v.y ?? 0)).toFixed(2), z: +(+v.z).toFixed(2) };
    if (typeof v.id === 'string' && v.ch && v.pos) return enemyOk(v.id) ? { enemy: v.id } : undefined;
    if (v.hero && Number.isInteger(v.netSlot)) return { player: v.netSlot };
    if (v.bat && v.player && Number.isInteger(v.player.netSlot)) return { player: v.player.netSlot };
    seen.add(v);
    if (Array.isArray(v)) { const out = []; for (const x of v.slice(0, MAX_LIST)) { const c = conv(x, depth + 1); if (c !== undefined) out.push(c); } return out; }
    const out = {};
    for (const k of Object.keys(v)) { if (k === 'remote') continue; const c = conv(v[k], depth + 1); if (c !== undefined) out[k] = c; }
    return out;
  };
  const out = conv(d, 0);
  const o = out && typeof out === 'object' && !Array.isArray(out) ? out : { value: out };
  if (d?.player && Number.isInteger(d.player.netSlot)) o.by = d.player.netSlot;
  return o;
}

export function fromWire(d, { playerBySlot = () => null, enemyById = () => null, makeVec = (v) => v } = {}) {
  const conv = (v) => {
    if (Array.isArray(v)) return v.map(conv);
    if (!v || typeof v !== 'object') return v;
    if (typeof v.enemy === 'string' && Object.keys(v).length === 1) return enemyById(v.enemy) ?? null;
    if (Number.isInteger(v.player) && Object.keys(v).length === 1) return playerBySlot(v.player) ?? null;
    if (Number.isFinite(v.x) && Number.isFinite(v.z) && Object.keys(v).length === 3 && Number.isFinite(v.y)) return makeVec(v);
    const out = {};
    for (const k of Object.keys(v)) out[k] = conv(v[k]);
    return out;
  };
  return conv(d ?? {});
}

export function createContentHost({ registry, events, send, remote = null, enemyOk = () => true }) {
  const subs = new Map(); // name -> off
  const timers = new Map(); // key -> { t, last }
  function resub() {
    for (const [n, off] of subs) if (!registry._events.has(n)) { off(); subs.delete(n); }
    for (const n of registry._events.keys()) {
      if (subs.has(n)) continue;
      subs.set(n, events.on(n, (d) => { if (d?.remote) return; send({ t: 'sev', n, d: toWire(d ?? {}, { enemyOk }) }); }));
    }
  }
  resub();
  const offReg = registry._onChange(resub);
  function snap(key, s) {
    let v;
    try { v = s.snapshot(); } catch (e) { console.error('net state', key, e); return undefined; }
    if (v === undefined) return undefined;
    const json = JSON.stringify(v);
    if (json.length > STATE_MAX) { console.warn(`net state ${key} is ${json.length} bytes (max ${STATE_MAX}): not sent`); return undefined; }
    return json;
  }
  return {
    tick(dt) {
      for (const [k, s] of registry._states) {
        let tm = timers.get(k);
        if (!tm) { tm = { t: 0, last: null }; timers.set(k, tm); }
        tm.t -= dt;
        if (tm.t > 0) continue;
        tm.t = 1 / s.hz;
        const json = snap(k, s);
        if (json === undefined || json === tm.last) continue;
        tm.last = json;
        send({ t: 'st', k, v: JSON.parse(json) });
      }
    },
    // Every state now (the welcome): the guest starts from the same HUD.
    welcome() {
      const out = {};
      for (const [k, s] of registry._states) { const json = snap(k, s); if (json !== undefined) { out[k] = JSON.parse(json); const tm = timers.get(k); if (tm) tm.last = json; } }
      return out;
    },
    claim(m) {
      const c = registry._claims.get(m.n);
      if (!c) return false;
      const d = m.d ?? {};
      try { if (c.validator && !c.validator(d)) return false; c.handler(d, { player: remote }); } catch (e) { console.error('net claim', m.n, e); return false; }
      return true;
    },
    // Forget what was sent (a reconnect: everything goes again).
    reset() { for (const tm of timers.values()) tm.last = null; },
    dispose() { offReg(); for (const off of subs.values()) off(); subs.clear(); },
  };
}

export function createContentGuest({ registry, events, send, playerBySlot, enemyById, makeVec }) {
  registry._bind({ claim: (n, d) => send({ t: 'claim', n: String(n).slice(0, 32), d: toWire(d ?? {}) }) });
  const look = { playerBySlot, enemyById, makeVec };
  function applyState(k, v) { const s = registry._states.get(k); if (!s) return; try { s.apply(v); } catch (e) { console.error('net state', k, e); } }
  return {
    onEvent(m) {
      if (m.t === 'sev') {
        if (!registry._events.has(m.n)) return true;
        const check = registry._events.get(m.n);
        const raw = m.d ?? {};
        if (check) { let ok = false; try { ok = !!check(raw); } catch { ok = false; } if (!ok) return true; }
        const data = fromWire(raw, look);
        const by = Number.isInteger(raw.by) ? playerBySlot(raw.by) : null;
        delete data.by;
        data.remote = true;
        events.emit(m.n, by ? withPlayer(data, by) : data);
        return true;
      }
      if (m.t === 'st') { applyState(m.k, m.v); return true; }
      return false;
    },
    loadStates(obj) { if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) applyState(k, obj[k]); },
    dispose() { registry._bind(null); },
  };
}
