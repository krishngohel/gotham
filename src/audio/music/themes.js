import { chord, hit, degree } from './theory.js';
import { mtof } from '../synth.js';

// The score: every cue the director can ask for. A theme is data plus small part functions:
//
//   bpm, beats (per bar), sub (steps per beat)
//   sections: { intro?, A, B?, C?, outro? } each { bars, prog: chord per bar }
//   order: section names to loop after the intro
//   parts: [{ in?: [sections], min?: threat to enter, max?: threat to leave, fn(m, s) }]
//
// Part functions are called on every step with
//   s = { t, step, steps, sd, beat, bar, section, chord, next, threat, pass, swing }
// and schedule notes through `m` (the voice-budgeted instruments of music.js).
// Chords come from theory.js ('Dm' -> { bass, root, tones }).
//
// The whole score is original and synthesised. The themes share one recurring "bat" motif
// (D, A, A-flat, F: a fifth up and a sour half-step back) so districts feel like one city.

const P = (prog) => prog.map(chord);
const sec = (bars, prog) => ({ bars, prog: P(prog.length === bars ? prog : Array.from({ length: bars }, (_, i) => prog[i % prog.length])) });
const BAT = [0, 7, 6, 3]; // the motif as semitones over the tonic

// ---------------- exploration ----------------

const gotham = {
  bpm: 80, beats: 4, sub: 4,
  sections: {
    intro: sec(4, ['Dm', 'Dm', 'Bb', 'A']),
    A: sec(8, ['Dm', 'Bb', 'Gm', 'A']),
    B: sec(8, ['F', 'C', 'Dm', 'Bb', 'Gm', 'Dm', 'A', 'A']),
    C: sec(8, ['Bb', 'Gm', 'Dm', 'A']),
  },
  order: ['A', 'B', 'A', 'C'],
  parts: [
    { fn(m, s) { if (s.step === 0) s.chord.tones.forEach((n) => m.pad(s.t, n, s.steps * s.sd, { gain: 0.016, cutoff: s.section === 'C' ? 700 : 1000, a: 0.9, r: 1.4 })); } },
    { in: ['A', 'B'], fn(m, s) {
      if (s.step % 2) return;
      const k = (s.step / 2) % 8;
      const ost = [0, 0, 12, 0, 7, 0, 12, 7];
      m.strings(s.t, s.chord.bass + 12 + ost[k], 0.13, { gain: k === 0 ? 0.06 : 0.042, cutoff: k === 0 ? 1100 : 800, a: 0.01, r: 0.1 });
    } },
    { in: ['C'], fn(m, s) { if (s.step % 4 === 0) m.bell(s.t, s.chord.tones[(s.step / 4) % s.chord.tones.length] + 12, { gain: 0.03, d: 1.2, ratio: 3.5, index: 1.1 }); } },
    { fn(m, s) {
      if (s.step === 0 && s.section !== 'C') m.drum(s.t, { freq: mtof(38), d: 0.9, gain: 0.26, skin: 0.06, skinFreq: 500 });
      if (s.step === 10 && s.section !== 'intro') m.drum(s.t, { freq: mtof(38), d: 0.6, gain: 0.12, skin: 0.04, skinFreq: 500 });
    } },
    { in: ['B'], fn(m, s) {
      // the bat motif, stated by low brass across two bars, answered by strings
      const at = s.bar % 4;
      if (at === 0 && s.step === 0) BAT.forEach((iv, i) => m.brass(s.t + i * 4 * s.sd, 62 + iv, 3.6 * s.sd, { gain: 0.028, a: 0.08, r: 0.4, bright: 0.35 }));
      if (at === 2 && s.step === 0) BAT.forEach((iv, i) => m.strings(s.t + i * 4 * s.sd, 74 + iv - 12 * (i === 3 ? 0 : 0), 3.8 * s.sd, { gain: 0.02, cutoff: 2400, a: 0.06, r: 0.5 }));
    } },
    { min: 0.4, fn(m, s) { if (s.step === 4 || s.step === 12) m.snare(s.t, { gain: 0.03 + 0.03 * s.threat }); } },
  ],
};

const docks = {
  bpm: 66, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Gm', 'Gm']),
    A: sec(8, ['Gm', 'Eb', 'Cm', 'D']),
    B: sec(8, ['Eb', 'Bb', 'Cm', 'D7']),
  },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (s.step === 0) { m.pad(s.t, s.chord.root, s.steps * s.sd, { gain: 0.02, cutoff: 500, a: 1.2, r: 1.6, wobble: 0.12 }); m.pad(s.t, s.chord.tones[1], s.steps * s.sd, { gain: 0.012, cutoff: 700, a: 1.4, r: 1.6 }); } } },
    { fn(m, s) { if (s.step === 0 || s.step === 8) m.bass(s.t, s.chord.bass, 6 * s.sd, { gain: 0.06, cutoff: 260 }); } },
    { fn(m, s) {
      // a buoy bell: sparse celesta phrases, more of them in B
      const every = s.section === 'B' ? 3 : 6;
      if (s.step % every === 2 && Math.random() < 0.45) m.bell(s.t, s.chord.tones[Math.floor(Math.random() * s.chord.tones.length)] + 12, { gain: 0.028, d: 1.8, ratio: 2.76, index: 1.2 });
    } },
    { in: ['B'], fn(m, s) { if (s.bar === 3 && s.step === 0) m.brass(s.t, s.chord.bass + 12, 8 * s.sd, { gain: 0.03, a: 0.9, r: 1.2, bright: 0.15 }); } },
    { min: 0.4, fn(m, s) { if (s.step % 8 === 0) m.drum(s.t, { freq: 50, d: 0.8, gain: 0.12 + 0.15 * s.threat, skin: 0.03 }); } },
  ],
};

