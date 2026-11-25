// [net2] Vehicles online (docs/design/vehicles.md 8). The host owns every vehicle: the Batmobile,
// the Batwing, bikes, chases, drones. A guest can still drive, ride and gun, all host-simulated
// from the guest's own input (its hero record carries the stick, the presses and the camera aim):
//   - the vehicle key on the guest reaches the host as a press edge; the co-op seat rules
//     (src/coop/passenger.js) make the guest the driver (nothing driven), a passenger (beside the
//     host's car), or put it out again. A driving guest's vehicles.update input is its remote input
//     and its "follow" is p.netFollow (the camera aim off the wire): pursuit steering, battle-mode
//     strafe, the turret where the guest looks, boost, dodge, eject.
//   - the gunner seat: the guest's punch fires the turret along its own camera (passenger.js).
//   - the Batwing: the host flies; the guest rides (its Batwing key boards as passenger). A guest
//     pilot is not wired: its key with no plane up shows "host only for now".
//   - bikes: a guest's own bike is not wired (host only for now); it rides in the car instead.
// Props on the wire (snapshot prop records): 1 the Batmobile (pose, speed, flags: 1 visible,
// 2 battle mode, 4 firing, 8 boosting; pitch/roll carry the turret's aim), 2 the Batwing (pose),
// 3 the Batmobile's moving parts (x: transform 0..1, y: canopy 0..1, z: strafe).
export const PROP = { car: 1, wing: 2, carParts: 3 };
export const PF = { visible: 1, battle: 2, firing: 4, boost: 8 };

export function createVehicleHost({ vehicles, batwing, remote, rep, coop, hint }) {
  const car = { id: PROP.car, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, flags: 0 };
  const parts = { id: PROP.carParts, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, flags: 0 };
  const wing = { id: PROP.wing, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, flags: 0 };
  const bm = vehicles?.batmobile;
  // The model's last turret aim, canopy, firing and boost (bmVisuals keeps them in closures).
  const seen = { aimYaw: 0, aimPitch: 0, canopy: 0, firing: false, boost: false };
  const restore = [];
  const wrap = (obj, k, fn) => { if (!obj || typeof obj[k] !== 'function') return; const orig = obj[k]; restore.push(() => { obj[k] = orig; }); obj[k] = function (...a) { fn(...a); return orig.apply(this, a); }; };
  wrap(bm, 'aimTurret', (y, p = 0) => { seen.aimYaw = y; seen.aimPitch = p; });
  wrap(bm, 'setCanopy', (c) => { seen.canopy = c; });
  wrap(bm, 'setFiring', (on) => { seen.firing = !!on; });
  wrap(bm, 'setBoost', (on) => { seen.boost = !!on; });
  // The guest's camera aim (its hero record) for the seat code and the driver's battle aim.
  remote.netAim = remote.netAim ?? { yaw: 0, pitch: 0 };
  remote.netFollow = { state: remote.netAim, setHeading() {}, setBank() {}, addShake() {}, hitKick() {}, snapBehind() {} };
  // A guest's own bike and a guest pilot are not wired yet: say so instead of a broken state.
  const seats = coop?.seats;
  if (seats) {
    const origWing = seats.batwingKey;
    seats.batwingKey = (p) => {
      if (p === remote && !batwing?.active) { hint('The Batwing is host only for now: ask your partner to call it, then press the Batwing key to ride along.'); return true; }
      return origWing(p);
    };
    restore.push(() => { seats.batwingKey = origWing; });
  }
  if (vehicles?.summonBikeFor) {
    const origBike = vehicles.summonBikeFor;
    vehicles.summonBikeFor = (p) => { if (p === remote) { hint('Your own bike is host only for now: walk up to the Batmobile and press the vehicle key to ride in it.'); return false; } return origBike(p); };
    restore.push(() => { vehicles.summonBikeFor = origBike; });
  }
  let driving = false;
  return {
    get driving() { return driving; },
    frame() {
      // The guest at the wheel: tell it (its camera chases the car; its hero is carried).
      const d = !!vehicles?.active && vehicles.driver === remote.hero;
      if (d !== driving) {
        driving = d;
        const ej = !d && vehicles.lastEject?.frames > 0 ? { vx: vehicles.lastEject.vx, vy: vehicles.lastEject.vy, vz: vehicles.lastEject.vz } : null;
        rep.event({ t: 'ev', name: 'ride', data: { on: d, kind: 'car', drive: true, ...(ej ? { ej } : {}) } });
      }
    },
    collect(out) {
      if (bm?.group) {
        const p = bm.group.position;
        car.x = p.x; car.y = p.y; car.z = p.z; car.yaw = bm.group.rotation.y;
        car.speed = bm.v?.speed ?? 0;
        car.pitch = seen.aimPitch; car.roll = seen.aimYaw;
        car.flags = (bm.group.visible ? PF.visible : 0) | (bm.battle ? PF.battle : 0) | (seen.firing ? PF.firing : 0) | (seen.boost || bm.heat?.boosting ? PF.boost : 0);
        out.push(car);
        if (bm.group.visible) {
          parts.x = bm.modeT ?? 0; parts.y = seen.canopy; parts.z = bm.v?.lat ?? 0; parts.yaw = 0; parts.flags = 1;
          out.push(parts);
        }
      }
      const m = batwing?.mesh, s = batwing?.state;
      if (m && s) {
        wing.x = m.position.x; wing.y = m.position.y; wing.z = m.position.z;
        wing.yaw = m.rotation.y; wing.pitch = -m.rotation.x; wing.roll = -m.rotation.z;
        wing.speed = s.speed ?? 0;
        wing.flags = m.visible ? PF.visible : 0;
        out.push(wing);
      }
    },
    dispose() { for (const r of restore.splice(0)) r(); delete remote.netFollow; },
  };
}

