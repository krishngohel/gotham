import { describe, it, expect } from 'vitest';
import '../../src/progress/wayneSave.js';
import '../../src/gadgets/gadgetSave.js';
import '../../src/progress/mode.js';
import { sanitizeProgress, saveProgress, loadProgress, DEFAULT_PROGRESS } from '../../src/core/save.js';
import {
  PROGRESS_KEY, SLOT_KEYS, ACTIVE_KEY, getActiveSlot, setActiveSlot, slotStorage, slotSummary, copySlot, deleteSlot, writeSlot,
  exportCode, exportFile, importSave, crc32, isEmptyProgress, formatPlayTime, MAX_IMPORT_BYTES,
} from '../../src/core/slots.js';
import { sanitizeMode, startRunMode, remixWaveInputs, checkpointAllowed, canNgPlus, sanitizeReputation } from '../../src/progress/mode.js';
import { createReputation } from '../../src/enemies/fear.js';

const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const OLD = { step: 12, stepId: 'toNeon', trophies: [1, 4], suit: 'm', seenIntro: true, stats: { playTime: 1800, kos: 40 }, wayne: { xp: 2400, owned: ['plating1', 'kevlar'], medals: {} } };

describe('slots', () => {
  it('slot 1 is the old single save, untouched', () => {
    const st = memory();
    st.setItem(PROGRESS_KEY, JSON.stringify(OLD));
    const before = st.getItem(PROGRESS_KEY);
    expect(getActiveSlot(st)).toBe(1);
    const s1 = slotStorage(st, 1);
    const p = loadProgress(s1);
    expect(p.step).toBe(12);
    expect(p.wayne.owned).toEqual(['plating1', 'kevlar']);
    // Reading it changes nothing on disk.
    expect(st.getItem(PROGRESS_KEY)).toBe(before);
    expect([...st.m.keys()]).toEqual([PROGRESS_KEY]);
  });
  it('slots 2 and 3 write their own keys through the same progress key name', () => {
    const st = memory();
    st.setItem(PROGRESS_KEY, JSON.stringify(OLD));
    let writes = 0;
    const s2 = slotStorage(st, 2, { onWrite: () => { writes += 1; } });
    expect(loadProgress(s2).step).toBe(0);
    saveProgress(s2, { ...sanitizeProgress({}), step: 3 });
    expect(JSON.parse(st.getItem(SLOT_KEYS[2])).step).toBe(3);
    expect(JSON.parse(st.getItem(PROGRESS_KEY)).step).toBe(12);
    expect(writes).toBe(1);
    // Other keys pass straight through (settings stay global).
    s2.setItem('gotham-settings-v1', '{"x":1}');
    expect(st.getItem('gotham-settings-v1')).toBe('{"x":1}');
    expect(writes).toBe(1);
  });
  it('active slot, copy, delete, summaries', () => {
    const st = memory();
    st.setItem(PROGRESS_KEY, JSON.stringify(OLD));
    setActiveSlot(st, 3);
    expect(getActiveSlot(st)).toBe(3);
    setActiveSlot(st, 9);
    expect(getActiveSlot(st)).toBe(1);
    st.setItem(ACTIVE_KEY, 'junk');
    expect(getActiveSlot(st)).toBe(1);
    expect(slotSummary(st, 2).empty).toBe(true);
    expect(copySlot(st, 1, 2)).toBe(true);
    const s = slotSummary(st, 2, { score: () => 17, stepName: (p) => `step ${p.step}` });
    expect(s).toMatchObject({ slot: 2, empty: false, percent: 17, where: 'step 12', level: 3, trophies: 2, playTime: 1800 });
    expect(copySlot(st, 2, 2)).toBe(false);
    expect(deleteSlot(st, 2)).toBe(true);
    expect(slotSummary(st, 2).empty).toBe(true);
    expect(slotSummary(st, 1).empty).toBe(false);
    // A throwing scorer never breaks the title.
    expect(slotSummary(st, 1, { score: () => { throw new Error('x'); } }).percent).toBe(null);
    expect(isEmptyProgress(sanitizeProgress(DEFAULT_PROGRESS))).toBe(true);
    expect(formatPlayTime(3725)).toBe('1 h 02 min');
  });
  it('storage that throws never throws out of slots', () => {
    const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(getActiveSlot(bad)).toBe(1);
    expect(() => setActiveSlot(bad, 2)).not.toThrow();
    expect(slotSummary(bad, 1).empty).toBe(true);
    expect(copySlot(bad, 1, 2)).toBe(false);
    expect(writeSlot(bad, 2, {})).toBe(false);
  });
});