const loop = {
  // art-deco noir: walking bass, brushes, muted brass, a little swing
  bpm: 92, beats: 4, sub: 4, swing: 0.2,
  sections: {
    intro: sec(2, ['Cm7', 'G7']),
    A: sec(8, ['Cm7', 'Fm7', 'Dm7', 'G7', 'Cm7', 'Abmaj7', 'Dm7', 'G7']),
    B: sec(8, ['Ebmaj7', 'Abmaj7', 'Fm7', 'G7', 'Cm7', 'Fm7', 'Ab7', 'G7']),
  },
  order: ['A', 'A', 'B', 'A'],
  parts: [
    { fn(m, s) {
      if (s.step % 4) return;
      const b = s.step / 4;
      const c = s.chord;
      const walk = [c.bass, c.bass + c.ints[1], c.bass + 7, b === 3 ? s.next.bass + (s.next.bass > c.bass ? -1 : 1) : c.bass + 12];
      m.pluck(s.t, walk[b], { gain: 0.13, d: 0.5, bright: 0.3, type: 'triangle' });
      if (b === 0) m.bass(s.t, walk[b], 3 * s.sd, { gain: 0.03, cutoff: 200 });
    } },
    { fn(m, s) { if (s.step % 4 === 0 || s.step % 4 === 3) m.hat(s.t, { gain: s.step % 8 === 4 ? 0.022 : 0.012, open: s.step % 16 === 12 }); } },
    { fn(m, s) {
      // comping: epiano on the "and" of two and on four
      if (s.step === 6 || s.step === 12) s.chord.tones.forEach((n) => m.epiano(s.t, n, 0.35, { gain: 0.03, bright: 0.5 }));
    } },
    { in: ['B'], fn(m, s) {
      const line = [[0, 72, 6], [8, 70, 4], [12, 67, 4]];
      if (s.bar % 2 === 0) for (const [st, n, len] of line) if (s.step === st) m.brass(s.t, n + (s.bar === 6 ? -2 : 0), len * s.sd, { gain: 0.026, a: 0.04, r: 0.25, bright: 0.5 });
    } },
    { min: 0.4, fn(m, s) { if (s.step === 4 || s.step === 12) m.snare(s.t, { gain: 0.025 + 0.03 * s.threat, d: 0.1 }); } },
  ],
};

const narrows = {
  bpm: 76, beats: 4, sub: 4,
  sections: {
    A: sec(8, ['Em', 'Em', 'C', 'B']),
    B: sec(8, ['Am', 'Em', 'F', 'B7']),
  },
  order: ['A', 'B', 'A'],
  parts: [
    { fn(m, s) { m.strings(s.t, s.chord.bass + 12, 0.1, { gain: s.step % 4 === 0 ? 0.04 : 0.022, cutoff: 600, a: 0.008, r: 0.08 }); } },
    { fn(m, s) {
      // minor-second cluster: the root and the note a half-step above, held, very quiet
      if (s.step === 0 && s.bar % 2 === 0) { m.pad(s.t, s.chord.root + 12, s.steps * 2 * s.sd, { gain: 0.012, cutoff: 1300, a: 1.5, r: 1.5 }); m.pad(s.t, s.chord.root + 13, s.steps * 2 * s.sd, { gain: 0.006, cutoff: 1300, a: 2, r: 1.5 }); }
    } },
    { fn(m, s) { if (hit('x..o..x...x.o...', s.step)) m.tick(s.t, { gain: 0.02, freq: 1900 }); } },
    { in: ['B'], fn(m, s) { if (s.bar % 4 === 3 && s.step === 8) m.brass(s.t, s.chord.root + 12, 6 * s.sd, { gain: 0.03, a: 0.02, r: 0.3, bright: 0.8 }); } },
    { min: 0.35, fn(m, s) { if (s.step % 8 === 0) m.drum(s.t, { freq: 52, d: 0.5, gain: 0.15 + 0.12 * s.threat, skin: 0.1 }); } },
  ],
};

