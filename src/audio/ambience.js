import { noiseBuffer, filter, tone, noise, metal, bell, organ, rand, mtof } from './synth.js';
import { playSlice } from './samples.js';
import { attenuation } from './spatial.js';
import { ambienceLevels, nextAmbientEvent, LAYERS, DEFAULT_ENV } from './cityAmbience.js';
import { createVehicleAudio } from './vehicleAudio.js';
import { renderVoiceLine } from './voiceBlip.js';

// The city's sound bed and the player's own wind/engine loops.
//
// Bed layers (traffic, crowd, water, harbour, industrial, insects, wind at height, rain, snow,
// room tone, distant city hum) are built the first time their level goes above zero and then
// only have their gains moved; cityAmbience.js decides the levels from the environment object.
// Sparse one-shots (a siren driving past, a dog, a car alarm, a jazz club door, the El) are
// scheduled from tick() on AudioContext time, at a random bearing and distance around the
// listener.
//
// Everything here plays into the ambience bus (`out`), except the vehicle engine, which plays
// into `sfxOut` so the Effects slider controls it like it always has.

const LEVEL = { hum: 0.08, traffic: 0.16, crowd: 0.12, water: 0.14, harbour: 0.13, industrial: 0.07, insects: 0.022, wind: 0.2, rain: 0.55, snow: 0.03, roomTone: 0.06 };

