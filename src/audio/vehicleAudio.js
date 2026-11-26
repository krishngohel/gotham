import { noiseBuffer, filter, drive } from './synth.js';
import { engineParams } from './engineCurve.js';
import { makeEngineState, stepGearbox, stepTurbine, firingHz, turbineHz } from './vehicleModel.js';
import { passByAt } from './spatial.js';

// Vehicle sound: the driven vehicle's engine loop (one at a time), tyre skid, and one-shot
// doppler pass-bys for traffic. Nodes for a kind are built the first time it is driven and then
// only have their params moved, so setEngine() is safe to call every frame.
//
//   car       piston engine, automatic gearbox (vehicleModel.js), load opens the filter
//   batmobile turbine whine + low rumble; 'battle' mode deepens it and adds a servo hum;
//             boost lights an afterburner roar on top
//   wing      jet: turbine rush and a sweeping whine

export function createVehicleAudio(ctx, out) {
  const built = {};
  const state = { car: makeEngineState(), batmobile: makeEngineState(), wing: makeEngineState() };
  let last = 0;
  let skid = null;
  const scratch = {};

  const loopNoise = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    s.loop = true;
    s.start(ctx.currentTime, Math.random() * 1.9);
    return s;
  };
  const osc = (type, f, to) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(); return o; };
  const g0 = (to, v = 0) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };

  function buildCar() {
    const g = g0(out);
    // load drives a soft clip: a working engine growls, a coasting one hums
    const post = g0(g, 0.7);
    const shaper = drive(ctx, post, 2.5);
    const lp = filter(ctx, shaper, 'lowpass', 400, 1.2);
    const o1 = osc('sawtooth', 40, lp);
    const o2 = osc('sawtooth', 40, lp); o2.detune.value = 9;
    const subG = g0(lp, 0.5);
    const sub = osc('square', 20, subG);
    const exG = g0(g);
    const ex = filter(ctx, exG, 'bandpass', 700, 0.8);
    loopNoise().connect(ex);
    return { g, lp, o1, o2, sub, exG, ex };
  }

  function buildBatmobile() {
    const g = g0(out);
    // turbine whine: two close sines (beating) through a resonant band-pass
    const whineG = g0(g);
    const wbp = filter(ctx, whineG, 'bandpass', 1500, 5);
    const w1 = osc('sawtooth', 1500, wbp);
    const w2 = osc('sine', 1507, whineG);
    // low rumble
    const rumG = g0(g);
    const rlp = filter(ctx, rumG, 'lowpass', 160, 1);
    const r1 = osc('sawtooth', 42, rlp);
    const r2 = osc('sawtooth', 42.6, rlp);
    // intake rush
    const rushG = g0(g);
    const rush = filter(ctx, rushG, 'bandpass', 900, 0.9);
    loopNoise().connect(rush);
    // afterburner: low noise roar through drive, opened by boost
    const abG = g0(g);
    const abPost = g0(abG, 0.6);
    const abDrive = drive(ctx, abPost, 4);
    const abLp = filter(ctx, abDrive, 'lowpass', 400, 0.7);
    loopNoise().connect(abLp);
    const abSub = osc('sawtooth', 55, abLp);
    // battle-mode servo hum
    const servoG = g0(g);
    const servo = osc('triangle', 220, filter(ctx, servoG, 'lowpass', 900, 1));
    return { g, whineG, wbp, w1, w2, rumG, rlp, r1, r2, rushG, rush, abG, abLp, abSub, servoG, servo };
  }

  function buildWing() {
    const g = g0(out);
    const rushG = g0(g);
    const bp = filter(ctx, rushG, 'bandpass', 500, 1.1);
    loopNoise().connect(bp);
    const whineG = g0(g);
    const o = osc('sawtooth', 300, filter(ctx, whineG, 'lowpass', 2400, 0.8));
    return { g, rushG, bp, whineG, o };
  }

  const BUILD = { car: buildCar, batmobile: buildBatmobile, wing: buildWing };
  const KINDS = Object.keys(BUILD);

  function setEngine(kind, level = 1, speedFrac = 0, opts = {}) {
    const now = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(1 / 240, now - last || 1 / 60));
    last = now;
    const lvl = Math.min(1, Math.max(0, Number(level) || 0));
    const k = KINDS.includes(kind) && lvl > 0 ? kind : null;
    const tc = 0.06;
    if (k) {
      if (!built[k]) built[k] = BUILD[k]();
      const e = built[k];
      const s = state[k];
      const base = engineParams(k, speedFrac, !!opts.boost, scratch);
      const throttle = Number.isFinite(opts.throttle) ? opts.throttle : null;
      if (k === 'car') {
        stepGearbox(s, speedFrac, { throttle, dt });
        const f = firingHz(s.rpm);
        e.o1.frequency.setTargetAtTime(f, now, tc);
        e.o2.frequency.setTargetAtTime(f, now, tc);
        e.sub.frequency.setTargetAtTime(f / 2, now, tc);
        e.lp.frequency.setTargetAtTime(220 + 2400 * s.rpm * (0.35 + 0.65 * s.load), now, tc);
        e.ex.frequency.setTargetAtTime(500 + 1600 * s.rpm, now, tc);
        e.exG.gain.setTargetAtTime(base.noise * lvl * (0.5 + s.load), now, tc);
        e.g.gain.setTargetAtTime(base.vol * lvl * 1.25 * (0.6 + 0.4 * s.load), now, tc);
      } else if (k === 'batmobile') {
        stepTurbine(s, speedFrac, { throttle, dt, boost: !!opts.boost });
        const battle = opts.mode === 'battle';
        const wf = turbineHz(s.spool) * (battle ? 0.7 : 1);
        e.w1.frequency.setTargetAtTime(wf, now, tc);
        e.w2.frequency.setTargetAtTime(wf * 1.004 + 3, now, tc);
        e.wbp.frequency.setTargetAtTime(wf, now, tc);
        e.whineG.gain.setTargetAtTime(lvl * (0.012 + 0.03 * s.spool), now, tc);
        const rf = (battle ? 30 : 38) + 34 * s.rpm;
        e.r1.frequency.setTargetAtTime(rf, now, tc);
        e.r2.frequency.setTargetAtTime(rf * 1.015, now, tc);
        e.rlp.frequency.setTargetAtTime(120 + 260 * s.load, now, tc);
        e.rumG.gain.setTargetAtTime(base.vol * lvl * (battle ? 1.3 : 1), now, tc);
        e.rush.frequency.setTargetAtTime(600 + 2200 * s.spool, now, tc);
        e.rushG.gain.setTargetAtTime(base.noise * lvl * (0.6 + s.spool), now, tc);
        const ab = opts.boost ? 0.09 + 0.05 * s.spool : 0;
        e.abG.gain.setTargetAtTime(ab * lvl, now, opts.boost ? 0.05 : 0.25);
        e.abLp.frequency.setTargetAtTime(opts.boost ? 2600 : 400, now, 0.12);
        e.abSub.frequency.setTargetAtTime(45 + 30 * s.spool, now, tc);
        e.servoG.gain.setTargetAtTime(battle ? 0.012 * lvl : 0, now, 0.2);
        e.servo.frequency.setTargetAtTime(180 + 120 * s.load, now, tc);
        e.g.gain.setTargetAtTime(1, now, tc);
      } else {
        stepTurbine(s, speedFrac, { throttle, dt });
        e.bp.frequency.setTargetAtTime(base.freq * 1.5, now, tc);
        e.rushG.gain.setTargetAtTime(base.vol * lvl, now, tc);
        e.o.frequency.setTargetAtTime(turbineHz(s.spool, 'wing'), now, tc);
        e.whineG.gain.setTargetAtTime(base.noise * lvl * 0.35, now, tc);
        e.g.gain.setTargetAtTime(1, now, tc);
      }
    }
    for (const name of KINDS) {
      if (name === k || !built[name]) continue;
      built[name].g.gain.setTargetAtTime(0, now, 0.3);
    }
    setSkid(k ? opts.skid ?? 0 : 0);
  }

  function setSkid(x) {
    const v = Math.min(1, Math.max(0, Number(x) || 0));
    if (!skid && v <= 0) return;
    const now = ctx.currentTime;
    if (!skid) {
      const g = g0(out);
      const bp = filter(ctx, g, 'bandpass', 2000, 8);
      loopNoise().connect(bp);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 11;
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg); lg.connect(bp.frequency);
      lfo.start();
      skid = { g, bp };
    }
    skid.g.gain.setTargetAtTime(v * 0.22, now, 0.05);
    skid.bp.frequency.setTargetAtTime(1700 + 700 * v, now, 0.1);
  }

  // A car (or truck, or siren) driving past the listener. opts: { kind, speed m/s, closest m,
  // side -1 left / 1 right, gain }. Bakes the doppler curve into ~16 automation points.
  function passBy(t, { kind = 'car', speed = 16, closest = 6, side = 1, gain = 1 } = {}) {
    const span = Math.min(9, Math.max(2.5, 140 / Math.max(4, speed)));
    const start = t;
    const mid = start + span / 2;
    const g = ctx.createGain();
    g.gain.value = 0; // silent before the first event, whatever the rounding of t
    g.gain.setValueAtTime(0, start);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { g.connect(pan); pan.connect(out); } else g.connect(out);
    const siren = kind === 'siren';
    const truck = kind === 'truck';
    const src = ctx.createOscillator();
    src.type = siren ? 'triangle' : 'sawtooth';
    const lp = filter(ctx, g, 'lowpass', siren ? 4000 : truck ? 380 : 650, 0.8);
    src.connect(lp);
    const nz = ctx.createBufferSource();
    nz.buffer = noiseBuffer(ctx);
    nz.loop = true;
    const ng = g0(null, siren ? 0.15 : 0.55);
    nz.connect(filter(ctx, ng, 'bandpass', truck ? 500 : 900, 0.7));
    ng.connect(g);
    const baseF = siren ? 900 : truck ? 34 : 62;
    src.frequency.setValueAtTime(baseF, start);
    if (pan) pan.pan.setValueAtTime(-side, start);
    const pt = {};
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const at = start + (span * i) / N;
      passByAt(at - mid, speed, closest, pt);
      const lvl = Math.max(1e-4, pt.gain * 0.16 * gain);
      g.gain.linearRampToValueAtTime(lvl, at);
      if (pan) pan.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, pt.side * side)), at);
      if (!siren) src.frequency.linearRampToValueAtTime(baseF * pt.ratio, at);
    }
    if (siren) {
      // a wail: the pitch sweeps up and down every ~1.6 s, doppler-shifted around the midpoint
      for (let x = 0; x <= span; x += 0.8) {
        passByAt(start + x - mid, speed, closest, pt);
        const up = Math.floor(x / 0.8) % 2 === 0;
        src.frequency.linearRampToValueAtTime((up ? 1350 : 700) * pt.ratio, start + x + 0.8);
      }
    }
    g.gain.linearRampToValueAtTime(0, start + span + 0.05);
    src.start(start); src.stop(start + span + 0.1);
    nz.start(start, Math.random()); nz.stop(start + span + 0.1);
    return start + span + 0.1;
  }

  return { setEngine, setSkid, passBy };
}
