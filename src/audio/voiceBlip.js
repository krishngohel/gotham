import { noiseBuffer, filter, drive } from './synth.js';

// "Voice blips": a text-only line rendered as a murmur of syllables, so a bark feels spoken
// without any recorded voice. Deliberately not speech and not an imitation of anyone: a buzzy
// source through two moving vowel formants, one syllable per vowel group of the text, with
// pauses at punctuation and a pitch that falls through a statement and lifts at a question.
//
// Cheap on purpose: one oscillator, one noise source and a handful of filters per line, all
// driven by automation, however long the line is.

export const VOICE_PROFILES = {
  goon: { pitch: 112, formant: 1, rate: 5.6, wave: 'sawtooth', gain: 0.32, rough: 0.35 },
  henchman: { pitch: 100, formant: 0.95, rate: 5.2, wave: 'sawtooth', gain: 0.32, rough: 0.4 },
  civilian: { pitch: 175, formant: 1.12, rate: 6, wave: 'triangle', gain: 0.45, rough: 0.15 },
  batman: { pitch: 82, formant: 0.86, rate: 4.2, wave: 'sawtooth', gain: 0.34, rough: 0.5 },
  alfred: { pitch: 124, formant: 1.02, rate: 4.6, wave: 'triangle', gain: 0.45, rough: 0.1 },
  riddler: { pitch: 150, formant: 1.08, rate: 6.6, wave: 'sawtooth', gain: 0.3, rough: 0.12 },
  nightwing: { pitch: 132, formant: 1.04, rate: 6.2, wave: 'sawtooth', gain: 0.3, rough: 0.15 },
  robin: { pitch: 178, formant: 1.14, rate: 6.8, wave: 'triangle', gain: 0.45, rough: 0.1 },
  superman: { pitch: 104, formant: 0.95, rate: 4.8, wave: 'triangle', gain: 0.452, rough: 0.15 },
  penguin: { pitch: 128, formant: 1.2, rate: 5.4, wave: 'square', gain: 0.24, rough: 0.3 },
  dispatch: { pitch: 182, formant: 1.1, rate: 6.2, wave: 'triangle', gain: 0.45, rough: 0.1 },
  officer: { pitch: 118, formant: 1, rate: 5.6, wave: 'sawtooth', gain: 0.3, rough: 0.25 },
  radioHost: { pitch: 120, formant: 1, rate: 5, wave: 'triangle', gain: 0.45, rough: 0.05 },
};

