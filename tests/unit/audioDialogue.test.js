import { describe, it, expect } from 'vitest';
import { createDialogue, lineDuration, dispatchLine, BARK_PRIORITY } from '../../src/audio/dialogue.js';
import { BARK_TABLES, SPEAKERS, CRIME_ALERTS } from '../../src/audio/barks/lines.js';
import { syllabify, voiceFor, VOICE_PROFILES } from '../../src/audio/voiceBlip.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const textOf = (line) => (Array.isArray(line) ? line.map(([, t]) => t).join(' ') : line);

describe('bark tables', () => {
  it('hold the comedy lines from the research doc and nothing empty', () => {
    const all = Object.values(BARK_TABLES).flatMap((t) => t.lines.map(textOf));
    expect(all.length).toBeGreaterThanOrEqual(61);
    for (const t of all) expect(t.trim().length).toBeGreaterThan(1);
    expect(all).toContain("I took this job for the dental plan. There's no dental plan.");
    expect(all.some((t) => t.includes('very specific fault'.replace('very', 'Very')))).toBe(true);
  });
  it('every speaker in a conversation is a known speaker id or a goon variant', () => {
    for (const t of Object.values(BARK_TABLES)) for (const line of t.lines) {
      if (!Array.isArray(line)) continue;
      for (const [s] of line) expect(SPEAKERS[s] ?? null).not.toBe(null);
    }
  });
  it('stays clean', () => {
    const banned = /\b(damn|hell|kill(ed)? (him|you)|die\b|dead|blood)/i;
    for (const t of Object.values(BARK_TABLES)) for (const line of t.lines) expect(banned.test(textOf(line))).toBe(false);
  });
});

describe('dialogue scheduling', () => {
  it('never repeats a recent line from a table', () => {
    const d = createDialogue({ rng: Math.random });
    const n = BARK_TABLES['goon.idle'].lines.length;
    const recent = [];
    for (let i = 0; i < 60; i++) {
      const k = d.pickIndex('goon.idle');
      expect(recent.slice(-Math.min(6, n - 1))).not.toContain(k);
      recent.push(k);
    }
  });
  it('respects a per-speaker cooldown for world barks', () => {
    const d = createDialogue({ rng: seq([0.1]) });
    expect(d.request({ table: 'goon.combat', speaker: 'goon7' }, 0)).toBeTruthy();
    expect(d.request({ table: 'goon.combat', speaker: 'goon7' }, 30)).toBeTruthy();
    expect(d.request({ table: 'goon.combat', speaker: 'goon7', cooldown: 60 }, 40)).toBe(null);
  });
  it('caps concurrent world barks and drops (never queues) the extra one', () => {
    const d = createDialogue();
    expect(d.request({ table: 'goon.combat', speaker: 'a' }, 0)).toBeTruthy();
    expect(d.request({ table: 'goon.combat', speaker: 'b' }, 0)).toBeTruthy();
    expect(d.request({ table: 'goon.combat', speaker: 'c' }, 0)).toBe(null);
    expect(d.queued).toBe(0);
  });
  it('queues foreground lines by priority and starts them when the slot frees', () => {
    const d = createDialogue();
    const first = d.request({ text: 'Line one is speaking now.', speaker: 'alfred', channel: 'voice', priority: BARK_PRIORITY.companion }, 0);
    expect(first.parts[0].text).toBe('Line one is speaking now.');
    expect(d.request({ text: 'Low.', speaker: 'dispatch', channel: 'radio', priority: BARK_PRIORITY.radio }, 0.1)).toBe('queued');
    expect(d.request({ text: 'High.', speaker: 'riddler', channel: 'voice', priority: BARK_PRIORITY.story }, 0.2)).toBe('queued');
    expect(d.update(0.5)).toBe(null); // still talking
    const next = d.update(first.end + 0.01);
    expect(next.parts[0].text).toBe('High.');
    expect(next.start).toBeCloseTo(first.end + 0.01, 6);
  });
  it('a higher priority line may interrupt when it asks to', () => {
    const d = createDialogue();
    d.request({ text: 'A long radio report about the weather in Gotham.', speaker: 'dispatch', channel: 'radio', priority: BARK_PRIORITY.radio }, 0);
    const cut = d.request({ text: 'Sir!', speaker: 'alfred', channel: 'voice', priority: BARK_PRIORITY.story, interrupt: true }, 0.5);
    expect(cut.parts[0].text).toBe('Sir!');
    expect(cut.interrupted.speaker).toBe('dispatch');
  });
  it('stale low-priority queue entries expire', () => {
    const d = createDialogue();
    const a = d.request({ text: 'A very long line that keeps the slot busy for quite a while indeed.', speaker: 'alfred', channel: 'voice' }, 0);
    d.request({ text: 'Old news.', speaker: 'dispatch', channel: 'radio', ttl: 1 }, 0);
    expect(d.update(a.end + 5)).toBe(null);
  });
  it('plays a conversation as timed parts, one speaker after another', () => {
    const d = createDialogue({ rng: seq([0]) });
    const p = d.request({ table: 'goon.overheard' }, 0);
    expect(p.parts.length).toBeGreaterThan(1);
    for (let i = 1; i < p.parts.length; i++) expect(p.parts[i].start).toBeGreaterThan(p.parts[i - 1].start + p.parts[i - 1].duration - 1e-9);
    expect(p.parts[0].name).toBe('Goon');
  });
  it('radio tables go to the radio channel', () => {
    const d = createDialogue();
    const p = d.request({ table: 'dispatch' }, 0);
    expect(p.channel).toBe('radio');
    expect(p.radio).toBe(true);
  });
  it('ignores junk requests', () => {
    const d = createDialogue();
    expect(d.request(null, 0)).toBe(null);
    expect(d.request({}, 0)).toBe(null);
    expect(d.request({ table: 'no.such.table' }, 0)).toBe(null);
  });
});

