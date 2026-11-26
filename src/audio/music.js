import { strings, brass, drum, snare, cymbal, bell, organ, pad, pluck, bass, epiano, hat, kickDrum, tick, anvil, mtof } from './synth.js';
import { THEMES, barSeconds } from './music/themes.js';
import { createMusicDirector, layerOn, contextOf } from './music/director.js';

// Adaptive, sectioned music. The director (music/director.js) picks the cue and the section at
// each bar line; the themes (music/themes.js) say what each section plays; this file owns time:
// a lookahead scheduler that walks each playing cue step by step, crossfades cues on bar lines
// and keeps the oscillator budget.
//
// Old API kept for game.js / sound.js / the lab: MUSIC_MODES, STINGERS, createMusic(ctx, out)
// with setMode(mode, fade), pump(until), stinger(name, t), setIntensity(x), dispose().
// New: setContext({ context, district, villain, threat }), mode/cue/section getters.

export const MUSIC_MODES = ['title', 'explore', 'combat', 'boss', 'finale', 'stealth', 'chase', 'manor', 'cave'];
export const STINGERS = ['districtClear', 'death', 'bossPhase', 'objective', 'missionComplete', 'bossIntro'];

const COST = { strings: 2, brass: 2, drum: 3, snare: 2, cymbal: 2, bell: 2, organ: 3, pad: 4, pluck: 1, bass: 2, epiano: 3, hat: 1, kickDrum: 2, tick: 2, anvil: 4 };
const INSTRUMENTS = { strings, brass, drum, snare, cymbal, bell, organ, pad, pluck, bass, epiano, hat, kickDrum, tick, anvil };

const triad = (root, minor) => [root, root + (minor ? 3 : 4), root + 7];

// ---- title: slow drone and a haunting four-note motif (kept from the original score) ----
function titleStep(m, i, t, sd) {
  const chords = [[38, true], [34, false], [31, true], [33, false]]; // Dm Bb Gm A
  const motif = [[62, 2], [69, 2], [68, 2], [65, 6]]; // D A Ab F: the bat motif
  const answer = [[50, 2], [53, 2], [52, 2], [45, 6]];
  const s = i % 64;
  if (s % 16 === 0) {
    const [root, minor] = chords[s / 16];
    [root, root + 7, root + (minor ? 15 : 16)].forEach((n) => m.pad(t, n + 12, 16 * sd, { gain: 0.016, cutoff: 520, a: 1.4, r: 1.6, wobble: 0.1 }));
    if (s === 0) m.drum(t, { freq: mtof(38), d: 1.6, gain: 0.3, skin: 0.05, skinFreq: 300 });
  }
  let x = 0;
  for (const [n, len] of motif) {
    if (s === 4 + x) {
      m.bell(t, n + 12, { gain: 0.05, d: 2.2, ratio: 3.01, index: 1.4 });
      m.strings(t, n, len * sd, { gain: 0.03, cutoff: 1800, a: 0.12, r: 0.8, voices: 2 });
    }
    x += len;
  }
  x = 0;
  for (const [n, len] of answer) {
    if (s === 36 + x) m.brass(t, n, len * sd, { gain: 0.035, a: 0.25, r: 0.8, bright: 0.2 });
    x += len;
  }
  if (s === 48 || s === 56) m.drum(t, { freq: mtof(38), d: 1.2, gain: 0.18, skin: 0.03, skinFreq: 300 });
  if (s === 16) m.strings(t, 74, 14 * sd, { gain: 0.01, cutoff: 3000, a: 2, r: 2, voices: 1, type: 'triangle' });
}