// Same speaker id, same voice; unknown ids get a stable variation of the goon or civilian.
export function voiceFor(speaker) {
  if (VOICE_PROFILES[speaker]) return VOICE_PROFILES[speaker];
  let h = 0;
  const s = String(speaker ?? '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const base = /civ|woman|man|kid/i.test(s) ? VOICE_PROFILES.civilian : VOICE_PROFILES.goon;
  const k = (h % 1000) / 1000;
  return { ...base, pitch: base.pitch * (0.85 + 0.3 * k), formant: base.formant * (0.94 + 0.12 * ((h >> 10) % 100) / 100), rate: base.rate * (0.9 + 0.2 * k) };
}

// Vowel formants (F1, F2) for the syllable colour. Approximate, and that is the point.
const VOWELS = { a: [730, 1090], e: [530, 1840], i: [300, 2200], o: [570, 840], u: [440, 1020], y: [400, 1900] };

// Text -> syllables: [{ at, len, f1, f2, stress, gapAfter }] in seconds from the line start.
// Pure, exported for tests.
export function syllabify(text, rate = 5.5) {
  const out = [];
  const s = String(text ?? '').toLowerCase();
  const re = /([a-z']+)|([,;:])|([.!?…]+)|(\s+)/g;
  let at = 0;
  const syl = 1 / Math.max(2, rate);
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) {
      const groups = m[1].match(/[aeiouy]+/g) || ['a'];
      groups.forEach((g, i) => {
        const v = VOWELS[g[0]] ?? VOWELS.a;
        out.push({ at, len: syl * (i === groups.length - 1 ? 0.95 : 0.8), f1: v[0], f2: v[1], stress: i === 0 ? 1 : 0.75 });
        at += syl;
      });
      at += syl * 0.15;
    } else if (m[2]) at += syl * 1.6;
    else if (m[3]) at += syl * (m[3].includes('…') || m[3].length > 1 ? 4 : 2.6);
  }
  const question = /\?\s*$/.test(s);
  return { syllables: out, length: at, question };
}

// Renders a line into `out` starting at t, lasting about `duration` (stretched to fit the
// subtitle). radio: telephone band, drive and crackle. Returns the end time.
export function renderVoiceLine(ctx, out, t, text, speaker, { duration = 0, radio = false, gain = 1 } = {}) {
  const prof = voiceFor(speaker);
  const { syllables, length, question } = syllabify(text, prof.rate);
  if (!syllables.length) return t;
  const scale = duration > 0 && length > 0 ? Math.min(1.6, Math.max(0.6, duration / length)) : 1;
  const end = t + length * scale + 0.15;

  // chain: source -> F1 / F2 band-passes -> amp -> [radio band + drive] -> out
  const amp = ctx.createGain();
  amp.gain.value = 0; // silent before the first event, whatever the rounding of t
  amp.gain.setValueAtTime(0, t);
  if (radio) {
    const hp = filter(ctx, out, 'highpass', 420, 0.7);
    const lp = filter(ctx, hp, 'lowpass', 2900, 0.9);
    const post = ctx.createGain();
    post.gain.value = 0.7;
    post.connect(lp);
    const d = drive(ctx, post, 3);
    amp.connect(d);
  } else {
    amp.connect(out);
  }
  const f1 = filter(ctx, amp, 'bandpass', 600, 6);
  const f2g = ctx.createGain();
  f2g.gain.value = 0.55;
  f2g.connect(amp);
  const f2 = filter(ctx, f2g, 'bandpass', 1400, 9);

  const osc = ctx.createOscillator();
  osc.type = prof.wave;
  const fs = prof.formant;
  // breath/consonant noise, gated with the syllables
  const nz = ctx.createBufferSource();
  nz.buffer = noiseBuffer(ctx);
  nz.loop = true;
  const ng = ctx.createGain();
  ng.gain.value = 0; // silent before the first event, whatever the rounding of t
  ng.gain.setValueAtTime(0, t);
  const nhp = filter(ctx, ng, 'highpass', 2500, 0.7);
  nhp.connect(amp);
  nz.connect(ng);
  const src = ctx.createGain();
  src.gain.value = 1;
  osc.connect(src);
  src.connect(f1);
  src.connect(f2);
  if (prof.rough > 0) {
    // a little jitter on pitch makes a gravelly voice
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lg = ctx.createGain();
    lg.gain.value = 18 * prof.rough;
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t); lfo.stop(end);
  }

  const n = syllables.length;
  const peak = prof.gain * gain * 2; // formant filters eat most of the source's level
  syllables.forEach((s, i) => {
    const at = t + s.at * scale;
    const len = s.len * scale;
    const x = n > 1 ? i / (n - 1) : 0;
    // declination: a statement falls ~20%; a question lifts at the end
    let f0 = prof.pitch * (1.08 - 0.2 * x) * (0.96 + 0.08 * s.stress);
    if (question && i >= n - 2) f0 *= 1.18 + 0.1 * (i - (n - 2));
    osc.frequency.setValueAtTime(f0 * 1.04, at);
    osc.frequency.exponentialRampToValueAtTime(f0, at + len * 0.6);
    f1.frequency.setValueAtTime(s.f1 * fs, at);
    f2.frequency.setValueAtTime(s.f2 * fs, at);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(peak * s.stress, at + Math.min(0.02, len * 0.25));
    amp.gain.setValueAtTime(peak * s.stress * 0.85, at + len * 0.7);
    amp.gain.linearRampToValueAtTime(0, at + len);
    // a consonant tick at the onset of every other syllable
    if (i % 2 === 0) {
      ng.gain.setValueAtTime(0.25, at);
      ng.gain.linearRampToValueAtTime(0, at + 0.025);
    }
  });
  osc.start(t); osc.stop(end);
  nz.start(t, Math.random() * 1.5); nz.stop(end);

  if (radio) {
    // crackle bed under the whole line, and a squelch tail
    const cg = ctx.createGain();
    cg.gain.value = 0.02;
    cg.connect(out);
    const cn = ctx.createBufferSource();
    cn.buffer = noiseBuffer(ctx);
    cn.loop = true;
    cn.connect(filter(ctx, cg, 'bandpass', 1800, 0.8));
    cn.start(t, Math.random()); cn.stop(end + 0.1);
  }
  return end;
}
