import { describe, it, expect } from 'vitest';
import { createMusicDirector, cueFor, nextBarTime, layerOn, DISTRICT_THEMES, VILLAIN_THEMES, CONTEXTS } from '../../src/audio/music/director.js';
import { THEMES, barSeconds, cycleSeconds } from '../../src/audio/music/themes.js';
import { chord, hit, degree } from '../../src/audio/music/theory.js';
import { ALL_THEMES, MUSIC_MODES, STINGERS } from '../../src/audio/music.js';

// A fake instrument set that records calls instead of making sound.
function fakeM(log) {
  return new Proxy({}, { get: (_, name) => (name === 'intensity' ? 0.5 : (t, ...args) => { expect(Number.isFinite(t)).toBe(true); log.push([name, t, args]); }) });
}

describe('theory', () => {
  it('parses chords', () => {
    expect(chord('Dm')).toMatchObject({ pc: 2, bass: 38, ints: [0, 3, 7] });
    expect(chord('Bb').pc).toBe(10);
    expect(chord('F#').pc).toBe(6);
    expect(chord('Cm7').tones.length).toBe(4);
    expect(() => chord('H')).toThrow();
    expect(hit('x.o.', 0)).toBe(2);
    expect(hit('x.o.', 6)).toBe(1);
    expect(degree(60, 'major', 7)).toBe(72);
    expect(degree(60, 'minor', -1)).toBe(58);
  });
});

describe('themes', () => {
  it('every theme section has one chord per bar and every part runs without throwing at every threat', () => {
    for (const [id, th] of Object.entries(THEMES)) {
      for (const [name, sec] of Object.entries(th.sections)) {
        expect(sec.prog.length, `${id}.${name}`).toBe(sec.bars);
        const log = [];
        const m = fakeM(log);
        const steps = th.beats * th.sub;
        for (const threat of [0, 0.5, 1]) {
          for (let bar = 0; bar < sec.bars; bar++) for (let step = 0; step < steps; step++) {
            const s = { t: 10 + bar, step, steps, sd: 0.1, beat: th.sub, bar, section: name, chord: sec.prog[bar], next: sec.prog[(bar + 1) % sec.bars], threat, pass: 0 };
            for (const p of th.parts) if (!p.in || p.in.includes(name)) p.fn(m, s);
          }
        }
        expect(log.length, `${id}.${name} plays something`).toBeGreaterThan(0);
      }
      for (const n of th.order) expect(th.sections[n], `${id} order -> ${n}`).toBeTruthy();
    }
  });
  it('loops are long: every cue cycles for at least 25 s before repeating (the old loops were ~7 s)', () => {
    for (const [id, th] of Object.entries(THEMES)) expect(cycleSeconds(th), id).toBeGreaterThanOrEqual(25);
  });
  it('combat, chase and the bosses have an outro; combat an intro', () => {
    expect(THEMES.combat.sections.intro).toBeTruthy();
    for (const id of ['combat', 'chase', 'boss:joker', 'boss:riddler', 'boss:penguin']) expect(THEMES[id].sections.outro, id).toBeTruthy();
  });
  it('has hooks for ten villains, three of them written in full, and per-district themes', () => {
    expect(Object.keys(VILLAIN_THEMES).length).toBeGreaterThanOrEqual(10);
    for (const cue of Object.values(VILLAIN_THEMES)) expect(THEMES[cue], cue).toBeTruthy();
    expect(THEMES['boss:penguin'].beats).toBe(3); // the waltz
    for (const cue of new Set(Object.values(DISTRICT_THEMES))) expect(THEMES[cue], cue).toBeTruthy();
    for (const c of ['stealth', 'chase', 'manor', 'cave', 'combat']) expect(ALL_THEMES[c]).toBeTruthy();
    expect(ALL_THEMES.title && ALL_THEMES.finale).toBeTruthy();
  });
  it('keeps the old public names', () => {
    for (const m of ['title', 'explore', 'combat', 'boss', 'finale']) expect(MUSIC_MODES).toContain(m);
    for (const s of ['districtClear', 'death', 'bossPhase', 'objective']) expect(STINGERS).toContain(s);
  });
});

describe('music director', () => {
  it('maps contexts to cues', () => {
    expect(cueFor({ context: 'explore', district: 'loop' })).toBe('explore:loop');
    expect(cueFor({ context: 'explore', district: 'atlantis' })).toBe('explore:gotham');
    expect(cueFor({ context: 'boss', villain: 'riddler' })).toBe('boss:riddler');
    expect(cueFor({ context: 'boss', villain: 'someone' })).toBe('boss:joker');
    expect(cueFor({ context: 'none' })).toBe(null);
    expect(cueFor({ context: 'stealth' })).toBe('stealth');
    expect(CONTEXTS).toContain('manor');
  });
  it('plays the intro once, then walks the section order on repeat', () => {
    const d = createMusicDirector();
    d.request({ context: 'combat' });
    const seen = [];
    const th = ALL_THEMES.combat;
    for (let bar = 0; bar < 2 + 8 * 5; bar++) { const r = d.onBar(ALL_THEMES); if (r.sectionBar === 0) seen.push(r.section); }
    expect(seen[0]).toBe('intro');
    expect(seen.slice(1, 5)).toEqual(th.order);
    expect(seen.filter((s) => s === 'intro').length).toBe(1);
  });
  it('switches up in energy on the next bar, but plays the outro before going down', () => {
    const d = createMusicDirector();
    d.request({ context: 'explore', district: 'gcpd' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'start', cue: 'explore:gotham' });
    d.request({ context: 'combat' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'start', cue: 'combat' });
    d.onBar(ALL_THEMES);
    d.request({ context: 'explore', district: 'gcpd' });
    const outro = ALL_THEMES.combat.sections.outro.bars;
    for (let i = 0; i < outro; i++) expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'outro', cue: 'combat', section: 'outro' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'start', cue: 'explore:gotham' });
  });
  it('going back into the fight during the outro resumes the fight', () => {
    const d = createMusicDirector();
    d.request({ context: 'combat' });
    d.onBar(ALL_THEMES); d.onBar(ALL_THEMES);
    d.request({ context: 'explore' });
    d.onBar(ALL_THEMES);
    d.request({ context: 'combat' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'continue', cue: 'combat', section: ALL_THEMES.combat.order[0] });
  });
  it('a district change swaps the exploration theme on a bar line; jump() starts at once', () => {
    const d = createMusicDirector();
    d.request({ context: 'explore', district: 'docks' });
    expect(d.jump(ALL_THEMES)).toMatchObject({ action: 'start', cue: 'explore:docks' });
    d.request({ context: 'explore', district: 'loop' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'start', cue: 'explore:loop' });
    d.request({ context: 'none' });
    expect(d.onBar(ALL_THEMES)).toMatchObject({ action: 'stop', cue: null });
  });
  it('bar lines and layer hysteresis', () => {
    expect(nextBarTime(10.1, 10, 2)).toBe(12);
    expect(nextBarTime(12, 10, 2)).toBe(12);
    expect(nextBarTime(9, 10, 2)).toBe(10);
    expect(barSeconds(ALL_THEMES.combat)).toBeCloseTo((60 / 130) * 4, 9);
    expect(layerOn(0.5, 0.45, false)).toBe(true);
    expect(layerOn(0.4, 0.45, false)).toBe(false);
    expect(layerOn(0.4, 0.45, true)).toBe(true); // stays on inside the band
    expect(layerOn(0.3, 0.45, true)).toBe(false);
  });
});