const park = {
  bpm: 66, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Fmaj7', 'Fmaj7']),
    A: sec(8, ['Fmaj7', 'G', 'Am7', 'Fmaj7', 'Dm7', 'G', 'C', 'C']),
    B: sec(8, ['Dm7', 'Am7', 'Bbmaj7', 'C', 'Dm7', 'Am7', 'Bbmaj7', 'Csus4']),
  },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (s.step === 0) s.chord.tones.forEach((n) => m.pad(s.t, n, s.steps * s.sd, { gain: 0.012, cutoff: 1400, a: 1, r: 1.6, wobble: 0.18 })); } },
    { fn(m, s) { if (s.step % 2 === 0) { const k = s.step / 2; m.epiano(s.t, s.chord.tones[k % s.chord.tones.length] + 12 * (k >= 4 ? 1 : 0), 0.6, { gain: 0.016, bright: 0.6 }); } } },
    { fn(m, s) { if (s.step === 0) m.bass(s.t, s.chord.bass + 12, 12 * s.sd, { gain: 0.04, cutoff: 300 }); } },
    { in: ['B'], fn(m, s) { if (s.step === 0 && s.bar % 2 === 0) m.bell(s.t, s.chord.tones[2] + 24, { gain: 0.03, d: 2, ratio: 2.01, index: 0.8 }); } },
  ],
};

const industrial = {
  bpm: 96, beats: 4, sub: 4,
  sections: {
    A: sec(8, ['Am', 'Am', 'F', 'E']),
    B: sec(8, ['Dm', 'Am', 'Bb', 'E7']),
  },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (hit('x.......x.......', s.step)) m.kickDrum(s.t, { gain: 0.18, freq: 48 }); } },
    { fn(m, s) { if (hit('....x..o....x.o.', s.step)) m.anvil(s.t, { gain: 0.03, base: s.step === 4 ? 520 : 610 }); } },
    { fn(m, s) { if (s.step % 2 === 0) m.pluck(s.t, s.chord.bass + 12 + (s.step % 8 === 6 ? 7 : 0), { gain: 0.045, d: 0.2, bright: 0.4 }); } },
    { fn(m, s) { if (s.step === 0) m.pad(s.t, s.chord.root, s.steps * s.sd, { gain: 0.016, cutoff: 600, a: 0.6, r: 1 }); } },
    { in: ['B'], min: 0, fn(m, s) { if (s.bar % 2 === 1 && s.step === 0) m.brass(s.t, s.chord.root + 12, 8 * s.sd, { gain: 0.028, a: 0.3, r: 0.5, bright: 0.7 }); } },
  ],
};

const chinatown = {
  bpm: 84, beats: 4, sub: 4,
  sections: {
    A: sec(8, ['Dm', 'Dm', 'C', 'Am']),
    B: sec(8, ['F', 'C', 'Dm', 'Am']),
  },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) {
      // a pentatonic line, two-bar phrase, plucked
      const phrase = [[0, 4], [2, 3], [4, 2], [6, 3], [8, 4], [12, 1], [16, 0], [20, 1], [22, 2], [24, 0]];
      const pos = (s.bar % 2) * 16 + s.step;
      for (const [st, d] of phrase) if (pos === st) m.pluck(s.t, degree(74, 'pentMinor', d + (s.section === 'B' ? 1 : 0)), { gain: 0.05, d: 0.5, bright: 0.8, type: 'square' });
    } },
    { fn(m, s) { if (hit('x..x..x...x.....', s.step)) m.drum(s.t, { freq: 70, d: 0.3, gain: 0.14, skin: 0.12, skinFreq: 1200 }); } },
    { fn(m, s) { if (s.step === 0) m.pad(s.t, s.chord.root + 12, s.steps * s.sd, { gain: 0.014, cutoff: 900, a: 0.8, r: 1.2 }); } },
    { fn(m, s) { if (s.step === 0 || s.step === 8) m.bass(s.t, s.chord.bass, 6 * s.sd, { gain: 0.05, cutoff: 300 }); } },
  ],
};

const mile = {
  bpm: 100, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Bbmaj7', 'Gm7']),
    A: sec(8, ['Bbmaj7', 'Gm7', 'Ebmaj7', 'F7']),
    B: sec(8, ['Cm7', 'F7', 'Dm7', 'Gm7', 'Ebmaj7', 'Cm7', 'F7', 'F7']),
  },
  order: ['A', 'B', 'A'],
  parts: [
    { fn(m, s) { if (s.step === 0 || s.step === 6 || s.step === 10) s.chord.tones.forEach((n) => m.epiano(s.t, n, s.step ? 0.3 : 0.8, { gain: 0.013 })); } },
    { fn(m, s) { if (hit('x.....x...x.....', s.step)) m.bass(s.t, s.chord.bass + (s.step === 10 ? 7 : 0), 3 * s.sd, { gain: 0.05, cutoff: 500 }); } },
    { fn(m, s) { if (s.step % 2 === 0) m.hat(s.t, { gain: s.step % 4 === 2 ? 0.016 : 0.008 }); if (s.step === 4 || s.step === 12) m.snare(s.t, { gain: 0.025, d: 0.08 }); } },
    { in: ['B'], fn(m, s) { if (s.step === 0) m.strings(s.t, s.chord.tones[s.chord.tones.length - 1] + 12, s.steps * s.sd * 0.95, { gain: 0.018, cutoff: 2600, a: 0.3, r: 0.6 }); } },
  ],
};

// ---------------- states ----------------