// ---- finale: dawn over Gotham, eight bars at 72 bpm (kept from the original score) ----
const PROGRESSION = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'];
const CHORDS = {
  Dm: { tones: [62, 65, 69], bass: 38 }, Bb: { tones: [58, 62, 65], bass: 34 }, F: { tones: [65, 69, 72], bass: 41 },
  C: { tones: [60, 64, 67], bass: 36 }, Gm: { tones: [55, 58, 62], bass: 43 }, A: { tones: [57, 61, 64], bass: 33 },
};
const THEME = [[74, 6], [72, 2], [69, 8], [70, 6], [72, 2], [74, 8], [77, 8], [76, 4], [74, 4], [72, 12], [67, 4],
  [74, 6], [72, 2], [69, 4], [72, 4], [70, 6], [74, 2], [77, 8], [79, 6], [77, 2], [74, 4], [70, 4], [69, 8], [73, 4], [76, 4]];
const FIN_NOTES = new Map();
{ let x = 0; for (const [n, l] of THEME) { FIN_NOTES.set(x, [n, l]); x += l; } }
function finaleStep(m, i, t, sd) {
  const isIntro = i < 64;
  const s = isIntro ? i : (i - 64) % 128;
  const pass = isIntro ? -1 : Math.floor((i - 64) / 128);
  const chord = CHORDS[PROGRESSION[Math.floor(s / 16)]];
  const b = s % 16;
  if (b === 0) {
    chord.tones.forEach((n) => m.pad(t, n - 12, 16 * sd, { gain: isIntro ? 0.014 : 0.012, cutoff: 1400, a: 0.4, r: 0.8 }));
    if (isIntro) m.brass(t, chord.bass + 12, 16 * sd, { gain: 0.03, a: 0.3, r: 0.5, bright: 0.25 });
  }
  if (b === 0 || b === 8) m.bass(t, chord.bass, 0.6, { gain: 0.05, cutoff: 300 });
  const note = FIN_NOTES.get(s);
  if (note) {
    const [n, len] = note;
    const dur = len * sd;
    if (isIntro) {
      m.bell(t, n + 12, { gain: 0.09, d: Math.max(0.9, dur * 1.6), ratio: 3.5, index: 1.6 });
      m.strings(t, n, dur * 0.95, { gain: 0.03, cutoff: 2600, a: 0.03, r: 0.25 });
    } else if (pass % 2 === 0) m.strings(t, n, dur * 0.95, { gain: 0.03, cutoff: 2400, a: 0.06, r: 0.3 });
    else m.brass(t, n, dur * 0.9, { gain: 0.022, a: 0.05, r: 0.3, bright: 0.4 });
  }
  if (isIntro) {
    if (s === 0) m.cymbal(t, { gain: 0.05, a: 0.6, d: 1.6 });
    if (s === 56) {
      m.drum(t, { freq: mtof(38), d: 1.4, gain: 0.3, skin: 0.05 });
      m.cymbal(t, { gain: 0.05, d: 2.2 });
      [62, 65, 69].forEach((n) => m.brass(t, n, 1.6, { gain: 0.03, a: 0.08, r: 0.6, bright: 0.6 }));
    }
    return;
  }
  if (b % 2 === 0) { const k = b / 2; m.bell(t, chord.tones[k % 3] + 12 * Math.floor(k / 3), { gain: 0.026, d: 0.8, ratio: 3.5, index: 1.1 }); }
  if (Math.random() < 0.05) m.bell(t, 86 + chord.tones[Math.floor(Math.random() * 3)] % 12, { gain: 0.012, d: 0.6, ratio: 2, index: 1 });
}

// Legacy patterns as themes: one long section; the step function sees the global step index.
const LEGACY = {
  title: { bpm: 56 * 2 / 4, beats: 4, sub: 4, legacy: titleStep, sections: { A: { bars: 4 } }, order: ['A'] }, // eighths at 56 bpm
  finale: { bpm: 72, beats: 4, sub: 4, legacy: finaleStep, sections: { A: { bars: 8 } }, order: ['A'] },
};
export const ALL_THEMES = { ...THEMES, ...LEGACY };