describe('export and import', () => {
  it('code round trip', () => {
    const p = sanitizeProgress(OLD);
    const code = exportCode(p);
    expect(code.startsWith('GOTHAM1.')).toBe(true);
    const r = importSave(code);
    expect(r.ok).toBe(true);
    expect(r.progress).toEqual(p);
  });
  it('file round trip, and the live reputation object exports as data', () => {
    const p = sanitizeProgress(OLD);
    p.reputation = createReputation({ value: 70, gangs: { joker: 80 } });
    const text = exportFile(p, { now: 0 });
    expect(JSON.parse(text).format).toBe('gotham-long-night-save');
    const r = importSave(text);
    expect(r.ok).toBe(true);
    expect(r.progress.reputation).toEqual({ value: 70, gangs: { joker: 80 } });
    expect(r.progress.wayne).toEqual(p.wayne);
  });
  it('rejects damage with a message, never throws', () => {
    const code = exportCode(sanitizeProgress(OLD));
    const [a, b, c] = code.split('.');
    expect(importSave(`${a}.${b}.00000000`).error).toMatch(/checksum/);
    expect(importSave(`${a}.${b.slice(0, -3)}.${c}`).ok).toBe(false);
    expect(importSave(`${a}.${b}`).ok).toBe(false);
    expect(importSave(`${a}.!!!.${c}`).ok).toBe(false);
    expect(importSave('').ok).toBe(false);
    expect(importSave(null).ok).toBe(false);
    expect(importSave('hello').ok).toBe(false);
    expect(importSave('{"format":"gotham-long-night-save","version":9,"progress":{}}').error).toMatch(/newer/);
    expect(importSave('{"format":"other"}').ok).toBe(false);
    expect(importSave('x'.repeat(MAX_IMPORT_BYTES + 1)).error).toMatch(/too big/);
  });
  it('hostile content is sanitised: no prototype pollution, no junk fields, clamped numbers', () => {
    const evil = '{"__proto__":{"polluted":1},"constructor":{"prototype":{"bad":1}},"step":-5,"trophies":[1,1,99,"x"],"wayne":{"xp":1e99,"owned":["plating1","__proto__"]},"stats":{"playTime":"lots"},"mode":{"ngPlus":1e9,"difficulty":"godmode"},"reputation":{"value":1e9,"gangs":{"__proto__":5,"a b":3}},"extra":"<script>"}';
    const json = evil;
    const code = `GOTHAM1.${Buffer.from(json).toString('base64url')}.${crc32(json)}`;
    const r = importSave(code);
    expect(r.ok).toBe(true);
    expect({}.polluted).toBeUndefined();
    expect({}.bad).toBeUndefined();
    expect(r.progress.step).toBe(0);
    expect(r.progress.trophies).toEqual([1]);
    expect(r.progress.wayne.xp).toBe(1e7); // the old sanitiser's cap
    expect(r.progress).not.toHaveProperty('extra');
    expect(r.progress.mode).toMatchObject({ ngPlus: 99, difficulty: null }); // clamped
    expect(r.progress.reputation).toEqual({ value: 100, gangs: {} });
  });
  it('fuzz: random bytes, mutated codes and random JSON never throw and always sanitise', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const good = exportCode(sanitizeProgress(OLD));
    const values = [null, true, 0, -1, 1e308, 'x', [], {}, [1, 'a', null], { a: { b: [] } }, NaN];
    const keys = ['step', 'trophies', 'wayne', 'gadgets', 'mode', 'skills', 'reputation', 'stats', 'suit', 'unlocks', 'coop', 'wardrobe', 'xp', 'owned'];
    const randObj = (d) => {
      const o = {};
      for (let i = 0; i < 1 + rnd() * 6; i++) o[keys[Math.floor(rnd() * keys.length)]] = d > 0 && rnd() < 0.4 ? randObj(d - 1) : values[Math.floor(rnd() * values.length)];
      return o;
    };
    for (let i = 0; i < 400; i++) {
      let text;
      const kind = i % 4;
      if (kind === 0) text = Array.from({ length: Math.floor(rnd() * 200) }, () => String.fromCharCode(Math.floor(rnd() * 65535))).join('');
      else if (kind === 1) { const k = Math.floor(rnd() * good.length); text = good.slice(0, k) + String.fromCharCode(33 + Math.floor(rnd() * 90)) + good.slice(k + 1); }
      else if (kind === 2) { const json = JSON.stringify(randObj(3)); text = `GOTHAM1.${Buffer.from(json).toString('base64url')}.${crc32(json)}`; }
      else text = JSON.stringify({ format: 'gotham-long-night-save', version: 1, progress: randObj(3) });
      let r;
      expect(() => { r = importSave(text); }).not.toThrow();
      if (r.ok) {
        // Whatever got in is a fixed point of the sanitiser and serialises.
        expect(sanitizeProgress(JSON.parse(JSON.stringify(r.progress)))).toEqual(r.progress);
        expect(Number.isInteger(r.progress.step)).toBe(true);
      } else expect(typeof r.error).toBe('string');
    }
  });
});

