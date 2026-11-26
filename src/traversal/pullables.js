// Things a grapple line or the Batmobile's winch can pull (workstream L3, `[move]`): a registry
// missions and world content add to. Pure (positions are plain { x, y, z }).
//
//   register({ id, x, y, z, r = 1, heavy = false, onPull({ by, player, vehicle }) }) -> unregister()
//   heavy: only the Batmobile's winch (bmWinch upgrade) moves it: a gate, a shutter, a wall panel.
//   Light objects (a vent cover, a crate, a sign) answer the hero's grapple pull.
export function createPullables() {
  const list = [];
  return {
    list,
    register(o) {
      const rec = { r: 1, heavy: false, ...o };
      list.push(rec);
      return () => { const i = list.indexOf(rec); if (i >= 0) list.splice(i, 1); };
    },
    // The object nearest the aim line from `eye` along unit `dir`, within `range` and `maxAngle`.
    aimed(eye, dir, { range = 26, maxAngle = 0.22, heavy = false } = {}) {
      let best = null, bestA = maxAngle;
      for (const o of list) {
        if (!!o.heavy !== heavy) continue;
        const dx = o.x - eye.x, dy = o.y - eye.y, dz = o.z - eye.z, d = Math.hypot(dx, dy, dz);
        if (d > range || d < 1) continue;
        const a = Math.acos(Math.min(1, (dx * dir.x + dy * dir.y + dz * dir.z) / d)) - Math.atan((o.r ?? 1) / d);
        if (a < bestA) { bestA = a; best = o; }
      }
      return best;
    },
  };
}