export function createAmbience(ctx, out, { sfxOut = out, samples = null, maxLayers = LAYERS.length, rng = Math.random } = {}) {
  const bedLP = ctx.createBiquadFilter(); // indoors/snow/altitude muffling of the whole bed
  bedLP.type = 'lowpass';
  bedLP.frequency.value = 18000;
  bedLP.Q.value = 0.5;
  bedLP.connect(out);
  const layers = {};
  let env = { ...DEFAULT_ENV };
  let mix = null;
  let rainLevel = 0;
  let glideLevel = 0;
  let glide = null;
  let nextDrip = 0;
  let nextEvent = 0;
  let nextPass = 0;
  let bedOn = false; // the city bed only plays once an environment has been set
  const vehicles = createVehicleAudio(ctx, sfxOut);

  const loop = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    s.loop = true;
    s.start(ctx.currentTime, Math.random() * 1.9);
    return s;
  };
  const gainNode = (v = 0, to = null) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const lfo = (freq, depth, param, type = 'sine') => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = gainNode(depth);
    o.connect(g); g.connect(param);
    o.start();
    return o;
  };

  // ---- bed layer builders: each returns { g } (its level gain) ----
  const BUILD = {
    hum() {
      const g = gainNode(0, bedLP);
      loop().connect(filter(ctx, g, 'lowpass', 140, 0.6));
      return { g };
    },
    traffic() {
      const g = gainNode(0, bedLP);
      const am = gainNode(0.75, g);
      lfo(0.07, 0.25, am.gain);
      loop().connect(filter(ctx, am, 'lowpass', 480, 0.5));
      const hiss = gainNode(0.25, am);
      loop().connect(filter(ctx, hiss, 'bandpass', 1150, 0.6));
      return { g };
    },
    crowd() {
      const g = gainNode(0, bedLP);
      const am = gainNode(0.6, g);
      lfo(3.3, 0.18, am.gain); lfo(4.9, 0.14, am.gain); lfo(7.1, 0.1, am.gain);
      const n = loop();
      n.connect(filter(ctx, am, 'bandpass', 620, 1.3));
      const f2 = gainNode(0.5, am);
      n.connect(filter(ctx, f2, 'bandpass', 1500, 2.2));
      return { g };
    },
    water() {
      const g = gainNode(0, bedLP);
      const am = gainNode(0.6, g);
      lfo(0.43, 0.35, am.gain);
      loop().connect(filter(ctx, am, 'lowpass', 430, 0.7));
      const sp = gainNode(0.12, g);
      lfo(0.31, 0.08, sp.gain);
      loop().connect(filter(ctx, sp, 'bandpass', 2600, 1));
      return { g };
    },
    harbour() {
      const g = gainNode(0, bedLP);
      const am = gainNode(0.6, g);
      lfo(0.11, 0.4, am.gain);
      loop().connect(filter(ctx, am, 'lowpass', 210, 0.8));
      return { g };
    },
    industrial() {
      const g = gainNode(0, bedLP);
      const lp = filter(ctx, g, 'lowpass', 420, 0.9);
      for (const [f, type] of [[60, 'sawtooth'], [120, 'sawtooth'], [180.4, 'square']]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const og = gainNode(type === 'square' ? 0.12 : 0.3, lp);
        o.connect(og); o.start();
      }
      const mach = gainNode(0.5, g);
      lfo(2.1, 0.3, mach.gain);
      loop().connect(filter(ctx, mach, 'bandpass', 310, 3));
      return { g };
    },
    insects() {
      const g = gainNode(0, bedLP);
      for (const [f, rate, burst] of [[4400, 17, 0.7], [4730, 19.5, 0.53]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const chirp = gainNode(0.5);
        lfo(rate, 0.5, chirp.gain, 'square');
        const bursts = gainNode(0.5, g);
        lfo(burst, 0.5, bursts.gain, 'square');
        o.connect(chirp); chirp.connect(bursts); o.start();
      }
      return { g };
    },
    wind() {
      const w = buildWind(bedLP);
      return { g: w.g, w };
    },
    rain() {
      const g = gainNode(0, bedLP);
      const hiss = gainNode(0.22, g);
      loop().connect(filter(ctx, filter(ctx, hiss, 'lowpass', 7000, 0.5), 'highpass', 900, 0.5));
      const body = gainNode(0.5, g);
      loop().connect(filter(ctx, body, 'lowpass', 650, 0.6));
      return { g };
    },
    snow() {
      const g = gainNode(0, bedLP);
      loop().connect(filter(ctx, g, 'highpass', 5500, 0.5));
      return { g };
    },
    roomTone() {
      const g = gainNode(0, out); // indoors: not behind the muffling filter
      loop().connect(filter(ctx, g, 'lowpass', 260, 0.6));
      const hum = gainNode(0.15, g);
      const o = ctx.createOscillator(); o.frequency.value = 60; o.connect(hum); o.start();
      return { g };
    },
  };

  function buildWind(dest) {
    const g = gainNode(0, dest);
    const bp = filter(ctx, g, 'bandpass', 500, 0.9);
    lfo(0.35, 180, bp.frequency);
    const pre = gainNode(1.6, bp);
    loop().connect(pre);
    const whistle = gainNode(0, g);
    const hp = filter(ctx, whistle, 'bandpass', 2400, 3);
    loop().connect(hp);
    return { g, bp, whistle, hp };
  }

  function layer(name) {
    if (!layers[name]) layers[name] = BUILD[name]();
    return layers[name];
  }

  function setLayer(name, level, time = 1.5) {
    if (level <= 0.001 && !layers[name]) return;
    const l = layer(name);
    l.g.gain.setTargetAtTime(level * LEVEL[name], ctx.currentTime, time / 3);
    if (name === 'wind' && l.w) {
      l.w.bp.frequency.setTargetAtTime(300 + 900 * level, ctx.currentTime, time / 3);
      l.w.whistle.gain.setTargetAtTime(level * level * 0.15, ctx.currentTime, time / 3);
    }
  }

  function applyEnv(time = 2) {
    mix = ambienceLevels(env, { maxLayers });
    const lv = mix.levels;
    for (const k of LAYERS) {
      // rain is also driven by setRain() (the old API); take the louder of the two
      const v = k === 'rain' ? Math.max(lv.rain, rainLevel) : lv[k];
      setLayer(k, bedOn || k === 'rain' ? v : 0, time);
    }
    bedLP.frequency.setTargetAtTime(mix.lowpass, ctx.currentTime, time / 3);
  }

  // ---- one-shot events ----
  const SHOUTS = ['Hey!', 'Watch it!', 'Taxi!', 'Get back here!', 'Somebody stop him!', 'Not my car!', 'Over here!'];
  const slice = (g, i) => samples?.get?.(g, i ?? Math.floor(rand(0, 5))) ?? null;

  // A one-shot's output: distance gain, an air-absorption low-pass and a pan, into the bed.
  function eventOut(t, distance, azimuth) {
    const g = gainNode(attenuation(distance, { ref: 12, max: 420, rolloff: 1 }) * 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(600, 9000 / (1 + distance / 70));
    lp.Q.value = 0.6;
    g.connect(lp);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.sin(azimuth) * 0.85;
      lp.connect(p);
      p.connect(bedLP);
    } else lp.connect(bedLP);
    return g;
  }

  const EVENTS = {
    sirenPass(t, o, d, az) { return vehicles.passBy(t, { kind: 'siren', speed: rand(14, 24), closest: d / 3, side: Math.sign(Math.sin(az)) || 1, gain: 0.8 }); },
    carHorn(t, o) {
      const n = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const at = t + i * 0.22;
        const lp = filter(ctx, o, 'lowpass', 1800, 0.8);
        tone(ctx, lp, at, { type: 'square', freq: 349, hold: i ? 0.12 : 0.3, d: 0.05, gain: 0.05 });
        tone(ctx, lp, at, { type: 'square', freq: 440, hold: i ? 0.12 : 0.3, d: 0.05, gain: 0.045 });
      }
      return t + 0.7;
    },
    carAlarm(t, o) {
      const lp = filter(ctx, o, 'lowpass', 2600, 0.7);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const g = gainNode(0, lp);
      const dur = 3.6;
      for (let x = 0; x < dur; x += 0.24) {
        osc.frequency.setValueAtTime(620, t + x);
        osc.frequency.linearRampToValueAtTime(1350, t + x + 0.22);
      }
      g.gain.setValueAtTime(0.025, t);
      g.gain.setValueAtTime(0.025, t + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g); osc.start(t); osc.stop(t + dur + 0.05);
      return t + dur;
    },
    dogBark(t, o) {
      const n = 2 + Math.floor(rand(0, 2));
      const p = rand(0.85, 1.2);
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.22, 0.34);
        const g = gainNode(0, o);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.35, at + 0.012);
        g.gain.exponentialRampToValueAtTime(1e-3, at + 0.14);
        const f1 = filter(ctx, g, 'bandpass', 850 * p, 4);
        const f2 = filter(ctx, g, 'bandpass', 1700 * p, 5);
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(430 * p, at);
        osc.frequency.exponentialRampToValueAtTime(290 * p, at + 0.13);
        osc.connect(f1); osc.connect(f2);
        osc.start(at); osc.stop(at + 0.15);
        noise(ctx, f1, at, { type: 'bandpass', freq: 1100 * p, Q: 1, d: 0.05, gain: 0.3 });
      }
      return t + n * 0.34;
    },
    shout(t, o) {
      const text = SHOUTS[Math.floor(rand(0, SHOUTS.length))];
      return renderVoiceLine(ctx, o, t, text, Math.random() < 0.5 ? 'civilian' : `goon${Math.floor(rand(0, 9))}`, { gain: 1.3 });
    },
    glass(t, o) {
      const s = slice('glassMedium');
      if (s) return playSlice(ctx, o, t, s, { gain: 0.7, rate: rand(0.9, 1.1) });
      for (let k = 0; k < 6; k++) tone(ctx, o, t + rand(0, 0.3), { type: 'triangle', freq: rand(2500, 6000), d: 0.08, gain: 0.08 });
      return t + 0.5;
    },
    jazzDoor(t, o) {
      // a club door swings open: a few bars of muffled jazz spill out, then it shuts
      const open = slice('doorOpen', 0);
      if (open) playSlice(ctx, o, t, open, { gain: 0.6 });
      const club = gainNode(0, filter(ctx, o, 'lowpass', 1400, 0.7));
      const h = t + 0.3;
      const len = 3.4;
      club.gain.setValueAtTime(0, h);
      club.gain.linearRampToValueAtTime(1, h + 0.25);
      club.gain.setValueAtTime(1, h + len - 0.4);
      club.gain.linearRampToValueAtTime(0, h + len);
      const beat = 60 / 132;
      const walk = [38, 41, 43, 45, 46, 45, 43, 41];
      walk.forEach((m, i) => tone(ctx, club, h + i * beat, { type: 'triangle', freq: mtof(m), d: beat * 0.9, gain: 0.12 }));
      for (let i = 0; i < 8; i++) noise(ctx, club, h + i * beat + (i % 2 ? beat * 0.66 : 0), { type: 'highpass', freq: 6000, d: 0.09, gain: 0.05 });
      [[0, [62, 65, 69, 72]], [beat * 2.5, [60, 64, 67, 70]], [beat * 5, [62, 65, 69, 72]]].forEach(([d, ch]) => ch.forEach((m) => tone(ctx, club, h + d, { type: 'triangle', freq: mtof(m), d: 0.35, gain: 0.03 })));
      const close = slice('doorClose', 0);
      if (close) playSlice(ctx, o, h + len, close, { gain: 0.6 });
      return h + len + 0.8;
    },
    foghorn(t, o) {
      const g = gainNode(0, filter(ctx, o, 'lowpass', 420, 1));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.4);
      g.gain.setValueAtTime(0.12, t + 2.2);
      g.gain.linearRampToValueAtTime(0, t + 3.4);
      for (const f of [82, 123.5]) { const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f; osc.connect(g); osc.start(t); osc.stop(t + 3.5); }
      return t + 3.5;
    },
    bellBuoy(t, o) {
      const s = slice('bell', 0);
      for (let i = 0; i < 2; i++) {
        const at = t + i * rand(0.6, 1.1);
        if (s) playSlice(ctx, o, at, slice('bell'), { gain: 0.35, rate: rand(0.55, 0.65) });
        else bell(ctx, o, at, 76, { gain: 0.08, d: 2.2, ratio: 2.76, index: 1.6 });
      }
      return t + 3;
    },
    creak(t, o) {
      const s = slice('creak', Math.floor(rand(0, 3)));
      return s ? playSlice(ctx, o, t, s, { gain: 0.5, rate: rand(0.7, 0.9) }) : t;
    },
    clank(t, o) {
      metal(ctx, o, t, { base: rand(180, 320), ratios: [1, 1.63, 2.7, 3.9], d: 0.6, gain: 0.12 });
      const s = slice('tin');
      if (s) playSlice(ctx, o, t, s, { gain: 0.4, rate: rand(0.5, 0.7) });
      return t + 0.7;
    },
    steam(t, o) { return noise(ctx, o, t, { type: 'highpass', freq: 2200, a: 0.05, hold: 0.8, d: 0.6, gain: 0.09 }); },
    elTrain(t, o) {
      // the El going by overhead: rumble swell, wheel clatter, a squeal on the curve
      const dur = 7;
      const g = gainNode(0, o);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + dur * 0.45);
      g.gain.linearRampToValueAtTime(0, t + dur);
      const rumble = gainNode(1, g);
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer(ctx); ns.loop = true;
      ns.connect(filter(ctx, rumble, 'lowpass', 180, 0.8));
      const clack = gainNode(0.4, g);
      const cn = ctx.createBufferSource(); cn.buffer = noiseBuffer(ctx); cn.loop = true;
      cn.connect(filter(ctx, clack, 'bandpass', 700, 1.2));
      clack.gain.setValueAtTime(0, t);
      for (let x = 0; x < dur; x += 0.42) {
        clack.gain.setValueAtTime(0.5, t + x); clack.gain.setTargetAtTime(0, t + x, 0.025);
        clack.gain.setValueAtTime(0.4, t + x + 0.11); clack.gain.setTargetAtTime(0, t + x + 0.11, 0.025);
      }
      ns.start(t, Math.random()); ns.stop(t + dur); cn.start(t, Math.random()); cn.stop(t + dur);
      if (Math.random() < 0.7) tone(ctx, g, t + dur * 0.35, { freq: 2650, to: 2500, a: 0.3, hold: 1.2, d: 0.6, gain: 0.025 });
      return t + dur;
    },
    owl(t, o) {
      [0, 0.45, 0.75].forEach((d, i) => tone(ctx, o, t + d, { freq: i === 0 ? 400 : 370, to: i === 0 ? 380 : 340, a: 0.04, hold: i === 0 ? 0.2 : 0.12, d: 0.15, gain: 0.07 }));
      return t + 1.2;
    },
    calliope(t, o) {
      const tune = [72, 76, 79, 76, 77, 74, 71, 72];
      tune.forEach((m, i) => organ(ctx, o, t + i * 0.22, m, 0.18, { gain: 0.03 }));
      return t + 2;
    },
    bridgeBell(t, o) {
      for (let i = 0; i < 6; i++) bell(ctx, o, t + i * 0.42, 91, { gain: 0.05, d: 0.35, ratio: 2.01, index: 0.6 });
      return t + 2.8;
    },
  };

  function playEvent(kind, t, distance = 40, azimuth = 0) {
    const fn = EVENTS[kind];
    if (!fn) return 0;
    return fn(t, eventOut(t, distance, azimuth), distance, azimuth);
  }

  function drip(t) {
    const f = rand(1200, 2600);
    const g = gainNode(rand(0.15, 0.35) * rainLevel);
    let dest = out;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.8, 0.8);
      p.connect(out);
      dest = p;
    }
    g.connect(dest);
    tone(ctx, g, t, { freq: f, to: f * 0.45, glide: 0.035, d: 0.05, gain: 1 });
  }

  return {
    // Old API, kept: the rain bed on its own (sound.js used to set 0.8 at start).
    setRain(x, time = 0.6) {
      rainLevel = Math.min(1, Math.max(0, Number(x) || 0));
      const v = Math.max(rainLevel, mix?.levels.rain ?? 0);
      setLayer('rain', v, time);
    },
    // The player's own traversal wind. mode: 'glide' | 'dive' | 'grapple' | 'zip'.
    setGlide(x, time = 0.3, mode = 'glide') {
      glideLevel = Math.min(1, Math.max(0, Number(x) || 0));
      if (!glide && glideLevel > 0) glide = buildWind(out);
      if (!glide) return;
      const now = ctx.currentTime;
      const k = time / 3;
      const dive = mode === 'dive' ? 1 : 0;
      const zip = mode === 'zip' ? 1 : 0;
      glide.g.gain.setTargetAtTime(glideLevel * (0.35 + 0.1 * dive), now, k);
      glide.bp.frequency.setTargetAtTime((350 + 1300 * glideLevel) * (1 + 0.5 * dive + 0.3 * zip), now, k);
      glide.whistle.gain.setTargetAtTime(glideLevel * glideLevel * (0.25 + 0.2 * dive + 0.15 * zip), now, k);
      glide.hp.frequency.setTargetAtTime((1800 + 1600 * glideLevel) * (1 + 0.4 * dive), now, k);
    },
    setEngine(kind, level = 1, speedFrac = 0, opts = {}) { vehicles.setEngine(kind, level, speedFrac, opts); },
    setSkid: (x) => vehicles.setSkid(x),
    passBy: (opts = {}, t = ctx.currentTime + 0.02) => vehicles.passBy(t, opts),
    // The environment object (see cityAmbience.js). Cheap to call every frame: it only
    // reschedules params when something audible changed.
    setEnvironment(next = {}, time = 2) {
      const n = next && typeof next === 'object' ? next : {};
      let changed = !bedOn;
      for (const k of Object.keys(DEFAULT_ENV)) {
        const v = n[k] ?? DEFAULT_ENV[k];
        const old = env[k];
        if (typeof v === 'number' && typeof old === 'number' ? Math.abs(v - old) > (k === 'timeOfDay' ? 0.25 : k === 'altitude' ? 2 : 0.02) : v !== old) { changed = true; env[k] = v; }
      }
      bedOn = true;
      if (changed) applyEnv(time);
    },
    get environment() { return env; },
    get levels() { return mix?.levels ?? null; },
    // Lab / self-check: play one bed layer alone at `level` (0..1), whatever the environment says.
    soloLayer(name, level = 1) { if (BUILD[name]) setLayer(name, level, 0.01); },
    setMaxLayers(n) { maxLayers = Math.max(1, n | 0); if (bedOn) applyEnv(0.5); },
    playEvent,
    EVENT_KINDS: Object.keys(EVENTS),
    // Thunder `distance` metres away: farther = later (sound travels 343 m/s, capped), darker
    // and quieter. Returns the delay used.
    thunderDelay(distance) { return Math.min(6, Math.max(0, (Number(distance) || 0) / 343)); },
    // Schedules drips, traffic pass-bys and one-shot events up to `until` (AudioContext time).
    tick(until) {
      const now = ctx.currentTime;
      if (rainLevel > 0.02 || (mix?.levels.rain ?? 0) > 0.02) {
        if (nextDrip < now) nextDrip = now + rand(0.05, 0.4);
        const r = Math.max(rainLevel, mix?.levels.rain ?? 0);
        while (nextDrip < until) { drip(nextDrip); nextDrip += rand(0.08, 0.9) / (0.3 + r); }
      } else nextDrip = 0;
      if (!bedOn || !mix) return;
      const traffic = mix.levels.traffic;
      if (traffic > 0.05) {
        if (nextPass < now) nextPass = now + rand(1, 6) / traffic;
        while (nextPass < until) {
          const truck = rng() < 0.15;
          vehicles.passBy(nextPass, { kind: truck ? 'truck' : 'car', speed: rand(9, 20), closest: rand(6, 28), side: rng() < 0.5 ? -1 : 1, gain: traffic * (env.indoors ? 0.25 : 1) });
          nextPass += rand(1.5, 9) / Math.max(0.15, traffic);
        }
      }
      if (!nextEvent) nextEvent = now + Math.max(3, nextAmbientEvent(mix, rng).delay);
      else if (nextEvent < until) {
        const ev = nextAmbientEvent(mix, rng);
        const done = ev.kind ? playEvent(ev.kind, Math.max(now, nextEvent), ev.distance, ev.azimuth) : now;
        nextEvent = Math.max(done + 1, now + Math.max(2, ev.delay));
      }
    },
  };
}