const stealth = {
  bpm: 70, beats: 4, sub: 4,
  sections: { A: sec(8, ['Dm', 'Dm', 'Bbmaj7', 'A']), B: sec(8, ['Gm', 'Dm', 'Eb', 'A7']) },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (hit('x..x............', s.step)) m.kickDrum(s.t, { gain: s.step ? 0.1 : 0.16, freq: 46, d: 0.25 }); } },
    { fn(m, s) { if (s.step === 0) m.pad(s.t, s.chord.root, s.steps * s.sd, { gain: 0.016, cutoff: 500, a: 1, r: 1.2 }); } },
    { fn(m, s) { if (s.step % 2 === 0) m.strings(s.t, s.chord.tones[2] + 24 + (s.step % 4 ? 1 : 0), 0.08, { gain: 0.006, cutoff: 5000, a: 0.005, r: 0.05 }); } },
    { max: 0.55, fn(m, s) { if (s.step % 4 === 0) m.tick(s.t, { gain: 0.016, freq: 2200 }); } },
    { min: 0.3, fn(m, s) { if (s.step % 2 === 0) m.bass(s.t, s.chord.bass, s.sd, { gain: 0.04 + 0.03 * s.threat, cutoff: 260 }); } },
    { min: 0.6, fn(m, s) { if (s.step === 0 && s.bar % 2 === 1) m.brass(s.t, s.chord.root + 12, s.steps * s.sd, { gain: 0.026, a: 1.2, r: 0.4, bright: 0.6 }); } },
  ],
};

// Combat: intensity layers grow with threat; B is a variation up a minor third; outro resolves.
function battle(m, s, root, minor) {
  const b = s.step;
  const x = s.threat;
  const triad = [root, root + (minor ? 3 : 4), root + 7];
  if (b === 0 || b === 6 || b === 11) m.drum(s.t, { freq: 55, d: 0.45, gain: 0.3, skin: 0.2, skinFreq: 700 });
  if (b === 0) m.bass(s.t, root - 12, 15 * s.sd, { gain: 0.06, cutoff: 220 });
  if (s.bar % 2 === 0 && b === 0) triad.forEach((n) => m.brass(s.t, n + 24, 0.18, { gain: 0.026, a: 0.02, r: 0.15 }));
  if (x > 0.25 && (b === 4 || b === 12)) m.snare(s.t, { gain: 0.04 + 0.06 * x });
  if (x > 0.45) {
    if (b === 8) m.drum(s.t, { freq: mtof(root + 12), d: 0.5, gain: 0.2, skin: 0.1 });
    if (b === 6 || b === 11) triad.forEach((n) => m.brass(s.t, n + 24, 0.12, { gain: 0.02, a: 0.015, r: 0.12 }));
  }
  if (x > 0.65) m.strings(s.t, triad[b % 3] + 36, 0.07, { gain: 0.01 + 0.01 * x, cutoff: 3500, a: 0.005, r: 0.05 });
  if (x > 0.85) {
    if (s.bar % 2 === 0 && b === 0) m.cymbal(s.t, { gain: 0.05, d: 1.4 });
    if (s.bar % 4 === 3 && b >= 12) m.drum(s.t, { freq: 70 + (b - 12) * 12, d: 0.2, gain: 0.18, skin: 0.15 });
    if (b === 0) m.brass(s.t, root + 24, 15 * s.sd, { gain: 0.02, a: 0.3, r: 0.3, bright: 0.6 });
  }
}

const combat = {
  bpm: 130, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Dm', 'A']),
    A: sec(8, ['Dm', 'Dm', 'Bb', 'C']),
    B: sec(8, ['Fm', 'Fm', 'Db', 'Eb']),
    outro: sec(2, ['Dm', 'Dm']),
  },
  order: ['A', 'B', 'A', 'B'],
  parts: [
    { in: ['intro'], fn(m, s) {
      if (s.bar === 0 && s.step === 0) { m.cymbal(s.t, { gain: 0.05, a: 1.2, d: 0.6 }); [50, 57, 62].forEach((n) => m.brass(s.t, n, 1.6, { gain: 0.03, a: 1.1, r: 0.2, bright: 0.8 })); }
      if (s.bar === 1 && s.step % 2 === 0) m.drum(s.t, { freq: 60 + s.step * 4, d: 0.2, gain: 0.08 + s.step * 0.012, skin: 0.15 });
    } },
    { in: ['A', 'B'], fn(m, s) {
      const ost = s.section === 'A' ? [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 7, 0, 12, 10] : [0, 12, 0, 7, 0, 12, 0, 3, 0, 12, 0, 7, 0, 10, 12, 7];
      const acc = s.step % 3 === 0;
      m.strings(s.t, s.chord.root + 12 + ost[s.step], 0.07, { gain: acc ? 0.06 : 0.04, cutoff: acc ? 2200 : 1300, a: 0.004, r: 0.06 });
      battle(m, s, s.chord.root, s.chord.ints[1] === 3);
    } },
    { in: ['B'], min: 0.3, fn(m, s) {
      // the bat motif, brass, over the variation
      if (s.bar % 4 === 0 && s.step === 0) BAT.forEach((iv, i) => m.brass(s.t + i * 4 * s.sd, s.chord.root + 24 + iv, 3.5 * s.sd, { gain: 0.03, a: 0.02, r: 0.2, bright: 0.9 }));
    } },
    { in: ['outro'], fn(m, s) {
      if (s.bar === 0 && s.step === 0) { m.drum(s.t, { freq: mtof(38), d: 1.6, gain: 0.32 }); m.cymbal(s.t, { gain: 0.06, d: 2.4 }); [50, 53, 57, 62].forEach((n) => m.brass(s.t, n, 1.4, { gain: 0.03, a: 0.02, r: 1.2, bright: 0.7 })); }
      if (s.bar === 1 && s.step === 0) m.pad(s.t, 50, 2, { gain: 0.016, cutoff: 600, a: 0.1, r: 1.5 });
    } },
  ],
};