// Short musical hits, scheduled straight into the output with the layers ducked.
const STING = {
  districtClear(m, t) {
    for (let k = 0; k < 7; k++) m.drum(t + k * 0.07, { freq: mtof(38), d: 0.3, gain: 0.08 + k * 0.03, skin: 0.05 });
    [46, 50, 53].forEach((n) => m.brass(t, n, 0.28, { gain: 0.04, a: 0.03, r: 0.1 }));
    const h = t + 0.5;
    [50, 54, 57, 62].forEach((n) => m.brass(h, n, 1.2, { gain: 0.045, a: 0.04, r: 0.7, bright: 1 }));
    [66, 69, 74].forEach((n) => m.strings(h, n, 1.2, { gain: 0.025, cutoff: 3000, a: 0.08, r: 0.7 }));
    m.drum(h, { freq: mtof(38), d: 1.2, gain: 0.35 });
    m.cymbal(h, { gain: 0.07, d: 2 });
    m.bell(h, 86, { gain: 0.05, d: 1.6 });
    return 2.4;
  },
  death(m, t) {
    [50, 53, 57].forEach((n) => m.brass(t, n, 0.55, { gain: 0.045, a: 0.03, r: 0.3, bright: 0.6 }));
    m.drum(t, { freq: mtof(38), d: 1, gain: 0.35 });
    const h = t + 0.6;
    [44, 49, 52].forEach((n) => m.brass(h, n, 1.4, { gain: 0.04, a: 0.1, r: 1, bright: 0.3 }));
    m.strings(h, 26, 1.6, { gain: 0.06, cutoff: 300, a: 0.05, r: 1 });
    m.drum(h, { freq: mtof(33), d: 1.6, gain: 0.35 });
    return 3;
  },
  bossPhase(m, t) {
    [0, 0.15, 0.3].forEach((d, k) => m.drum(t + d, { freq: 55 + k * 10, d: 0.5, gain: 0.3, skin: 0.2 }));
    [48, 49, 55, 60].forEach((n) => m.brass(t + 0.3, n, 0.8, { gain: 0.035, a: 0.5, r: 0.3, bright: 1 }));
    for (let k = 0; k < 10; k++) m.organ(t + 0.3 + k * 0.045, 72 + k, 0.05, { gain: 0.03 });
    m.cymbal(t + 1.1, { gain: 0.07, d: 1.2 });
    m.drum(t + 1.1, { freq: 50, d: 0.8, gain: 0.35 });
    return 2.2;
  },
  objective(m, t) {
    m.brass(t, 57, 0.13, { gain: 0.045, a: 0.02, r: 0.08 });
    m.brass(t + 0.15, 62, 0.6, { gain: 0.05, a: 0.03, r: 0.4 });
    m.brass(t + 0.15, 57, 0.6, { gain: 0.03, a: 0.03, r: 0.4 });
    m.bell(t + 0.15, 86, { gain: 0.05, d: 1 });
    m.drum(t + 0.15, { freq: mtof(38), d: 0.6, gain: 0.2 });
    return 1.3;
  },
  missionComplete(m, t) {
    [0, 0.1, 0.2].forEach((d) => m.drum(t + d, { freq: mtof(38), d: 0.3, gain: 0.15, skin: 0.05 }));
    const h = t + 0.35;
    [50, 57, 62, 66, 69].forEach((n) => m.brass(h, n, 1.6, { gain: 0.04, a: 0.05, r: 1, bright: 0.9 }));
    [74, 78, 81].forEach((n) => m.strings(h, n, 1.6, { gain: 0.022, cutoff: 3200, a: 0.1, r: 1 }));
    m.cymbal(h, { gain: 0.07, d: 2.4 });
    m.drum(h, { freq: mtof(38), d: 1.4, gain: 0.34 });
    m.bell(h + 0.2, 90, { gain: 0.05, d: 1.8 });
    return 3;
  },
  bossIntro(m, t) {
    m.pad(t, 38, 1.4, { gain: 0.02, cutoff: 400, a: 1.2, r: 0.2 });
    m.cymbal(t, { gain: 0.05, a: 1.3, d: 0.2 });
    const h = t + 1.4;
    m.drum(h, { freq: 45, d: 1.6, gain: 0.38 });
    triad(50, true).forEach((n) => m.brass(h, n, 1.1, { gain: 0.04, a: 0.02, r: 0.9, bright: 1 }));
    m.brass(h, 51, 1.1, { gain: 0.025, a: 0.02, r: 0.9, bright: 1 }); // the sour half-step
    return 3.2;
  },
};