// The guest: the host's vehicles posed from the props; our hero carried while it rides or drives.
export function createVehicleGuest({ vehicles, batwing, hero, follow, events, withPlayer, p0 }) {
  const at = { car: { ok: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0 }, wing: { ok: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0 } };
  let riding = null; // { kind, drive }
  const bm = vehicles?.batmobile;
  let modeShown = -1, wasVisible = null;
  function ride(on, kind = 'car', { drive = false, ej = null } = {}) {
    const h = hero;
    if (on) {
      riding = { kind, drive };
      h.control = { name: drive ? 'netDrive' : 'ride', camera: kind === 'wing' ? 'fly' : 'drive', ride: true, update: () => false };
      h.bat.root.visible = false; h.cape.mesh.visible = false;
      h.vel.set(0, 0, 0);
      events.emit(drive ? 'vehicleEnter' : 'passengerIn', withPlayer({ kind: kind === 'wing' ? 'wing' : drive ? 'batmobile' : kind, remote: true }, p0));
    } else if (riding) {
      const was = riding;
      riding = null;
      if (h.control?.ride) h.control = null;
      h.bat.root.visible = true; h.cape.mesh.visible = true;
      // Ejected at speed: up and out into a glide, as the driver does on the host.
      if (ej && Number.isFinite(ej.vx)) {
        const c = at.car;
        h.pos.set(c.x, c.y + 1.8, c.z);
        h.vel.set(ej.vx, ej.vy, ej.vz);
        h.grounded = false;
        h.setState?.('air');
        h.airT = 0.25;
        h.startGlide?.();
      }
      events.emit(was.drive ? 'vehicleExit' : 'passengerOut', withPlayer({ kind: was.kind === 'wing' ? 'wing' : was.drive ? 'batmobile' : was.kind, remote: true }, p0));
    }
  }
  return {
    ride,
    get riding() { return riding; },
    prop(rec, pos) {
      if (rec.id === PROP.car) {
        const v = bm;
        if (!v?.group) return;
        const on = !!(rec.flags & PF.visible);
        v.group.visible = on;
        at.car.ok = on;
        if (on !== wasVisible) { wasVisible = on; }
        if (!on) return;
        v.group.position.set(pos.x, pos.y, pos.z);
        v.group.rotation.y = pos.yaw;
        at.car.x = pos.x; at.car.y = pos.y; at.car.z = pos.z; at.car.yaw = pos.yaw; at.car.speed = rec.speed ?? 0;
        try {
          v.aimTurret?.(rec.roll ?? 0, rec.pitch ?? 0);
          v.setFiring?.(!!(rec.flags & PF.firing));
          v.setBoost?.(!!(rec.flags & PF.boost));
          v.battle = !!(rec.flags & PF.battle);
        } catch { /* an older model */ }
      } else if (rec.id === PROP.carParts) {
        const v = bm;
        if (!v) return;
        try {
          const m = Math.round((rec.x ?? 0) * 100) / 100;
          if (m !== modeShown) { modeShown = m; v.modeT = m; v.setMode?.(m); }
          v.setCanopy?.(Math.max(0, Math.min(1, rec.y ?? 0)));
          if (v.v) v.v.lat = rec.z ?? 0;
        } catch { /* fine */ }
      } else if (rec.id === PROP.wing) {
        const m = batwing?.mesh;
        if (!m) return;
        const on = !!(rec.flags & PF.visible);
        m.visible = on;
        at.wing.ok = on;
        if (!on) return;
        m.position.set(pos.x, pos.y, pos.z);
        m.rotation.order = 'YXZ';
        m.rotation.y = pos.yaw; m.rotation.x = -(rec.pitch ?? 0); m.rotation.z = -(rec.roll ?? 0);
        at.wing.x = pos.x; at.wing.y = pos.y; at.wing.z = pos.z; at.wing.yaw = pos.yaw; at.wing.speed = rec.speed ?? 0;
      }
    },
    // Per frame: a riding or driving hero sits in the host's vehicle; the camera follows it.
    frame(dt) {
      if (bm?.group?.visible) { try { bm.update?.(dt); } catch { /* fine */ } }
      if (!riding) return;
      const a = riding.kind === 'wing' ? at.wing : at.car;
      if (!a.ok) return;
      hero.pos.set(a.x, a.y + (riding.kind === 'wing' ? 0 : 0.4), a.z);
      hero.vel.set(0, 0, 0);
      follow?.setHeading?.(a.yaw, Math.abs(a.speed));
    },
  };
}
