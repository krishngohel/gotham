// Tiny music-theory helpers for the arranger. Pure.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6],
  sus4: [0, 5, 7], sus2: [0, 2, 7], aug: [0, 4, 8], m6: [0, 3, 7, 9], 6: [0, 4, 7, 9], mmaj7: [0, 3, 7, 11], dim7: [0, 3, 6, 9],
};

const cache = new Map();

// 'Dm' -> { name, pc, bass (MIDI, octave 2), root (MIDI, octave 3), tones (MIDI around middle C), ints }
export function chord(name) {
  if (cache.has(name)) return cache.get(name);
  const m = /^([A-G])([b#]?)(.*)$/.exec(String(name));
  if (!m) throw new Error(`bad chord ${name}`);
  const pc = (PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + 12) % 12;
  const ints = QUALITY[m[3]];
  if (!ints) throw new Error(`bad chord quality ${name}`);
  let r4 = 60 + pc;
  if (r4 > 66) r4 -= 12; // keep voicings between F#3 and F#5
  const c = { name, pc, bass: 36 + pc, root: 48 + pc, tones: ints.map((i) => r4 + i), ints };
  cache.set(name, c);
  return c;
}

// Pattern strings: 'x' accent, 'o' soft, '.' rest, repeated to fill the bar.
// Returns 2 for 'x', 1 for 'o', 0 otherwise.
export function hit(pattern, step) {
  const ch = pattern[step % pattern.length];
  return ch === 'x' ? 2 : ch === 'o' ? 1 : 0;
}

// The nth note of a scale (degrees can be negative or above 7). scale: semitone offsets.
export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentMinor: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
export function degree(tonic, scale, n) {
  const s = SCALES[scale] ?? SCALES.minor;
  const oct = Math.floor(n / s.length);
  const i = ((n % s.length) + s.length) % s.length;
  return tonic + oct * 12 + s[i];
}
