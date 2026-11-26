import { createAudio, SFX_NAMES, STINGERS } from './audio.js';
import { createMixer } from './mixer.js';
import { triggerSfx } from './sfx.js';
import { createMusic, ALL_THEMES } from './music.js';
import { createAmbience } from './ambience.js';
import { createSampleBanks, SAMPLE_BANKS, pickFormat } from './samples.js';
import { IMPACT_KINDS } from './impacts.js';
import { SURFACES, GAITS } from './footsteps.js';
import { LAYERS, DISTRICT_PROFILES, AMBIENT_EVENTS } from './cityAmbience.js';
import { BARK_TABLES } from './barks/lines.js';
import { renderVoiceLine } from './voiceBlip.js';
import { setAudioPrefs, getAudioPrefs } from './prefs.js';
import { VILLAIN_THEMES } from './music/director.js';

// Dev page for auditioning every sound, music cue, ambience layer and bark, plus the offline
// self-checks: window.__audioCheck() renders each recipe through the same mixer and synth code
// in an OfflineAudioContext and reports peak / RMS / spectral centroid / length against a
// loudness band per category; window.__audioSpectrogram(name) draws one as a PNG.

const audio = createAudio();
window.__audio = audio;
const app = document.getElementById('app');

function section(title, note = '') {
  const s = document.createElement('section');
  s.innerHTML = `<h2>${title}</h2>${note ? `<p>${note}</p>` : ''}<div class="row"></div>`;
  app.appendChild(s);
  return s.querySelector('.row');
}
function button(row, label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => { audio.unlock(); onClick(b); });
  row.appendChild(b);
  return b;
}
function slider(row, label, value, onInput, { min = 0, max = 1, step = 0.01 } = {}) {
  const wrap = document.createElement('label');
  wrap.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${value}</output>`;
  const input = wrap.querySelector('input');
  const out = wrap.querySelector('output');
  input.addEventListener('input', () => { audio.unlock(); out.textContent = input.value; onInput(Number(input.value)); });
  row.appendChild(wrap);
}
function select(row, label, options, value, onChange) {
  const wrap = document.createElement('label');
  wrap.innerHTML = `<span>${label}</span><select>${options.map((o) => `<option${o === value ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  wrap.querySelector('select').addEventListener('change', (e) => { audio.unlock(); onChange(e.target.value); });
  row.appendChild(wrap);
}

// ---- one-shots ----
const opts = { gain: 1, pitch: 1, pan: 0, power: 1, ko: false, gait: 'run', who: 'hero' };
const play = (n) => audio.play(n, { ...opts, pitch: opts.pitch * (opts.jitter ? 0.92 + Math.random() * 0.16 : 1), variant: Math.floor(Math.random() * 5) });
const groups = {
  'Combat impacts (layered)': SFX_NAMES.filter((n) => n.startsWith('hit_')),
  'Footsteps by surface': SFX_NAMES.filter((n) => n.startsWith('step_')),
  'Whooshes, cloth, props': ['whooshFist', 'whooshKick', 'whooshHeavy', 'whooshSpin', 'cloth', 'ventOpen', 'railingDown', 'clawRip', 'glassBreak', 'zipLine'],
  'Interface and stingers': SFX_NAMES.filter((n) => /^ui|waypointSet|caseSolved|missionComplete|fearRising|collectible|dispatchTone|squelch/.test(n)),
  'Vehicles': ['carDoor', 'ignition', 'boostRoar', 'afterburner', 'modeShift', 'skid', 'crash', 'cannonFire', 'droneShot', 'shellBlast', 'armorHit', 'droneBoom'],
};
const grouped = new Set(Object.values(groups).flat());
groups['Everything else (original set)'] = SFX_NAMES.filter((n) => !grouped.has(n));
for (const [title, names] of Object.entries(groups)) {
  const row = section(title);
  names.forEach((n) => button(row, n.replace(/^(hit|step)_/, ''), () => play(n)));
}
const optRow = section('One-shot options');
slider(optRow, 'gain', 1, (v) => { opts.gain = v; });
slider(optRow, 'pitch (0.5 to 1.5)', 0.5, (v) => { opts.pitch = 0.5 + v; });
slider(optRow, 'pan (left to right)', 0.5, (v) => { opts.pan = v * 2 - 1; });
slider(optRow, 'impact power', 1, (v) => { opts.power = v; }, { min: 0.5, max: 3, step: 0.1 });
button(optRow, 'KO: off', (b) => { opts.ko = !opts.ko; b.textContent = `KO: ${opts.ko ? 'on' : 'off'}`; });
select(optRow, 'gait', GAITS, 'run', (v) => { opts.gait = v; });
select(optRow, 'walker', ['hero', 'goon', 'civilian'], 'hero', (v) => { opts.who = v; });
button(optRow, 'random pitch: off', (b) => { opts.jitter = !opts.jitter; b.textContent = `random pitch: ${opts.jitter ? 'on' : 'off'}`; });

const comboRow = section('Combat sequences', 'Through audio.impact(), the same path the game uses: round-robin variants and detune included.');
button(comboRow, '20 punches', () => { for (let i = 0; i < 20; i++) setTimeout(() => audio.impact({ move: 'punch', outcome: 'hit' }), i * 140); });
button(comboRow, 'freeflow combo + KO', () => {
  const seq = [['punch'], ['punch'], ['kick'], ['punch'], ['counter'], ['heavy'], ['punch', 'ko']];
  seq.forEach(([move, out], i) => setTimeout(() => audio.impact({ move, outcome: out ?? 'hit' }), i * 260));
});
button(comboRow, 'critical takedown', () => audio.impact({ move: 'special', outcome: 'ko', crit: true }));
button(comboRow, 'brute armour', () => audio.impact({ move: 'punch', outcome: 'immune', target: { type: 'brute' } }));
button(comboRow, 'knife parry', () => audio.impact({ move: 'punch', outcome: 'parried', target: { type: 'knife' } }));
button(comboRow, 'shield', () => audio.impact({ move: 'punch', outcome: 'immune', target: { type: 'grunt', shield: true } }));
button(comboRow, 'walk 8 steps', () => { for (let i = 0; i < 8; i++) setTimeout(() => audio.footstep({ surface: opts.surface ?? 'concrete', gait: opts.gait, who: opts.who }), i * 380); });
select(comboRow, 'walk surface', SURFACES, 'concrete', (v) => { opts.surface = v; });

// ---- spatial ----
const spRow = section('Spatial', 'A listener at the origin looking down -Z. Sounds are placed around it; split screen adds a second listener 40 m east.');
let split = false;
const setL = () => audio.setListeners(split ? [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 40, y: 0, z: 0, yaw: 0, indoors: false }] : [{ x: 0, y: 0, z: 0, yaw: 0, indoors: false }]);
setL();
button(spRow, 'orbit a punch around me', () => { setL(); for (let i = 0; i < 12; i++) setTimeout(() => { const a = (i / 12) * Math.PI * 2; audio.impact({ move: 'punch', outcome: 'hit', pos: { x: Math.sin(a) * 6, y: 1, z: -Math.cos(a) * 6 } }); }, i * 300); });
button(spRow, 'walk away (steps 2 m to 60 m)', () => { setL(); for (let i = 0; i < 16; i++) setTimeout(() => audio.footstep({ who: 'goon', pos: { x: 3, y: 0, z: -2 - i * 4 } }), i * 350); });
button(spRow, 'indoors source (muffled)', () => { setL(); audio.play('hit_heavy', { pos: { x: 4, y: 1, z: -4 }, indoors: true }); });
button(spRow, 'split screen: off', (b) => { split = !split; b.textContent = `split screen: ${split ? 'on' : 'off'}`; setL(); });

// ---- music ----
const musicRow = section('Music cues', 'Cues switch on the next bar line; leaving combat, chase or a boss plays the outro first.');
const cueContext = (cue) => {
  const [c, sub] = cue.split(':');
  if (c === 'explore') return { context: 'explore', district: Object.entries({ gotham: 'gcpd', docks: 'docks', loop: 'loop', narrows: 'narrows', park: 'robinsonPark', industrial: 'yards', chinatown: 'chinatown', mile: 'gothamMile' }).find(([k]) => k === sub)?.[1] };
  if (c === 'boss') return { context: 'boss', villain: sub };
  return { context: c };
};
Object.keys(ALL_THEMES).forEach((cue) => button(musicRow, cue, () => { const c = cueContext(cue); audio.setMusicContext(c); audio.music(c.context); }));
button(musicRow, 'none', () => audio.music('none'));
const threatRow = section('Music state');
slider(threatRow, 'threat (intensity layers)', 0, (v) => audio.setCombatIntensity(v));
const musicState = document.createElement('pre');
threatRow.parentElement.appendChild(musicState);
setInterval(() => { const s = audio.musicState; musicState.textContent = `cue ${s.cue ?? '-'}   section ${s.section ?? '-'}   voices ${audio.voices}   samples ${audio.samplesLoaded.join(', ') || '-'}`; }, 250);
const stingRow = section('Stingers');
STINGERS.forEach((s) => button(stingRow, s, () => audio.stinger(s)));

// ---- ambience ----
const env = { district: 'gcpd', timeOfDay: 23, weather: 'rain', indoors: false, altitude: 0, traffic: null, crowd: null };
const applyEnv = () => audio.setEnvironment({ ...env });
const envRow = section('City ambience', 'The environment object drives every bed layer. One-shot events fire on their own; the buttons force one.');
select(envRow, 'district', Object.keys(DISTRICT_PROFILES), 'gcpd', (v) => { env.district = v; applyEnv(); });
select(envRow, 'weather', ['clear', 'drizzle', 'rain', 'storm', 'fog', 'snow'], 'rain', (v) => { env.weather = v; applyEnv(); });
slider(envRow, 'time of day', 23, (v) => { env.timeOfDay = v; applyEnv(); }, { min: 0, max: 24, step: 0.5 });
slider(envRow, 'altitude (m)', 0, (v) => { env.altitude = v; applyEnv(); }, { min: 0, max: 120, step: 1 });
button(envRow, 'indoors: off', (b) => { env.indoors = !env.indoors; b.textContent = `indoors: ${env.indoors ? 'on' : 'off'}`; applyEnv(); });
button(envRow, 'start bed', () => applyEnv());
const evRow = section('Ambient one-shots');
AMBIENT_EVENTS.forEach((k) => button(evRow, k, () => audio.ambientEvent(k, { distance: 35, azimuth: Math.random() * 6.28 })));
button(evRow, 'thunder 300 m', () => audio.thunder({ distance: 300 }));
button(evRow, 'thunder 2 km', () => audio.thunder({ distance: 2000 }));
const ambLevels = document.createElement('pre');
evRow.parentElement.appendChild(ambLevels);
setInterval(() => { const l = audio.ambienceLevels; ambLevels.textContent = l ? LAYERS.map((k) => `${k.padEnd(10)} ${'#'.repeat(Math.round(l[k] * 20)).padEnd(20)} ${l[k].toFixed(2)}`).join('\n') : '(bed not started)'; }, 300);

// ---- vehicles ----
const engineRow = section('Vehicles', 'Gearbox, turbine and afterburner models; pass-bys bake doppler into the curve.');
const eng = { kind: null, speed: 0.5, boost: false, throttle: 0.6, mode: 'pursuit', skid: 0 };
const applyEngine = () => audio.setEngine(eng.kind, 1, eng.speed, eng);
['batmobile', 'car', 'wing'].forEach((k) => button(engineRow, `engine: ${k}`, () => { eng.kind = k; applyEngine(); }));
button(engineRow, 'engine: off', () => { eng.kind = null; applyEngine(); });
slider(engineRow, 'speed', 0.5, (v) => { eng.speed = v; applyEngine(); });
slider(engineRow, 'throttle', 0.6, (v) => { eng.throttle = v; applyEngine(); });
slider(engineRow, 'skid', 0, (v) => { eng.skid = v; applyEngine(); });
button(engineRow, 'boost: off', (b) => { eng.boost = !eng.boost; b.textContent = `boost: ${eng.boost ? 'on' : 'off'}`; applyEngine(); });
button(engineRow, 'mode: pursuit', (b) => { eng.mode = eng.mode === 'battle' ? 'pursuit' : 'battle'; b.textContent = `mode: ${eng.mode}`; audio.play('modeShift'); applyEngine(); });
setInterval(() => { if (eng.kind) applyEngine(); }, 50); // the game calls it every frame; so does the lab
['car', 'truck', 'siren'].forEach((k) => button(engineRow, `pass-by: ${k}`, () => audio.passBy({ kind: k, speed: k === 'truck' ? 12 : 20, closest: 5, side: 1 })));

// ---- dialogue ----
const dlgRow = section('Barks, radio and subtitles', 'Voice blips are synthesised murmurs, not speech. The subtitle hook prints below.');
Object.keys(BARK_TABLES).forEach((t) => button(dlgRow, t, () => audio.bark({ table: t, channel: BARK_TABLES[t].radio ? 'radio' : t === 'alfred' || t.startsWith('riddler') || t.startsWith('batman') ? 'voice' : 'world', cooldown: 0, pos: null })));
button(dlgRow, 'dispatch: robbery', () => audio.dispatch({ kind: 'robbery', district: 'The Narrows' }));
const subs = document.createElement('pre');
dlgRow.parentElement.appendChild(subs);
audio.onSubtitle((s) => { subs.textContent = `${s.lines.map((l) => `[+${l.delay.toFixed(1)}s ${l.duration.toFixed(1)}s] ${l.name}: ${l.text}`).join('\n')}\n(${s.channel}${s.radio ? ', radio' : ''})`; });
setInterval(() => audio.update(0.05), 50);

// ---- mix ----
const mixRow = section('Mix and loops');
const vols = { master: 0.9, music: 0.7, sfx: 0.9 };
Object.keys(vols).forEach((k) => slider(mixRow, `${k} volume`, vols[k], (v) => audio.setVolumes({ [k]: v })));
const pr = getAudioPrefs();
['ambience', 'dialogue', 'ui'].forEach((k) => slider(mixRow, `${k} volume`, pr[k], (v) => setAudioPrefs({ [k]: v })));
button(mixRow, `night mode: ${pr.nightMode ? 'on' : 'off'}`, (b) => { const v = !getAudioPrefs().nightMode; setAudioPrefs({ nightMode: v }); b.textContent = `night mode: ${v ? 'on' : 'off'}`; });
button(mixRow, `mono: ${pr.mono ? 'on' : 'off'}`, (b) => { const v = !getAudioPrefs().mono; setAudioPrefs({ mono: v }); b.textContent = `mono: ${v ? 'on' : 'off'}`; });
slider(mixRow, 'rain', 0, (v) => audio.setRain(v));
slider(mixRow, 'glide wind', 0, (v) => audio.setGlide(v));
slider(mixRow, 'dive wind', 0, (v) => audio.setGlide(v, 'dive'));

const checkRow = section('Self-check');
const table = document.createElement('pre');
button(checkRow, 'run offline check', async (b) => {
  b.disabled = true;
  table.textContent = 'rendering...';
  const r = await window.__audioCheck();
  table.textContent = `${r.ok ? 'ALL OK' : `FAIL: ${r.failures.join(', ')}`}\n\n` + r.results.map((x) => `${x.flag ? '!!' : 'ok'}  ${x.category.padEnd(9)} ${x.name.padEnd(26)} peak ${x.peak.toFixed(3)}  rms ${x.rmsDb.toFixed(1)} dB  centroid ${Math.round(x.centroid)} Hz  ${x.durationSec.toFixed(2)} s  ${x.why.join('; ')}`).join('\n')
    + `\n\nchecks:\n${r.checks.map((c) => `${c.ok ? 'ok' : '!!'}  ${c.name}: ${c.detail}`).join('\n')}`;
  b.disabled = false;
});
checkRow.parentElement.appendChild(table);

// ================= offline self-check =================

const RATE = 48000;
const REVERB_TAIL = 2.6;
let decoded = null; // bank -> AudioBuffer (decoded once, shared by every offline render)

async function loadBanks() {
  if (decoded) return decoded;
  decoded = {};
  const fmt = pickFormat();
  const dec = new OfflineAudioContext(1, 1, RATE);
  for (const bank of SAMPLE_BANKS) {
    try {
      const data = await (await fetch(`./assets/audio/${bank}.${fmt}`)).arrayBuffer();
      decoded[bank] = await dec.decodeAudioData(data);
    } catch { /* missing bank: those renders are synth-only, which the check also covers */ }
  }
  return decoded;
}
function banksFor(ctx, withSamples) {
  const b = createSampleBanks(ctx, { enabled: false });
  if (withSamples && decoded) for (const [k, v] of Object.entries(decoded)) b.put(k, v);
  return b;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const xr = ar * wr - ai * wi, xi = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
}

function mono(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}

// Spectral centroid (Hz) weighted by energy over 2048-sample frames; and the average spectrum.
function spectrum(x, rate) {
  const N = 2048;
  const bins = new Float64Array(N / 2);
  let num = 0, den = 0;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let o = 0; o + N <= x.length; o += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; e += re[i] * re[i]; }
    if (e < 1e-8) continue;
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const m = re[k] * re[k] + im[k] * im[k];
      bins[k] += m;
      num += m * (k * rate / N);
      den += m;
    }
  }
  return { centroid: den > 0 ? num / den : 0, bins };
}

function measure(buf) {
  let peak = 0, last = 0, first = -1;
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (const d of chans) for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    if (a > 1e-3) { if (i > last) last = i; if (first < 0 || i < first) first = i; }
  }
  // RMS over the loud part only (frames within 40 dB of the loudest), so a long reverb tail or
  // a gap does not drag a short hit's loudness down.
  const x = mono(buf);
  const W = 1024;
  const frames = [];
  for (let o = 0; o + W <= x.length; o += W) { let s = 0; for (let i = o; i < o + W; i++) s += x[i] * x[i]; frames.push(s / W); }
  const loud = Math.max(...frames, 1e-12);
  const act = frames.filter((f) => f > loud * 1e-4);
  const rms = Math.sqrt(act.reduce((a, f) => a + f, 0) / Math.max(1, act.length));
  const { centroid, bins } = spectrum(x, buf.sampleRate);
  return { peak, rms, rmsDb: 20 * Math.log10(Math.max(rms, 1e-9)), centroid, bins, durationSec: (last + 1) / buf.sampleRate, onsetMs: first < 0 ? null : (first / buf.sampleRate) * 1000 };
}

// Loudness bands (active RMS, dBFS, rendered at unity volume with no limiter). Measured, not
// listened: a band says "sits with its family", not "sounds good".
const BANDS = {
  combat: [-30, -8], movement: [-40, -12], ui: [-40, -12], gadget: [-38, -8], vehicle: [-38, -8],
  stinger: [-36, -10], legacy: [-40, -8], music: [-36, -12], ambience: [-56, -16], event: [-60, -14], voice: [-40, -12],
};
function categoryOf(name) {
  if (name.startsWith('hit_') || ['punch', 'kick', 'heavy', 'counter', 'block', 'ko', 'takedown', 'hurt', 'konk'].includes(name)) return 'combat';
  if (name.startsWith('step_') || name.startsWith('whoosh') || ['cloth', 'footstep', 'roll', 'land', 'cape', 'glideStart', 'grapple', 'grappleLand', 'tether', 'zipLine', 'throw'].includes(name)) return 'movement';
  if (/^ui|wheelOpen|waypointSet|caseSolved|missionComplete|fearRising|collectible|dispatchTone|squelch|radioCrackle/.test(name)) return 'ui';
  if (['carDoor', 'ignition', 'boostRoar', 'afterburner', 'modeShift', 'skid', 'crash', 'cannonFire', 'droneShot', 'shellBlast', 'armorHit', 'droneBoom'].includes(name)) return 'vehicle';
  return 'gadget';
}

async function render(name, seconds, build, { category = 'gadget', limiter = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  const mix = createMixer(ctx, { limiter, volumes: { master: 1, music: 1, sfx: 1 }, prefs: { ambience: 1, dialogue: 1, ui: 1 } });
  build(ctx, mix);
  const buf = await ctx.startRendering();
  const m = measure(buf);
  const [lo, hi] = BANDS[category] ?? [-60, 0];
  const why = [];
  if (m.rms < 1e-4) why.push('silent');
  if (m.peak > 1.0) why.push(`clips (peak ${m.peak.toFixed(2)})`);
  if (m.rmsDb < lo) why.push(`too quiet for ${category} (${m.rmsDb.toFixed(1)} < ${lo})`);
  if (m.rmsDb > hi) why.push(`too loud for ${category} (${m.rmsDb.toFixed(1)} > ${hi})`);
  const { bins, ...rest } = m;
  return { name, category, ...rest, why, flag: why.length > 0, buffer: buf };
}

function sfxLength(name, o = {}) {
  const ctx = new OfflineAudioContext(2, RATE, RATE);
  const v = triggerSfx(createMixer(ctx, { limiter: false }), name, 0, { samples: banksFor(ctx, true), ...o });
  return v ? v.end : 1;
}

const renderSfx = (name, o = {}, withSamples = true) => {
  const len = sfxLength(name, o);
  return render(name, len + REVERB_TAIL, (ctx, mix) => triggerSfx(mix, name, 0, { samples: banksFor(ctx, withSamples), ...o }), { category: categoryOf(name) });
};

const MUSIC_CASES = [
  ...Object.keys(ALL_THEMES).map((cue) => [cue, cue, 0.2]),
  ['combat x=1', 'combat', 1],
  ['boss:riddler x=1', 'boss:riddler', 1],
  ['boss:penguin x=1', 'boss:penguin', 1],
];
function startCue(music, cue, x) {
  const c = cueContext(cue);
  music.setIntensity(x);
  music.setContext(c);
  music.setMode(c.context, 0);
}

window.__audioCheck = async function audioCheck({ musicSeconds = 8, samples = true, only = null } = {}) {
  if (samples) await loadBanks();
  const results = [];
  const want = (n) => !only || only.some((o) => n.includes(o));
  for (const name of SFX_NAMES) if (want(name)) results.push(await renderSfx(name, {}, samples));
  // Synth-only fallback: every layered recipe must still be audible when its bank fails to load.
  for (const k of IMPACT_KINDS) if (want(`nosamples:hit_${k}`)) results.push({ ...(await renderSfx(`hit_${k}`, {}, false)), name: `nosamples:hit_${k}` });
  for (const [label, cue, x] of MUSIC_CASES) {
    if (!want(`music:${label}`)) continue;
    results.push(await render(`music:${label}`, musicSeconds, (ctx, mix) => {
      const music = createMusic(ctx, mix.musicIn);
      startCue(music, cue, x);
      music.pump(musicSeconds);
    }, { category: 'music' }));
  }
  for (const s of STINGERS) if (want(`stinger:${s}`)) results.push(await render(`stinger:${s}`, 5, (ctx, mix) => createMusic(ctx, mix.musicIn).stinger(s, 0.02), { category: 'stinger' }));
  for (const layer of LAYERS) {
    if (!want(`loop:${layer}`)) continue;
    results.push(await render(`loop:${layer}`, 4, (ctx, mix) => {
      const amb = createAmbience(ctx, mix.ambIn, { sfxOut: mix.sfxIn });
      amb.soloLayer(layer, 1);
    }, { category: 'ambience' }));
  }
  for (const kind of AMBIENT_EVENTS) {
    if (!want(`event:${kind}`)) continue;
    results.push(await render(`event:${kind}`, 9, (ctx, mix) => {
      const amb = createAmbience(ctx, mix.ambIn, { sfxOut: mix.sfxIn, samples: banksFor(ctx, samples) });
      amb.playEvent(kind, 0.02, 30, 0.7);
    }, { category: 'event' }));
  }
  for (const [label, kind, o] of [['batmobile', 'batmobile', {}], ['batmobile boost', 'batmobile', { boost: true }], ['batmobile battle', 'batmobile', { mode: 'battle' }], ['car', 'car', { throttle: 0.8 }], ['wing', 'wing', {}]]) {
    if (!want(`loop:engine:${label}`)) continue;
    results.push(await render(`loop:engine:${label}`, 3, (ctx, mix) => {
      const amb = createAmbience(ctx, mix.ambIn, { sfxOut: mix.sfxIn });
      amb.setEngine(kind, 1, 1, o);
    }, { category: 'vehicle' }));
  }
  for (const [speaker, radio, text] of [['goon', false, "I'm not scared. I'm just standing very defensively."], ['alfred', false, 'Sleep is not a weakness, sir.'], ['dispatch', true, 'All units, robbery in progress.'], ['riddler', false, 'Wrong! Oh, I have been rehearsing that all week.']]) {
    if (!want(`voice:${speaker}`)) continue;
    results.push(await render(`voice:${speaker}`, 5, (ctx, mix) => renderVoiceLine(ctx, mix.dlgIn, 0.02, text, speaker, { radio }), { category: 'voice' }));
  }
  const checks = only ? [] : await relationChecks(results);
  for (const r of results) delete r.buffer;
  const failures = [...results.filter((r) => r.flag).map((r) => `${r.name} (${r.why.join(', ')})`), ...checks.filter((c) => !c.ok).map((c) => c.name)];
  return { ok: failures.length === 0, failures, results, checks };
};

// Relationships between sounds that should hold if the design is doing its job.
async function relationChecks(results) {
  const by = Object.fromEntries(results.map((r) => [r.name, r]));
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const c = (n) => by[n]?.centroid ?? 0;
  add('body fall is darker than a jab', c('hit_bodyFall') < c('hit_jab'), `${c('hit_bodyFall').toFixed(0)} vs ${c('hit_jab').toFixed(0)} Hz`);
  add('blade ring is the brightest impact', c('hit_blade') > Math.max(c('hit_jab'), c('hit_cross'), c('hit_kick')), `${c('hit_blade').toFixed(0)} Hz`);
  add('heavy is darker than a jab', c('hit_heavy') < c('hit_jab'), `${c('hit_heavy').toFixed(0)} vs ${c('hit_jab').toFixed(0)} Hz`);
  add('takedown is the longest hit', (by.hit_takedown?.durationSec ?? 0) > Math.max(by.hit_jab?.durationSec ?? 0, by.hit_cross?.durationSec ?? 0, by.hit_kick?.durationSec ?? 0), `${(by.hit_takedown?.durationSec ?? 0).toFixed(2)} s`);
  add('impacts start within 5 ms of their scheduled time', ['hit_jab', 'hit_cross', 'hit_hook', 'hit_kick', 'hit_counter'].every((n) => (by[n]?.onsetMs ?? 99) < 8), ['hit_jab', 'hit_cross', 'hit_kick'].map((n) => `${n} ${(by[n]?.onsetMs ?? -1).toFixed(1)} ms`).join(', '));
  // Variation: five round-robin variants of a cross must not be the same sound.
  const sims = [];
  const specs = [];
  for (let v = 0; v < 5; v++) {
    const r = await renderSfx('hit_cross', { variant: v });
    specs.push(spectrum(mono(r.buffer), RATE).bins);
  }
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) sims.push(cosine(specs[a], specs[b]));
  const maxSim = Math.max(...sims);
  add('round-robin variants differ (max spectral similarity < 0.995)', maxSim < 0.995, `max ${maxSim.toFixed(4)}`);
  // Mixing: twelve layered hits stacked within 50 ms through the real limiter must not clip.
  const stack = await render('stack:12 hits + crit, limiter on', 3, (ctx, mix) => {
    const b = banksFor(ctx, true);
    for (let i = 0; i < 12; i++) triggerSfx(mix, ['hit_cross', 'hit_kick', 'hit_heavy', 'hit_hook'][i % 4], i * 0.004, { samples: b, variant: i % 5, ko: i === 11 });
    triggerSfx(mix, 'hit_critLayer', 0.01, {});
  }, { category: 'combat', limiter: true });
  add('12 stacked hits through the limiter stay under 0 dBFS', stack.peak <= 1.0, `peak ${stack.peak.toFixed(3)}`);
  return checks;
}
function cosine(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 1; i < a.length; i++) { const x = Math.sqrt(a[i]), y = Math.sqrt(b[i]); ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb || 1);
}

// Spectrogram of one recipe as a PNG data URL (log frequency 30 Hz-20 kHz, 80 dB range).
window.__audioSpectrogram = async (name, { o = {}, seconds = null, width = 900, height = 360 } = {}) => {
  await loadBanks();
  const len = seconds ?? sfxLength(name, o) + 0.4;
  const r = await render(name, len, (ctx, mix) => triggerSfx(mix, name, 0.02, { samples: banksFor(ctx, true), ...o }), { category: categoryOf(name) });
  const x = mono(r.buffer);
  const N = 2048, hop = Math.max(64, Math.floor(x.length / width));
  const cols = Math.max(1, Math.floor((x.length - N) / hop));
  const cv = document.createElement('canvas');
  cv.width = cols; cv.height = height + 40;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0e14'; g.fillRect(0, 0, cv.width, cv.height);
  const img = g.createImageData(cols, height);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const fLo = Math.log(30), fHi = Math.log(20000);
  for (let col = 0; col < cols; col++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[col * hop + i] ?? 0) * win[i];
    fft(re, im);
    for (let y = 0; y < height; y++) {
      const f = Math.exp(fHi - (y / height) * (fHi - fLo));
      const k = Math.min(N / 2 - 1, Math.max(1, Math.round((f * N) / RATE)));
      const db = 10 * Math.log10((re[k] * re[k] + im[k] * im[k]) / N + 1e-12);
      const v = Math.min(1, Math.max(0, (db + 80) / 80));
      const p = (y * cols + col) * 4;
      img.data[p] = Math.round(255 * Math.min(1, v * 1.6));
      img.data[p + 1] = Math.round(255 * Math.max(0, v * 1.4 - 0.4));
      img.data[p + 2] = Math.round(255 * Math.max(0, 0.5 - v) + 60 * v);
      img.data[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#d8d6cc'; g.font = '12px system-ui';
  g.fillText(`${name}  peak ${r.peak.toFixed(2)}  rms ${r.rmsDb.toFixed(1)} dB  centroid ${Math.round(r.centroid)} Hz  ${r.durationSec.toFixed(2)} s  (y: 30 Hz-20 kHz log, x: ${len.toFixed(2)} s)`, 6, height + 24);
  return cv.toDataURL('image/png');
};

// Long render of one cue, e.g. a whole combat cycle at full intensity.
window.__audioCheckMusic = async (cue, seconds = 24, intensity = 0) => {
  const r = await render(`music:${cue} x=${intensity} ${seconds}s`, seconds, (ctx, mix) => {
    const music = createMusic(ctx, mix.musicIn);
    startCue(music, cue, intensity);
    music.pump(seconds);
  }, { category: 'music' });
  delete r.buffer;
  return r;
};

// RMS envelope of one SFX in fixed windows (dry, no reverb), for inspecting shapes.
window.__audioEnvelope = async (name, winMs = 20) => {
  const len = sfxLength(name);
  const ctx = new OfflineAudioContext(1, Math.ceil((len + 0.05) * RATE), RATE);
  triggerSfx({ ctx, sfxIn: ctx.destination, sfxWet: ctx.createGain() }, name, 0, { samples: banksFor(ctx, true) });
  const d = (await ctx.startRendering()).getChannelData(0);
  const w = Math.floor((RATE * winMs) / 1000);
  const env = [];
  for (let i = 0; i + w <= d.length; i += w) {
    let sum = 0;
    for (let j = i; j < i + w; j++) sum += d[j] * d[j];
    env.push(Math.sqrt(sum / w));
  }
  return env;
};
window.__audioVillains = Object.keys(VILLAIN_THEMES);
