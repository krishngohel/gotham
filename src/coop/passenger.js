// Vehicles for two (workstream D1). One player drives the Batmobile (or flies the Batwing); the
// other rides along in a simple passenger seat, or, with nobody driving, takes the wheel themself.
//   - The vehicle key (and the Batwing key): whoever presses it with nothing driven becomes the
//     driver (vehicles.setDriver / batwing.setPilot) and summons, enters or calls as usual. With a
//     vehicle driven by the partner, the key boards it as a passenger when close (12 m for the
//     Batmobile; the Batwing picks its passenger up anywhere), or leaves the seat.
//   - A passenger is hidden, rides at the vehicle, and their camera chases the vehicle. In the
//     drone battle the passenger is the gunner: punch fires the Batmobile's cannon.
//   - The driver getting out (or ejecting, or the mission ending) puts the passenger out beside it.
//   - Story vehicle missions (chase, battle, armada) seat a partner who is not aboard yet, so the
//     team stays together and the tether never has to pull anyone across the city.
// With one player nothing here runs: player 0 drives exactly as before.
import { withPlayer } from '../core/events.js';
import { can } from '../abilities/gate.js'; // [verify] a partner calls only what the story has given

const BOARD_RANGE = 12;
const SEAT_MISSIONS = new Set(['chase', 'battle', 'armada']);

export function createSeats({ vehicles, batwing, players, events, getFlow, follow0 }) {
  const seats = new Map(); // player -> { kind: 'car' | 'wing' }
  // [net2] An online partner has no camera rig here: its aim comes off the wire (p.netFollow).
  const followOf = (p) => (p.slot === 0 ? follow0 : p.rig?.follow ?? p.netFollow);
  const driverOf = () => players.list.find((p) => p.hero === vehicles.driver) ?? null;
  const pilotOf = () => players.list.find((p) => p.hero === batwing.pilot) ?? null;

  function sit(p, kind) {
    const h = p.hero;
    seats.set(p, { kind });
    h.control = { name: 'ride', camera: kind === 'wing' ? 'fly' : 'drive', ride: true, update: () => false };
    h.bat.root.visible = false;
    h.cape.mesh.visible = false;
    h.vel.set(0, 0, 0);
    events.emit('passengerIn', withPlayer({ kind }, p));
  }
  function stand(p) {
    const s = seats.get(p);
    if (!s) return;
    seats.delete(p);
    const h = p.hero;
    const at = s.kind === 'wing' ? null : vehicles.active?.group?.position ?? vehicles.batmobile?.group?.position;
    h.bat.root.visible = true;
    h.cape.mesh.visible = true;
    h.control = null;
    const base = at ?? h.pos;
    h.teleport({ x: base.x + 2.4, y: base.y + 0.2, z: base.z + 0.6 }, h.bat.yaw);
    // [move] The driver ejected at speed: the passenger goes up and out too, into a glide.
    const ej = s.kind === 'car' ? vehicles.lastEject : null;
    if (ej && ej.frames > 0) {
      h.pos.set(base.x + 1.2, base.y + 1.8, base.z);
      h.vel.set(ej.vx * 0.95, ej.vy * 1.05, ej.vz * 0.95);
      h.grounded = false;
      h.setState('air');
      h.airT = 0.25;
      h.startGlide?.();
    }
    events.emit('passengerOut', withPlayer({ kind: s.kind }, p));
  }

  // The vehicle key for player p. Returns true when co-op handled it (the caller does nothing more).
  function vehicleKey(p) {
    if (players.count < 2) return false;
    if (seats.has(p)) { stand(p); return true; }
    if (vehicles.riderKey?.(p)) return true; // [move] off their own bike
    const car = vehicles.active;
    if (car) {
      if (vehicles.driver === p.hero) { vehicles.useKey(); return true; }
      const d = Math.hypot(p.hero.pos.x - car.group.position.x, p.hero.pos.z - car.group.position.z);
      if (d < BOARD_RANGE) sit(p, 'car');
      else if (can(p.hero, 'batmobileCall')) vehicles.summonBikeFor?.(p); // [move] too far to board: call your own bike; [verify] once calling a ride is taught
      return true;
    }
    if (vehicles.driver !== p.hero) vehicles.setDriver({ hero: p.hero, input: p.input, follow: followOf(p) });
    vehicles.useKey();
    return true;
  }
  // The Batwing key for player p (true: handled).
  function batwingKey(p) {
    if (players.count < 2) return false;
    if (seats.has(p)) { stand(p); return true; }
    if (batwing.active) {
      if (batwing.pilot === p.hero) batwing.exit();
      else sit(p, 'wing');
      return true;
    }
    if (!can(p.hero, 'batwing')) return true; // [verify] the Batwing call is the story's to give (player 0's key is gated in game.js)
    if (batwing.pilot !== p.hero) batwing.setPilot({ hero: p.hero, follow: followOf(p) });
    batwing.call();
    return true;
  }

  // Every play frame: passengers ride; a gunner fires; seats empty when the ride ends.
  function update() {
    if (players.count < 2) { if (seats.size) for (const p of [...seats.keys()]) stand(p); return; }
    const flow = getFlow();
    const step = flow.objectives.step;
    // A story vehicle mission seats a partner who is still on foot.
    if (step && SEAT_MISSIONS.has(step.type) && flow.mode === 'play') {
      const kind = step.type === 'armada' ? 'wing' : 'car';
      const live = kind === 'wing' ? batwing.active : vehicles.active;
      const driver = kind === 'wing' ? batwing.pilot : vehicles.driver;
      if (live) for (const p of players.list) if (p.hero !== driver && !seats.has(p) && !p.hero.dead) sit(p, kind);
    }
    for (const [p, s] of seats) {
      const live = s.kind === 'wing' ? batwing.active : vehicles.active;
      if (!live) { stand(p); continue; }
      const src = s.kind === 'wing' ? batwing.state : vehicles.active.group.position;
      p.hero.pos.set(src.x, (src.y ?? 0), src.z);
      const f = followOf(p);
      const yaw = s.kind === 'wing' ? batwing.state.yaw : vehicles.active.v.yaw;
      const speed = s.kind === 'wing' ? batwing.state.speed : Math.abs(vehicles.active.v.speed);
      f?.setHeading?.(yaw, speed);
      // [move] The gunner fires the battle-mode turret where their own camera looks (held: it keeps firing).
      if (s.kind === 'car' && (p.input.pressed('punch') || (vehicles.mode === 'battle' && p.input.down('punch')))) vehicles.fireCannon(f);
      // Nobody fights a passenger: they are inside the car or the plane.
      p.hero.invulnerable = Math.max(p.hero.invulnerable, 0.3);
    }
  }

  return {
    vehicleKey, batwingKey, update,
    isMounted: (h) => vehicles.driver === h && !!vehicles.active || batwing.pilot === h && batwing.active || [...seats.keys()].some((p) => p.hero === h),
    seated: (p) => seats.has(p),
    // Both players in one vehicle (the tether never pulls a ride apart).
    together: () => seats.size > 0,
    leave: (p) => stand(p),
    driverOf, pilotOf,
  };
}