const chase = {
  bpm: 152, beats: 4, sub: 4,
  sections: {
    intro: sec(1, ['Em']),
    A: sec(8, ['Em', 'Em', 'C', 'D']),
    B: sec(8, ['Am', 'Em', 'F', 'B']),
    outro: sec(1, ['Em']),
  },
  order: ['A', 'B'],
  parts: [
    { in: ['A', 'B', 'intro'], fn(m, s) { if (s.step % 4 === 0) m.kickDrum(s.t, { gain: 0.2 }); if (s.step % 2 === 1) m.hat(s.t, { gain: 0.014 }); } },
    { in: ['A', 'B'], fn(m, s) { m.bass(s.t, s.chord.bass + (s.step % 4 === 3 ? 12 : 0), s.sd * 0.8, { gain: 0.05, cutoff: 600 }); } },
    { in: ['A', 'B'], fn(m, s) { if (s.step === 4 || s.step === 12) m.snare(s.t, { gain: 0.06 }); } },
    { in: ['A', 'B'], min: 0.2, fn(m, s) {
      const riff = [[0, 0], [3, 3], [6, 5], [10, 7], [12, 5]];
      if (s.bar % 2 === 0) for (const [st, iv] of riff) if (s.step === st) m.brass(s.t, s.chord.root + 12 + iv, 2.5 * s.sd, { gain: 0.026, a: 0.01, r: 0.1, bright: 1 });
    } },
    { in: ['A', 'B'], min: 0.6, fn(m, s) { m.strings(s.t, s.chord.tones[s.step % 3] + 24, 0.05, { gain: 0.012, cutoff: 4000, a: 0.004, r: 0.04 }); } },
    { in: ['outro'], fn(m, s) { if (s.step === 0) { m.drum(s.t, { freq: 52, d: 1.2, gain: 0.3 }); m.cymbal(s.t, { gain: 0.05, d: 1.8 }); } } },
  ],
};

// ---------------- bosses ----------------

const jokerTune = [67, 66, 67, 75, 74, 73, 74, 72, 70, 69, 70, 67, 68, 67, 66, 67, 68, 67, 68, 72, 75, 74, 72, 71, 74, 72, 71, 69, 67, 66, 67, 71];
const joker = {
  // the circus organ over the battle layers (the original boss loop, now with a B variation)
  bpm: 150, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Cm', 'G']),
    A: sec(8, ['Cm', 'Cm', 'Ab', 'G']),
    B: sec(8, ['Fm', 'Fm', 'Db', 'C']),
    outro: sec(2, ['Cm', 'Cm']),
  },
  order: ['A', 'B', 'A'],
  parts: [
    { in: ['intro'], fn(m, s) { if (s.step % 2 === 0) m.organ(s.t, 72 + ((s.bar * 8 + s.step / 2) % 12), 0.08, { gain: 0.025, vib: 14 }); } },
    { in: ['A', 'B'], fn(m, s) {
      const ost = [0, 1, 0, 12, 0, 1, 0, 7, 0, 1, 0, 12, 11, 12, 7, 6];
      const b = s.step;
      m.strings(s.t, s.chord.root + 12 + ost[b], 0.06, { gain: b % 4 === 0 ? 0.055 : 0.035, cutoff: b % 4 === 0 ? 2400 : 1400, a: 0.004, r: 0.05 });
      if (b === 0 || b === 8) m.organ(s.t, s.chord.root + 12, 0.12, { gain: 0.026 });
      if (b === 4 || b === 12) s.chord.tones.slice(1).forEach((n) => m.organ(s.t, n + 12, 0.1, { gain: 0.016 }));
      if (b % 2 === 0) {
        const i = ((s.bar % 4) * 8 + b / 2) % jokerTune.length;
        m.organ(s.t, jokerTune[i] + (s.section === 'B' ? 5 : 0), s.sd * 1.6, { gain: 0.026, vib: 12 });
      }
      battle(m, s, s.chord.root, s.chord.ints[1] === 3);
    } },
    { in: ['outro'], fn(m, s) {
      if (s.bar === 0 && s.step % 2 === 0 && s.step < 12) m.organ(s.t, 84 - s.step, 0.1, { gain: 0.025, vib: 20 });
      if (s.bar === 1 && s.step === 0) { m.drum(s.t, { freq: 48, d: 1.2, gain: 0.3 }); m.organ(s.t, 48, 1.2, { gain: 0.03, vib: 30 }); }
    } },
  ],
};