describe('subtitle timing and dispatch', () => {
  it('longer lines take longer, within sane bounds', () => {
    expect(lineDuration('Oof.')).toBeGreaterThanOrEqual(0.9);
    expect(lineDuration('A much longer line, with a pause. And another one.')).toBeGreaterThan(lineDuration('Oof.'));
    expect(lineDuration('x'.repeat(1000))).toBeLessThanOrEqual(8);
    expect(lineDuration(undefined)).toBeGreaterThan(0);
  });
  it('fills crime alerts and handles unknown kinds', () => {
    expect(dispatchLine({ kind: 'robbery', district: 'The Narrows' }, () => 0)).toContain('The Narrows');
    const g = dispatchLine({ kind: 'alienInvasion', district: 'gothamMile' }, () => 0);
    expect(g).toContain('Gotham Mile');
    expect(g).not.toContain('{');
    for (const list of Object.values(CRIME_ALERTS)) for (const t of list) expect(t).toContain('{district}');
  });
});

describe('voice blips', () => {
  it('turns text into syllables with pauses at punctuation and a lift on questions', () => {
    const a = syllabify('Hey there.', 5);
    const b = syllabify('Hey there, you. Yes, you.', 5);
    expect(a.syllables.length).toBeGreaterThan(1);
    expect(b.length).toBeGreaterThan(a.length);
    expect(syllabify('Who am I?').question).toBe(true);
    expect(syllabify('').syllables.length).toBe(0);
  });
  it('gives each known speaker a stable voice and unknown ids a stable variation', () => {
    expect(voiceFor('alfred')).toBe(VOICE_PROFILES.alfred);
    expect(voiceFor('goon12')).toEqual(voiceFor('goon12'));
    expect(voiceFor('goon12').pitch).not.toBe(voiceFor('goon13').pitch);
  });
});