// Stereo chorus on the music bus: two short delay lines wobbling slowly, one per ear.
function createChorus(ctx, out) {
  const input = ctx.createGain();
  input.connect(out);
  if (!ctx.createChannelMerger) return input;
  const merger = ctx.createChannelMerger(2);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  merger.connect(wet);
  wet.connect(out);
  [[0.012, 0.31], [0.017, 0.43]].forEach(([base, rate], ch) => {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 0.0025;
    lfo.connect(depth);
    depth.connect(d.delayTime);
    lfo.start();
    input.connect(d);
    d.connect(merger, 0, ch);
  });
  return input;
}

export function createMusic(ctx, out, { voiceCap = 72, chorus = true } = {}) {
  const duck = ctx.createGain();
  duck.connect(out);
  const bus = chorus ? createChorus(ctx, duck) : duck;
  const director = createMusicDirector();
  const players = [];
  let current = null;
  let mode = 'none';
  let context = { context: 'none', district: null, villain: null };
  let ends = [];
  let cap = voiceCap;

  // Instrument wrappers that respect the voice budget and route into a layer.
  function voices(dest) {
    const api = {};
    for (const [name, fn] of Object.entries(INSTRUMENTS)) {
      api[name] = (t, ...args) => {
        if (ends.length > 8) ends = ends.filter((e) => e.end > t);
        let used = 0;
        for (const e of ends) used += e.cost;
        if (used + COST[name] > cap) return;
        const end = fn(ctx, dest, t, ...args);
        ends.push({ end, cost: COST[name] });
      };
    }
    Object.defineProperty(api, 'intensity', { get: () => director.threat });
    return api;
  }

  function makePlayer(cue, at, fadeIn) {
    const theme = ALL_THEMES[cue];
    if (!theme) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent before the first event, whatever the rounding of t
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + Math.max(0.01, fadeIn));
    gain.connect(bus);
    const sd = 60 / theme.bpm / theme.sub;
    const p = {
      cue, theme, gain, m: voices(gain), sd, steps: theme.beats * theme.sub, barDur: barSeconds(theme),
      next: at, i: 0, section: director.section, bar: director.sectionBar, fresh: true, stopAt: 0,
      layers: (theme.parts ?? []).map((part) => (part.min ?? 0) <= director.threat), threat: director.threat,
    };
    players.push(p);
    return p;
  }

  function fadeOut(p, at, len) {
    if (!p || p.stopAt) return;
    const g = p.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.setValueAtTime(1, at);
    g.linearRampToValueAtTime(0, at + Math.max(0.01, len));
    p.stopAt = at + len;
  }

  // At a bar line of the current cue (or right away when nothing plays): ask the director.
  function barLine(t, immediate = false) {
    const r = immediate ? director.jump(ALL_THEMES) : director.onBar(ALL_THEMES);
    if (r.action === 'continue' || r.action === 'outro') {
      if (current) { current.section = r.section; current.bar = r.sectionBar; }
      return;
    }
    const old = current;
    current = null;
    if (old) fadeOut(old, t, immediate ? 1.2 : Math.min(2.5, old.barDur));
    if (r.action === 'start' && r.cue) {
      current = makePlayer(r.cue, t, immediate ? 1.2 : old ? 0.15 : 0.8);
      if (current) { current.section = r.section; current.bar = r.sectionBar; }
    }
  }

  function updateLayers(p) {
    // threat follows the director, smoothed per bar so layers move on bar lines
    p.threat += (director.threat - p.threat) * 0.6;
    const parts = p.theme.parts ?? [];
    for (let k = 0; k < parts.length; k++) {
      const pt = parts[k];
      let on = layerOn(p.threat, pt.min ?? 0, p.layers[k]);
      if (pt.max !== undefined) on = on && p.threat <= pt.max;
      p.layers[k] = on;
    }
  }

  function playStep(p, t) {
    const th = p.theme;
    const step = p.i % p.steps;
    if (th.legacy) { th.legacy(p.m, p.i, t, p.sd); return; }
    const sec = th.sections[p.section] ?? th.sections[th.order[0]];
    const prog = sec.prog;
    const ch = prog[p.bar % prog.length];
    const nextCh = prog[(p.bar + 1) % prog.length];
    const swing = th.swing && step % 4 === 2 ? th.swing * p.sd : 0;
    const s = { t: t + swing, step, steps: p.steps, sd: p.sd, beat: th.sub, bar: p.bar, section: p.section, chord: ch, next: nextCh, threat: p.threat, pass: 0 };
    const parts = th.parts;
    for (let k = 0; k < parts.length; k++) {
      const pt = parts[k];
      if (pt.in && !pt.in.includes(p.section)) continue;
      if (!p.layers[k]) continue;
      pt.fn(p.m, s);
    }
  }

  function pump(until) {
    const now = ctx.currentTime;
    if (!current && director.wanted !== director.cue) barLine(now + 0.05, true);
    else if (!current && director.wanted && !players.some((p) => !p.stopAt)) barLine(now + 0.05, true);
    for (let k = 0; k < players.length; k++) {
      const p = players[k];
      if (p.stopAt && now > p.stopAt + 3) { p.gain.disconnect(); players.splice(k, 1); k--; continue; }
      if (p.next < now - 0.05) {
        // fell behind (the tab slept): skip forward on the step grid, never burst
        const skip = Math.ceil((now - p.next) / p.sd);
        p.next += skip * p.sd;
        const before = Math.floor(p.i / p.steps);
        p.i += skip;
        if (p === current && !p.theme.legacy) for (let b = before; b < Math.floor(p.i / p.steps); b++) barLine(p.next, false);
      }
      while (p.next < until && !(p.stopAt && p.next >= p.stopAt)) {
        if (p.i % p.steps === 0) {
          if (p === current && !p.fresh) barLine(p.next);
          p.fresh = false;
          updateLayers(p);
        }
        if (!(p.stopAt && p.next >= p.stopAt)) playStep(p, p.next);
        p.next += p.sd;
        p.i++;
      }
    }
  }

  function setContext(c = {}) {
    context = { ...context, ...c };
    director.request(context);
    if (Number.isFinite(c.threat)) director.setThreat(c.threat);
  }

  const MODE_CONTEXT = { title: 'title', explore: 'explore', combat: 'combat', boss: 'boss', finale: 'finale', stealth: 'stealth', chase: 'chase', manor: 'manor', cave: 'cave', none: 'none' };

  // Legacy entry point. fade 0 (the offline check) starts the cue right away instead of on the
  // next bar line.
  function setMode(next, fade = 1.5) {
    if (next === mode) return false;
    mode = next;
    setContext({ context: MODE_CONTEXT[next] ?? 'explore' });
    if (fade === 0) {
      for (const p of players) fadeOut(p, ctx.currentTime, 0.01);
      current = null;
      barLine(ctx.currentTime + 0.02, true);
      if (current) { current.gain.gain.cancelScheduledValues(0); current.gain.gain.setValueAtTime(1, 0); }
    }
    return true;
  }

  const stingVoices = voices(out);
  function stinger(name, t = ctx.currentTime + 0.03) {
    const fn = STING[name];
    if (!fn) return false;
    const len = fn(stingVoices, t);
    const g = duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.45, t + 0.08);
    g.setValueAtTime(0.45, t + len * 0.7);
    g.linearRampToValueAtTime(1, t + len);
    return true;
  }

  return {
    get mode() { return mode; },
    get cue() { return director.cue; },
    get section() { return director.section; },
    get context() { return { ...context }; },
    setMode,
    setContext,
    pump,
    stinger,
    setIntensity(x) { director.setThreat(x); },
    setVoiceCap(n) { cap = Math.max(16, n | 0); },
    dispose() { players.forEach((p) => p.gain.disconnect()); players.length = 0; duck.disconnect(); },
  };
}

export { contextOf };
