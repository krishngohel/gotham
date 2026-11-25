// Battle mode's weapons (workstream L3, `[move]`). Pure rules; vehicles.js fires them.
//
// The turret picks its round by what it is locked on, never by a menu, so the lethal-looking gun
// only ever hits machines:
//   'cannon'       heavy cannon: unmanned drones and drone tanks only (target.unmanned)
//   'immobiliser'  a manned vehicle (a getaway car, a convoy truck): an EMP slug that drains its
//                  `stop` meter until it rolls to a halt; nobody inside is hurt
//   'riot'         a person: a non-lethal riot round that knocks him down
// The missile barrage (bmBarrage upgrade) fires at up to six unmanned targets when its meter is
// full; the meter fills from heavy-cannon hits and slowly over time in battle mode.

export const TURRET = { range: 60, lockAngle: 0.22, cannonCd: 0.35, riotCd: 0.5, immobCd: 0.45 };

export function roundFor(target) {
  if (!target) return 'cannon';
  if (target.unmanned) return 'cannon';
  if (target.vehicle) return 'immobiliser';
  return 'riot';
}

// The lock: the target nearest the aim line within lockAngle and range (targets: [{ x, y, z,
// alive?, ... }]; aim from origin along yaw/pitch). Returns the target or null.
export function pickLock(targets, origin, aimYaw, aimPitch = 0, { range = TURRET.range, lockAngle = TURRET.lockAngle } = {}) {
  const dx0 = Math.sin(aimYaw) * Math.cos(aimPitch), dy0 = Math.sin(aimPitch), dz0 = Math.cos(aimYaw) * Math.cos(aimPitch);
  let best = null, bestA = lockAngle;
  for (const t of targets) {
    if (t.alive === false || t.dead) continue;
    const dx = t.x - origin.x, dy = (t.y ?? origin.y) - origin.y, dz = t.z - origin.z, d = Math.hypot(dx, dy, dz);
    if (d > range || d < 1) continue;
    // Horizontal angle mostly (the camera pitch is loose in a car); a little vertical tolerance.
    const a = Math.acos(Math.max(-1, Math.min(1, (dx * dx0 + dz * dz0) / (Math.hypot(dx, dz) * Math.hypot(dx0, dz0) || 1)))) + Math.abs(Math.atan2(dy, Math.hypot(dx, dz)) - Math.atan2(dy0, Math.hypot(dx0, dz0))) * 0.15;
    if (a < bestA) { bestA = a; best = t; }
  }
  return best;
}

// The barrage meter: { value 0..1 }. Heavy hits add, battle time adds a trickle.
export const BARRAGE = { perHit: 0.18, perSecond: 0.03, salvo: 6 };
export function fillMeter(m, { hits = 0, dt = 0 } = {}, k = BARRAGE) {
  m.value = Math.min(1, m.value + hits * k.perHit + dt * k.perSecond);
  return m;
}
export function canBarrage(m, owned) { return !!owned && m.value >= 1; }
// Which targets a salvo goes to: the nearest unmanned ones, up to `salvo`.
export function salvoTargets(targets, origin, k = BARRAGE, range = TURRET.range * 1.2) {
  return targets
    .filter((t) => t.unmanned && !t.dead && t.alive !== false && Math.hypot(t.x - origin.x, t.z - origin.z) < range)
    .sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z))
    .slice(0, k.salvo);
}