const riddler = {
  // a ticking clock under a question that never resolves: C, E-flat, G, then a long A (the
  // sixth, hanging). B turns the question upside down and speeds the clock.
  bpm: 120, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Cm', 'Cm']),
    A: sec(8, ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Dm7', 'G']),
    B: sec(8, ['Ebmaj7', 'Ab', 'Fm', 'G7', 'Cm', 'Db', 'Ab', 'G']),
    outro: sec(2, ['Cm6', 'Cm6']),
  },
  order: ['A', 'B', 'A', 'B'],
  parts: [
    { fn(m, s) { const fast = s.section === 'B' || s.threat > 0.6; if (fast ? s.step % 2 === 0 : s.step % 4 === 0) m.tick(s.t, { gain: (s.step % 8 === 0 ? 0.03 : 0.018), freq: s.step % 8 === 0 ? 2600 : 2000 }); } },
    { in: ['A', 'B'], fn(m, s) {
      // pizzicato ostinato around the chord
      const pat = [0, 2, 1, 2, 0, 2, 1, 3];
      if (s.step % 2 === 0) m.pluck(s.t, s.chord.tones[pat[(s.step / 2) % 8] % s.chord.tones.length], { gain: 0.04, d: 0.25, bright: 0.6 });
    } },
    { in: ['intro', 'A', 'B'], fn(m, s) {
      // the question motif on celesta every two bars
      if (s.bar % 2 !== 0 || s.step !== 0) return;
      const q = s.section === 'B' ? [[0, 79], [2, 75], [4, 72], [6, 69]] : [[0, 72], [2, 75], [4, 79], [6, 81]];
      for (const [b, n] of q) m.bell(s.t + b * 2 * s.sd, n, { gain: b === 6 ? 0.045 : 0.035, d: b === 6 ? 2.2 : 0.8, ratio: 3.5, index: 1.3 });
    } },
    { in: ['A', 'B'], fn(m, s) { if (s.step === 0) m.bass(s.t, s.chord.bass, 14 * s.sd, { gain: 0.06, cutoff: 280 }); } },
    { in: ['A', 'B'], min: 0.3, fn(m, s) { if (s.bar % 2 === 1 && (s.step === 8 || s.step === 11 || s.step === 14)) m.brass(s.t, s.chord.root + 24 + (s.step === 14 ? 2 : 0), 2 * s.sd, { gain: 0.026, a: 0.01, r: 0.12, bright: 0.9 }); } },
    { in: ['A', 'B'], min: 0.5, fn(m, s) { if (s.step === 4 || s.step === 12) m.snare(s.t, { gain: 0.05 }); if (s.step === 0) m.kickDrum(s.t, { gain: 0.16 }); } },
    { in: ['A', 'B'], min: 0.8, fn(m, s) { m.strings(s.t, s.chord.tones[s.step % 3] + 24, 0.06, { gain: 0.01, cutoff: 4000, a: 0.004, r: 0.04 }); } },
    { in: ['outro'], fn(m, s) {
      if (s.bar === 0 && s.step === 0) [72, 75, 79, 81].forEach((n, i) => m.bell(s.t + i * 0.25, n, { gain: 0.04, d: 2.4, ratio: 3.5, index: 1.4 }));
      if (s.bar === 1 && s.step === 0) m.pad(s.t, 48, 2.2, { gain: 0.014, cutoff: 700, a: 0.2, r: 1.5 });
    } },
  ],
};

const penguin = {
  // a sinister waltz: oom-pah-pah tuba and brass, a reedy tune, the strings joining in B
  bpm: 138, beats: 3, sub: 4,
  sections: {
    intro: sec(2, ['Am', 'E7']),
    A: sec(8, ['Am', 'Am', 'Dm', 'Am', 'E7', 'E7', 'Am', 'E7']),
    B: sec(8, ['F', 'C', 'Dm', 'Am', 'Bb', 'Am', 'E7', 'E7']),
    outro: sec(2, ['Am', 'Am']),
  },
  order: ['A', 'B', 'A'],
  parts: [
    { in: ['intro', 'A', 'B'], fn(m, s) {
      if (s.step === 0) m.bass(s.t, s.chord.bass + (s.bar % 2 ? 7 : 0), 3 * s.sd, { gain: 0.08, cutoff: 360, bite: 2 });
      if (s.step === 4 || s.step === 8) s.chord.tones.forEach((n) => m.brass(s.t, n, 0.12, { gain: 0.016, a: 0.01, r: 0.08, bright: 0.4 }));
    } },
    { in: ['A', 'B'], fn(m, s) {
      // the tune: two-bar phrases in A minor, a step higher in B
      const tune = [[0, 2, 8], [8, 3, 2], [10, 4, 2], [12, 6, 6], [18, 4, 2], [20, 3, 4]];
      const pos = (s.bar % 2) * 12 + s.step;
      const lift = s.section === 'B' ? 2 : 0;
      for (const [st, d, len] of tune) if (pos === st) m.organ(s.t, degree(69, 'harmonic', d + lift + (s.bar % 4 >= 2 ? -2 : 0)), len * s.sd * 0.9, { gain: 0.022, vib: 5 });
    } },
    { in: ['B'], fn(m, s) { if (s.step === 0) m.strings(s.t, s.chord.tones[0] + 12, 3 * 4 * s.sd * 0.95, { gain: 0.02, cutoff: 2000, a: 0.15, r: 0.3 }); } },
    { in: ['A', 'B'], min: 0.3, fn(m, s) { if (s.step === 0) m.drum(s.t, { freq: 60, d: 0.4, gain: 0.18, skin: 0.15 }); if (s.step === 8) m.snare(s.t, { gain: 0.035, d: 0.08 }); } },
    { in: ['A', 'B'], min: 0.6, fn(m, s) { if (s.bar % 4 === 0 && s.step === 0) m.cymbal(s.t, { gain: 0.045, d: 1.2 }); if (s.step === 4 || s.step === 8) m.pluck(s.t, s.chord.tones[2] + 12, { gain: 0.025, d: 0.2 }); } },
    { in: ['outro'], fn(m, s) {
      if (s.bar === 0 && s.step === 0) { m.bass(s.t, 33, 1, { gain: 0.08 }); [57, 60, 64].forEach((n) => m.brass(s.t, n, 1, { gain: 0.025, a: 0.02, r: 0.8 })); }
      if (s.bar === 1 && s.step === 0) m.organ(s.t, 57, 1.4, { gain: 0.025, vib: 9 });
    } },
  ],
};

