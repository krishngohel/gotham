// Waypoint state for every player (workstream L2). Pure: no DOM, no three.js.
//
//   custom marks   several per player, coloured, placed from the city map, from the world (the
//                  comms wheel's "Go here", or the waypoint key) or from a mission list. A mark
//                  can be placed *for* the partner ("mark a target for the partner").
//   route target   what the GPS routes to: a pinned target ("set route" from a list), else the
//                  player's newest custom mark, else the story objective.
//   tracked marks  `mapMark` events: { id, kind, pos | target, ttl, player } (a tracker dart, a
//                  scripted objective). `target` is any object with `pos` (or x/y/z); it moves.
//                  ttl in seconds (0 or missing: until removed with { id, remove: true }).
//   breadcrumbs    where each player has been (a fixed ring, no allocation once full).
export const WAYPOINT_COLORS = ['#ffd23f', '#49b4ff', '#ff5f6d', '#7ee081', '#c38bff', '#ff9f43'];
export const PLAYER_ROUTE_COLORS = ['#49b4ff', '#f2d24b'];
export const MAX_MARKS = 6;
export const BREADCRUMB = { count: 160, step: 12 };

let seq = 0;
const posOf = (t) => (t ? (t.pos ?? t) : null);

export function createWaypointBook({ max = MAX_MARKS } = {}) {
  const players = new Map(); // player id -> { marks, pinned, crumbs, crumbN, crumbHead, lastCrumb }
  const tracked = [];
  let version = 0;
  function P(id) {
    let p = players.get(id);
    if (!p) {
      p = { marks: [], pinned: null, crumbs: new Float32Array(BREADCRUMB.count * 2), crumbN: 0, crumbHead: 0, lastX: NaN, lastZ: NaN };
      players.set(id, p);
    }
    return p;
  }
  const api = {
    get version() { return version; },
    tracked,
    marksOf: (id) => P(id).marks,
    // Every custom mark of every player (for the partner's view): [{ ...mark, by }].
    allMarks() { const out = []; for (const [id, p] of players) for (const m of p.marks) out.push(m.by === undefined ? { ...m, by: id } : m); return out; },
    // Places a custom mark. opts: { color, label, forPlayer (the partner it is meant for), y }.
    add(id, pos, { color = null, label = null, forPlayer = null } = {}) {
      const p = P(id);
      if (p.marks.length >= max) p.marks.shift();
      const used = new Set(p.marks.map((m) => m.c));
      const c = color ?? (WAYPOINT_COLORS.findIndex((_, i) => !used.has(i)) + 1 || 1) - 1;
      const m = { id: `wp${++seq}`, by: id, x: pos.x, y: pos.y ?? 0, z: pos.z, c, label, forPlayer, t: seq };
      p.marks.push(m);
      p.pinned = null; // a fresh mark becomes the route target
      version++;
      return m;
    },
    remove(id, markId) {
      const p = P(id);
      const i = p.marks.findIndex((m) => m.id === markId);
      if (i < 0) return false;
      p.marks.splice(i, 1);
      if (p.pinned?.markId === markId) p.pinned = null;
      version++;
      return true;
    },
    // Removes this player's mark nearest (x, z) within r. Returns the removed mark or null.
    removeNear(id, x, z, r = 12) {
      const p = P(id);
      let best = -1, bd = r * r;
      p.marks.forEach((m, i) => { const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d <= bd) { bd = d; best = i; } });
      if (best < 0) return null;
      const [m] = p.marks.splice(best, 1);
      if (p.pinned?.markId === m.id) p.pinned = null;
      version++;
      return m;
    },
    // The world-mark toggle: a mark within r of pos is removed, else one is placed.
    toggle(id, pos, r = 10, opts) { return api.removeNear(id, pos.x, pos.z, r) ? null : api.add(id, pos, opts); },
    clear(id) { const p = P(id); if (!p.marks.length && !p.pinned) return; p.marks.length = 0; p.pinned = null; version++; },
    // "Set route": pin any target ({ x, y, z, label, markId? } or null to unpin).
    pin(id, target) { P(id).pinned = target ? { ...target } : null; version++; },
    pinnedOf: (id) => P(id).pinned,
    // The point the GPS should route this player to: pinned, else newest own mark, else a mark
    // the partner left for this player, else the objective (any { x, y, z }), else null.
    routeTarget(id, objective = null) {
      const p = P(id);
      if (p.pinned) { const m = p.pinned.markId ? p.marks.find((k) => k.id === p.pinned.markId) : null; return m ?? p.pinned; }
      let newest = null;
      for (const m of p.marks) if (m.forPlayer == null && (!newest || m.t > newest.t)) newest = m;
      if (newest) return newest;
      for (const [oid, o] of players) if (oid !== id) for (const m of o.marks) if (m.forPlayer === id && (!newest || m.t > newest.t)) newest = m;
      return newest ?? objective ?? null;
    },
    // ---- tracked marks (mapMark events) ----
    track(ev) {
      if (!ev || typeof ev.id !== 'string') return null;
      const i = tracked.findIndex((m) => m.id === ev.id);
      if (ev.remove) { if (i >= 0) { tracked.splice(i, 1); version++; } return null; }
      const m = { id: ev.id, kind: ev.kind ?? 'tracked', pos: ev.pos ?? null, target: ev.target ?? null, ttl: ev.ttl > 0 ? ev.ttl : Infinity, player: ev.player ?? null, label: ev.label ?? null };
      if (i >= 0) tracked[i] = m; else tracked.push(m);
      version++;
      return m;
    },
    // Where a tracked mark is now ({ x, y, z }) or null.
    trackedPos(m) { const p = posOf(m.target) ?? m.pos; return p && Number.isFinite(p.x) ? p : null; },
    update(dt) {
      for (let i = tracked.length - 1; i >= 0; i--) {
        const m = tracked[i];
        m.ttl -= dt;
        if (m.ttl <= 0 || (m.target && m.target.alive === false)) { tracked.splice(i, 1); version++; }
      }
    },
    // ---- breadcrumbs ----
    crumb(id, x, z) {
      const p = P(id);
      if (Number.isFinite(p.lastX) && (x - p.lastX) ** 2 + (z - p.lastZ) ** 2 < BREADCRUMB.step ** 2) return false;
      p.lastX = x; p.lastZ = z;
      p.crumbs[p.crumbHead * 2] = x; p.crumbs[p.crumbHead * 2 + 1] = z;
      p.crumbHead = (p.crumbHead + 1) % BREADCRUMB.count;
      p.crumbN = Math.min(BREADCRUMB.count, p.crumbN + 1);
      return true;
    },
    // Calls fn(x, z, age 0..1 oldest) for each breadcrumb, oldest first.
    eachCrumb(id, fn) {
      const p = P(id);
      for (let k = 0; k < p.crumbN; k++) {
        const i = (p.crumbHead - p.crumbN + k + BREADCRUMB.count) % BREADCRUMB.count;
        fn(p.crumbs[i * 2], p.crumbs[i * 2 + 1], 1 - k / Math.max(1, p.crumbN));
      }
    },
    // Saved form of one player's marks (player 1's go in progress.map.wps).
    save: (id) => P(id).marks.map((m) => ({ x: m.x, y: m.y, z: m.z, c: m.c })),
    load(id, list = []) { const p = P(id); p.marks.length = 0; for (const w of list) p.marks.push({ id: `wp${++seq}`, by: id, x: w.x, y: w.y, z: w.z, c: w.c, label: null, forPlayer: null, t: seq }); version++; },
  };
  return api;
}
