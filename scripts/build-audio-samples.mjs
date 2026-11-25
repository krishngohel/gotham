// Builds the sampled CC0 layers into a few sprite banks (public/assets/audio/*.webm + .mp3) and
// writes their offsets to src/audio/sampleManifest.js.
//
//   node scripts/build-audio-samples.mjs <kenney-impact-sounds dir> <kenney-rpg-audio dir>
//
// Sources (both CC0, see CREDITS.md, verified 2026-11-24):
//   Kenney "Impact Sounds" 1.0  https://kenney.nl/assets/impact-sounds   (unzip, pass the folder holding Audio/)
//   Kenney "RPG Audio"          https://kenney.nl/assets/rpg-audio
// The raw .ogg files are not committed; only the processed sprites are.
//
// Each item is decoded to mono 48 kHz, its leading silence trimmed (so the transient lands on
// the scheduled time), peak-normalised to -1 dBFS, given a 4 ms fade-out, and followed by 120 ms
// of silence so a decoder's padding never bleeds one item into the next. Banks are encoded as
// Opus in WebM (mono, 64 kb/s) with an MP3 fallback for browsers without WebM Opus.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [impactDir, rpgDir] = process.argv.slice(2).map((p) => resolve(p));
if (!impactDir || !rpgDir) {
  console.error('usage: node scripts/build-audio-samples.mjs <impact-sounds dir> <rpg-audio dir>');
  process.exit(1);
}
const RATE = 48000;
const GAP = 0.12;
const OUT_DIR = resolve('public/assets/audio');
const MANIFEST = resolve('src/audio/sampleManifest.js');

const I = (n) => join(impactDir, 'Audio', `${n}.ogg`);
const R = (n) => join(rpgDir, 'Audio', `${n}.ogg`);
const five = (prefix) => [0, 1, 2, 3, 4].map((k) => I(`${prefix}_00${k}`));

// group name -> source files (round-robin variants of one sound)
const BANKS = {
  combat: {
    punchHeavy: five('impactPunch_heavy'),
    punchMedium: five('impactPunch_medium'),
    bodyHeavy: five('impactSoft_heavy'),
    bodyMedium: five('impactSoft_medium'),
    metalHeavy: five('impactMetal_heavy'),
    metalMedium: five('impactMetal_medium'),
    plate: five('impactPlate_medium'),
    blade: [R('knifeSlice'), R('knifeSlice2'), R('drawKnife1'), R('drawKnife2'), R('drawKnife3')],
    cloth: [R('cloth1'), R('cloth2'), R('cloth3'), R('cloth4')],
    wood: five('impactWood_medium'),
  },
  steps: {
    concrete: five('footstep_concrete'),
    wood: five('footstep_wood'),
    carpet: five('footstep_carpet'),
    snow: five('footstep_snow'),
    grass: five('footstep_grass'),
    metal: five('impactMetal_light'),
    glass: five('impactGlass_light'),
  },
  world: {
    glassHeavy: five('impactGlass_heavy'),
    glassMedium: five('impactGlass_medium'),
    tin: five('impactTin_medium'),
    plank: five('impactPlank_medium'),
    rubble: five('impactMining'),
    bell: five('impactBell_heavy').slice(0, 3),
    doorOpen: [R('doorOpen_1'), R('doorOpen_2')],
    doorClose: [R('doorClose_1'), R('doorClose_2'), R('doorClose_3')],
    latch: [R('metalLatch'), R('metalClick')],
    creak: [R('creak1'), R('creak2'), R('creak3')],
  },
};

function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function prepare(x) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const thr = Math.max(1e-4, peak * 0.03); // ~-30 dB under the peak counts as the start
  let start = 0;
  while (start < x.length && Math.abs(x[start]) < thr) start++;
  start = Math.max(0, start - Math.floor(RATE * 0.002)); // keep 2 ms of lead-in
  let end = x.length;
  while (end > start && Math.abs(x[end - 1]) < peak * 0.003) end--;
  const y = x.slice(start, end);
  const k = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.min(y.length, Math.floor(RATE * 0.004));
  for (let i = 0; i < y.length; i++) y[i] *= k;
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  return y;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = {};
let total = 0;
for (const [bank, groups] of Object.entries(BANKS)) {
  const parts = [];
  const items = {};
  let at = 0;
  const gap = new Float32Array(Math.floor(RATE * GAP));
  parts.push(gap); at += gap.length; // leading gap: decoder priming never eats the first item
  for (const [group, files] of Object.entries(groups)) {
    items[group] = files.map((f) => {
      const y = prepare(decode(f));
      const entry = [+(at / RATE).toFixed(5), +(y.length / RATE).toFixed(5)];
      parts.push(y, gap);
      at += y.length + gap.length;
      return entry;
    });
  }
  const all = new Float32Array(at);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const tmp = join(OUT_DIR, `${bank}.tmp.wav`);
  writeFileSync(tmp, wav(all));
  const webm = join(OUT_DIR, `${bank}.webm`);
  const mp3 = join(OUT_DIR, `${bank}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-application', 'audio', webm]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '80k', '-ac', '1', mp3]);
  execFileSync(process.platform === 'win32' ? 'cmd' : 'rm', process.platform === 'win32' ? ['/c', 'del', tmp] : [tmp]);
  const size = statSync(webm).size + statSync(mp3).size;
  total += size;
  manifest[bank] = { seconds: +(at / RATE).toFixed(3), items };
  console.log(`${bank}: ${Object.keys(items).length} groups, ${(at / RATE).toFixed(1)} s, webm ${(statSync(webm).size / 1024).toFixed(0)} KB, mp3 ${(statSync(mp3).size / 1024).toFixed(0)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);

writeFileSync(MANIFEST, `// Generated by scripts/build-audio-samples.mjs. Do not edit by hand.
// bank -> group -> [[offsetSeconds, durationSeconds], ...] inside public/assets/audio/<bank>.webm
// Every item is CC0 (Kenney Impact Sounds 1.0 and Kenney RPG Audio, see CREDITS.md).
export const SAMPLE_MANIFEST = ${JSON.stringify(manifest)};
`);