// Generic boss arranger for the villains without a full score yet: a battle bed, the villain's
// own motif on its own instrument, its key and tempo. Each is a hook to be written properly.
function bossTheme({ bpm, prog, progB, motif, voice = 'brass', color = null }) {
  return {
    bpm, beats: 4, sub: 4,
    sections: { intro: sec(1, [prog[0]]), A: sec(8, prog), B: sec(8, progB ?? prog), outro: sec(2, [prog[0], prog[0]]) },
    order: ['A', 'B'],
    parts: [
      { in: ['intro'], fn(m, s) {
        // a one-bar wind-up: swell, a drum run, the villain's root on brass
        if (s.step === 0) { m.cymbal(s.t, { gain: 0.045, a: 1.1, d: 0.4 }); m.brass(s.t, s.chord.root + 12, s.steps * s.sd, { gain: 0.028, a: 1, r: 0.2, bright: 0.8 }); }
        if (s.step >= 8 && s.step % 2 === 0) m.drum(s.t, { freq: 60 + s.step * 3, d: 0.2, gain: 0.06 + s.step * 0.01, skin: 0.15 });
      } },
      { in: ['A', 'B'], fn(m, s) {
        m.strings(s.t, s.chord.root + 12 + (s.step % 4 === 2 ? 7 : s.step % 8 === 6 ? 12 : 0), 0.07, { gain: s.step % 4 === 0 ? 0.05 : 0.032, cutoff: 1600, a: 0.004, r: 0.06 });
        battle(m, s, s.chord.root, s.chord.ints[1] === 3);
      } },
      { in: ['A', 'B'], fn(m, s) {
        if (s.bar % 2 !== 0 || s.step !== 0) return;
        motif.forEach(([b, iv], i) => {
          const n = s.chord.root + 24 + iv + (s.section === 'B' ? 12 : 0);
          const at = s.t + b * s.sd;
          if (voice === 'bell') m.bell(at, n, { gain: 0.035, d: 1, ratio: 3.5, index: 1.2 });
          else if (voice === 'pluck') m.pluck(at, n, { gain: 0.05, d: 0.4 });
          else if (voice === 'organ') m.organ(at, n, 3 * s.sd, { gain: 0.024, vib: 8 });
          else if (voice === 'pad') m.pad(at, n, 4 * s.sd, { gain: 0.02, cutoff: 1800, a: 0.1, r: 0.4 });
          else m.brass(at, n, (i === motif.length - 1 ? 6 : 3) * s.sd, { gain: 0.028, a: 0.02, r: 0.2, bright: 0.8 });
        });
      } },
      ...(color ? [color] : []),
      { in: ['outro'], fn(m, s) { if (s.bar === 0 && s.step === 0) { m.drum(s.t, { freq: 48, d: 1.4, gain: 0.3 }); m.cymbal(s.t, { gain: 0.05, d: 2 }); } } },
    ],
  };
}

