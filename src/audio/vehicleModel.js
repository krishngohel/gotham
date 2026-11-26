// Pure vehicle-engine models: a gearbox for piston cars, a spooling turbine for the Batmobile and
// the Batwing. vehicleAudio.js reads the result every frame and moves oscillator/filter params.

// Top speed (as a fraction of the vehicle's own) covered by each gear.
export const GEARS = {
  car: [0.16, 0.33, 0.52, 0.74, 1],
  truck: [0.1, 0.22, 0.36, 0.52, 0.7, 0.86, 1],
};

const c01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));
export const IDLE_RPM = 0.14;

export function makeEngineState() {
  return { gear: 0, rpm: IDLE_RPM, load: 0, speed: 0, spool: 0, shift: 0, shifted: false };
}

// Piston engine with an automatic gearbox. speedFrac 0..1 of the vehicle's top speed; throttle
// 0..1 when the caller knows it (otherwise it is inferred from acceleration). dt in seconds.
// Mutates and returns `s`. `s.shifted` is true on the frame a gear change happens, and `s.shift`
// counts down the brief torque dip that follows (the rpm sag you hear between gears).
export function stepGearbox(s, speedFrac, { throttle = null, dt = 1 / 60, kind = 'car' } = {}) {
  const tops = GEARS[kind] ?? GEARS.car;
  const v = c01(speedFrac);
  const accel = (v - s.speed) / Math.max(1e-3, dt);
  s.speed = v;
  const want = throttle === null || throttle === undefined ? c01(0.25 + accel * 4) : c01(throttle);
  s.load += (want - s.load) * Math.min(1, dt * 8);
  s.shifted = false;
  let g = s.gear;
  if (g < tops.length - 1 && v > tops[g] * 0.96) g++;
  else if (g > 0 && v < tops[g - 1] * 0.72) g--;
  if (g !== s.gear) { s.gear = g; s.shifted = true; s.shift = 0.12; }
  const lo = g > 0 ? tops[g - 1] * 0.55 : 0;
  const band = Math.max(1e-3, tops[g] - lo);
  let target = IDLE_RPM + (1 - IDLE_RPM) * c01((v - lo) / band) * 0.92;
  if (v < 0.02) target = IDLE_RPM + 0.12 * s.load; // revving in place
  if (s.shift > 0) { s.shift -= dt; target *= 0.82; }
  s.rpm += (target - s.rpm) * Math.min(1, dt * (s.shifted ? 30 : 10));
  return s;
}

// Turbine: spool chases throttle (and speed) with lag up and faster run-down; no gears.
export function stepTurbine(s, speedFrac, { throttle = null, dt = 1 / 60, boost = false } = {}) {
  const v = c01(speedFrac);
  const accel = (v - s.speed) / Math.max(1e-3, dt);
  s.speed = v;
  const want = throttle === null || throttle === undefined ? c01(0.2 + 0.6 * v + accel * 3) : c01(0.15 + 0.85 * throttle);
  const target = Math.max(want, boost ? 1 : 0);
  const rate = target > s.spool ? 1.6 : 2.6; // spools up slower than it winds down
  s.spool += (target - s.spool) * Math.min(1, dt * rate);
  s.load += (c01(want + (boost ? 0.4 : 0)) - s.load) * Math.min(1, dt * 6);
  s.rpm = IDLE_RPM + (1 - IDLE_RPM) * s.spool;
  s.shifted = false;
  return s;
}

// Firing frequency in Hz of a piston engine at a normalised rpm: idle ~ 28 Hz, redline ~ 190 Hz
// (a V8's fundamental is cylinders/2 x rev/s; these are the musical values, not literal ones).
export const firingHz = (rpm, kind = 'car') => (kind === 'truck' ? 18 + 105 * rpm : 26 + 168 * rpm);
// Turbine whine centre frequency.
export const turbineHz = (spool, kind = 'batmobile') => (kind === 'wing' ? 260 + 900 * spool : 520 + 2300 * spool);