describe('mode: difficulty, NG+, modifiers', () => {
  it('sanitises and defaults (an old save has none)', () => {
    expect(sanitizeProgress({}).mode).toEqual({ difficulty: null, ngPlus: 0, modifiers: { noHud: false, checkpointLimit: 0 }, checkpoints: 0 });
    expect(sanitizeMode({ difficulty: 'knightmare', ngPlus: 2, modifiers: { noHud: true, checkpointLimit: 7 } })).toMatchObject({ difficulty: 'knightmare', ngPlus: 2, modifiers: { noHud: true, checkpointLimit: 0 } });
    expect(sanitizeReputation(undefined)).toEqual({ value: 50, gangs: {} });
  });
  it('NG+ counts up and needs a finished save', () => {
    expect(canNgPlus({ finished: false })).toBe(false);
    expect(canNgPlus({ finished: true })).toBe(true);
    const m = startRunMode({ ngPlus: 1, checkpoints: 4 }, { difficulty: 'hard', ngPlus: true, modifiers: { noHud: true, checkpointLimit: 3 } });
    expect(m).toEqual({ difficulty: 'hard', ngPlus: 2, modifiers: { noHud: true, checkpointLimit: 3 }, checkpoints: 0 });
  });
  it('remixes wave inputs only in NG+', () => {
    const inputs = { budget: 8, act: 2, difficulty: 'normal', players: 1 };
    expect(remixWaveInputs(inputs, 0)).toBe(inputs);
    expect(remixWaveInputs(inputs, 1)).toEqual({ budget: 10, act: 3, difficulty: 'hard', players: 1 });
    expect(remixWaveInputs(inputs, 9).budget).toBe(14);
  });
  it('checkpoint limit', () => {
    expect(checkpointAllowed({ modifiers: { checkpointLimit: 0 } }).ok).toBe(true);
    expect(checkpointAllowed({ modifiers: { checkpointLimit: 3 }, checkpoints: 2 })).toEqual({ ok: true, left: 1 });
    expect(checkpointAllowed({ modifiers: { checkpointLimit: 3 }, checkpoints: 3 }).ok).toBe(false);
  });
});