const BOSS_HOOKS = {
  // the coin: two motifs, one bright and one sour, alternating
  twoFace: bossTheme({ bpm: 124, prog: ['Em', 'Em', 'C', 'B'], progB: ['Gm', 'Gm', 'Eb', 'D'], motif: [[0, 0], [3, 7], [6, 11], [9, 6]], voice: 'brass' }),
  scarecrow: bossTheme({ bpm: 112, prog: ['Fm', 'Gb', 'Fm', 'C7'], motif: [[0, 0], [2, 1], [4, 0], [6, 6]], voice: 'pad',
    color: { min: 0.3, fn(m, s) { if (s.step % 3 === 0) m.strings(s.t, s.chord.root + 36 + (s.step % 2), 0.06, { gain: 0.008, cutoff: 6000 }); } } }),
  poisonIvy: bossTheme({ bpm: 108, prog: ['Am', 'Fmaj7', 'Dm7', 'E'], motif: [[0, 0], [4, 3], [6, 7], [8, 10]], voice: 'pluck' }),
  mrFreeze: bossTheme({ bpm: 100, prog: ['Bm', 'G', 'Em', 'F#'], motif: [[0, 7], [4, 3], [8, 0], [12, -1]], voice: 'bell' }),
  harley: bossTheme({ bpm: 156, prog: ['Gm', 'Eb', 'Cm', 'D'], motif: [[0, 0], [1, 2], [2, 3], [4, 7], [6, 3]], voice: 'organ' }),
  killerCroc: bossTheme({ bpm: 96, prog: ['Dm', 'Dm', 'Eb', 'Dm'], motif: [[0, 0], [6, 1], [12, 0]], voice: 'brass' }),
  bane: bossTheme({ bpm: 118, prog: ['Cm', 'Cm', 'Ab', 'Bb'], motif: [[0, 0], [4, 0], [8, 3], [12, 2]], voice: 'brass' }),
  madHatter: bossTheme({ bpm: 132, prog: ['Am', 'E7', 'Am', 'E7'], motif: [[0, 0], [2, 4], [4, 7], [6, 11], [8, 12]], voice: 'pluck' }),
};

// ---------------- the double life ----------------

const manor = {
  bpm: 72, beats: 4, sub: 4,
  sections: {
    intro: sec(2, ['Fmaj7', 'Fmaj7']),
    A: sec(8, ['Fmaj7', 'Em7', 'Dm7', 'C', 'Bbmaj7', 'Am7', 'Gm7', 'C']),
    B: sec(8, ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm7', 'Csus4']),
  },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (s.step === 0) { m.epiano(s.t, s.chord.bass + 12, 1.6, { gain: 0.04, bright: 0.4 }); s.chord.tones.forEach((n) => m.epiano(s.t + 0.02, n, 1.4, { gain: 0.022, bright: 0.4 })); } } },
    { fn(m, s) { if (s.step === 8) m.epiano(s.t, s.chord.tones[s.bar % s.chord.tones.length] + 12, 0.9, { gain: 0.014, bright: 0.5 }); } },
    { in: ['A', 'B'], fn(m, s) { if (s.step === 0) m.strings(s.t, s.chord.tones[0], s.steps * s.sd * 0.98, { gain: 0.012, cutoff: 1400, a: 0.8, r: 0.9 }); } },
    { in: ['B'], fn(m, s) {
      // a warm, slower statement of the bat motif in the major: Bruce, not Batman
      if (s.bar % 4 === 0 && s.step === 0) [0, 7, 9, 5].forEach((iv, i) => m.strings(s.t + i * 4 * s.sd, 65 + iv, 3.8 * s.sd, { gain: 0.016, cutoff: 2200, a: 0.2, r: 0.5 }));
    } },
  ],
};

const cave = {
  bpm: 54, beats: 4, sub: 4,
  sections: { A: sec(8, ['Dm', 'Dm', 'Bb', 'A']), B: sec(8, ['Gm', 'Dm', 'Eb', 'A']) },
  order: ['A', 'B'],
  parts: [
    { fn(m, s) { if (s.step === 0 && s.bar % 2 === 0) m.pad(s.t, s.chord.bass + 12, s.steps * 2 * s.sd, { gain: 0.022, cutoff: 360, a: 2, r: 2, wobble: 0.08 }); } },
    { fn(m, s) { if (s.step === 0 && s.bar % 4 === 2) m.bass(s.t, s.chord.bass, 1.5, { gain: 0.05, cutoff: 180 }); } },
    { fn(m, s) { if (s.step % 4 === 1 && Math.random() < 0.12) m.bell(s.t, 86 + Math.floor(Math.random() * 3) * 5, { gain: 0.016, d: 1.2, ratio: 2.76, index: 0.7 }); } },
    { in: ['B'], fn(m, s) { if (s.step === 0 && s.bar === 3) BAT.forEach((iv, i) => m.pad(s.t + i * 6 * s.sd, 50 + iv, 5 * s.sd, { gain: 0.014, cutoff: 900, a: 0.4, r: 0.8 })); } },
  ],
};

export const THEMES = {
  'explore:gotham': gotham,
  'explore:docks': docks,
  'explore:loop': loop,
  'explore:narrows': narrows,
  'explore:park': park,
  'explore:industrial': industrial,
  'explore:chinatown': chinatown,
  'explore:mile': mile,
  stealth,
  combat,
  chase,
  'boss:joker': joker,
  'boss:riddler': riddler,
  'boss:penguin': penguin,
  ...Object.fromEntries(Object.entries(BOSS_HOOKS).map(([k, v]) => [`boss:${k}`, v])),
  manor,
  cave,
};

// Seconds in one bar of a theme.
export const barSeconds = (th) => (60 / th.bpm) * th.beats;
export const stepSeconds = (th) => 60 / th.bpm / th.sub;
// Total length of one pass through intro + order, in seconds.
export function cycleSeconds(th) {
  const bars = (th.sections.intro?.bars ?? 0) + th.order.reduce((a, n) => a + (th.sections[n]?.bars ?? 0), 0);
  return bars * barSeconds(th);
}
