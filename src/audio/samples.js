import { SAMPLE_MANIFEST } from './sampleManifest.js';

// Lazy sample banks: the CC0 layers that sit on top of the synth (impacts, body falls, blades,
// footsteps, glass, doors). Nothing is fetched until a bank is first asked for, which only
// happens after the audio context exists (a user gesture). Until a bank has decoded, get()
// returns null and every recipe plays its synth layers alone, so a slow or failed download is
// never audible as a missing sound, only as a thinner one.

export const SAMPLE_BANKS = Object.keys(SAMPLE_MANIFEST);

// Opus in WebM where the browser says it can, MP3 otherwise (Safari before 17.5).
export function pickFormat(canPlay = defaultCanPlay) {
  try { return canPlay('audio/webm; codecs="opus"') ? 'webm' : 'mp3'; } catch { return 'mp3'; }
}

function defaultCanPlay(type) {
  if (typeof document === 'undefined') return '';
  const a = document.createElement('audio');
  return a.canPlayType ? a.canPlayType(type) : '';
}

// Which bank a sample group lives in (first match).
const GROUP_BANK = {};
for (const [bank, def] of Object.entries(SAMPLE_MANIFEST)) {
  for (const g of Object.keys(def.items)) if (!(g in GROUP_BANK)) GROUP_BANK[g] = bank;
}
export const groupBank = (group) => GROUP_BANK[group] ?? null;
export const groupSize = (group) => SAMPLE_MANIFEST[GROUP_BANK[group]]?.items[group]?.length ?? 0;

export function createSampleBanks(ctx, { base = './assets/audio/', enabled = true, fetcher = globalThis.fetch } = {}) {
  const buffers = new Map(); // bank -> AudioBuffer
  const pending = new Map(); // bank -> Promise
  const failed = new Set();
  let format = null;

  function load(bank) {
    if (!enabled || !SAMPLE_MANIFEST[bank] || buffers.has(bank) || failed.has(bank)) return pending.get(bank) ?? Promise.resolve(buffers.get(bank) ?? null);
    if (pending.has(bank)) return pending.get(bank);
    if (!format) format = pickFormat();
    const p = Promise.resolve()
      .then(() => fetcher(`${base}${bank}.${format}`))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((data) => new Promise((res, rej) => {
        // callback form as well as the promise form: older Safari only has the callback
        const out = ctx.decodeAudioData(data, res, rej);
        if (out && out.then) out.then(res, rej);
      }))
      .then((buf) => { buffers.set(bank, buf); pending.delete(bank); return buf; })
      .catch(() => { failed.add(bank); pending.delete(bank); return null; });
    pending.set(bank, p);
    return p;
  }

  return {
    load,
    loaded: (bank) => buffers.has(bank),
    // Inject an already-decoded buffer (the offline self-check decodes once and shares it).
    put(bank, buf) { if (buf) buffers.set(bank, buf); },
    get buffers() { return buffers; },
    // { buffer, offset, dur } for variant `i` of a group, or null while its bank is not ready.
    // Asking for a group starts its bank loading.
    get(group, i = 0) {
      const bank = GROUP_BANK[group];
      if (!bank) return null;
      const buf = buffers.get(bank);
      if (!buf) { load(bank); return null; }
      const list = SAMPLE_MANIFEST[bank].items[group];
      const [offset, dur] = list[((i % list.length) + list.length) % list.length];
      return { buffer: buf, offset, dur };
    },
  };
}

// Plays one sample slice into `out` at time t. rate also shifts pitch (it is a tape-speed
// change, which is what makes 5 punch recordings sound like 20). Returns the end time or 0.
export function playSlice(ctx, out, t, slice, { gain = 1, rate = 1, lowpass = 0, highpass = 0, maxDur = 0 } = {}) {
  if (!slice) return 0;
  const src = ctx.createBufferSource();
  src.buffer = slice.buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  let head = g;
  if (lowpass > 0) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; f.connect(head); head = f; }
  if (highpass > 0) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = highpass; f.connect(head); head = f; }
  g.connect(out);
  src.connect(head);
  const dur = maxDur > 0 ? Math.min(slice.dur, maxDur) : slice.dur;
  if (maxDur > 0 && maxDur < slice.dur) {
    // short fade so a truncated tail does not click
    g.gain.setValueAtTime(gain, t + dur / rate - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur / rate);
  }
  src.start(t, slice.offset, dur);
  return t + dur / rate + 0.01;
}
