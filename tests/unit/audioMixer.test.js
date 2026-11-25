import { describe, it, expect, beforeEach } from 'vitest';
import { createVoicePool, PRIORITY } from '../../src/audio/voicePool.js';
import { busLevels, duckLevel, audioTier, dynamicsSettings, DUCK_RULES } from '../../src/audio/mixerMath.js';
import { sanitizeAudioPrefs, loadAudioPrefs, setAudioPrefs, getAudioPrefs, onAudioPrefs, resetAudioPrefsCache, AUDIO_PREFS_KEY, DEFAULT_AUDIO_PREFS } from '../../src/audio/prefs.js';
import { sanitizeSettings } from '../../src/core/settings.js';

const v = (name, priority, start, end = start + 1) => ({ name, priority, start, end });

describe('voice pool', () => {
  it('plays freely under the cap', () => {
    const p = createVoicePool({ cap: 3 });
    for (let i = 0; i < 3; i++) { const a = p.admit({ name: `s${i}` }, 0); expect(a).toEqual({ ok: true, victim: null }); p.add(v(`s${i}`, 2, 0)); }
    expect(p.size).toBe(3);
  });
  it('steals the oldest copy of a sound at its own max', () => {
    const p = createVoicePool({ cap: 10 });
    const a = p.add(v('punch', 3, 0));
    p.add(v('punch', 3, 0.1));
    const r = p.admit({ name: 'punch', priority: 3, max: 2 }, 0.2);
    expect(r.ok).toBe(true);
    expect(r.victim).toBe(a);
  });
  it('at the cap, steals the lowest priority and rejects a newcomer lower than everything playing', () => {
    const p = createVoicePool({ cap: 2 });
    const step = p.add(v('step', PRIORITY.movement, 0));
    p.add(v('ko', PRIORITY.critical, 0));
    const hit = p.admit({ name: 'hit', priority: PRIORITY.combat }, 0.1);
    expect(hit.victim).toBe(step);
    p.add(v('hit', PRIORITY.combat, 0.1));
    expect(p.admit({ name: 'drip', priority: PRIORITY.ambient }, 0.2)).toEqual({ ok: false, victim: null });
  });
  it('drops finished voices and can shrink its cap', () => {
    const p = createVoicePool({ cap: 2 });
    p.add(v('a', 2, 0, 0.5));
    p.add(v('b', 2, 0, 0.5));
    expect(p.admit({ name: 'c' }, 1).victim).toBe(null);
    p.setCap(0);
    expect(p.cap).toBe(1);
  });
});

describe('mixer maths', () => {
  it('keeps the saved volume shape and gives new buses defaults', () => {
    const lv = busLevels({ master: 0.5, music: 0.25, sfx: 1 }, {});
    expect(lv).toMatchObject({ master: 0.5, music: 0.25, sfx: 1 });
    expect(lv.ambience).toBeGreaterThan(0);
    expect(lv.dialogue).toBe(1);
    expect(busLevels(null, null).master).toBe(0.9);
    expect(busLevels({ master: 7, music: -1, sfx: 'x' }).master).toBe(1);
    expect(busLevels({ music: -1 }).music).toBe(0);
  });
  it('a settings object from an old save still yields bus levels', () => {
    const s = sanitizeSettings({ volume: { master: 0.4, music: 0.3, sfx: 0.2 } });
    expect(busLevels(s.volume, DEFAULT_AUDIO_PREFS)).toMatchObject({ master: 0.4, music: 0.3, sfx: 0.2, ambience: DEFAULT_AUDIO_PREFS.ambience });
  });
  it('the deepest active duck wins and expired ducks do nothing', () => {
    expect(duckLevel([], 0)).toBe(1);
    expect(duckLevel([{ depth: 0.5, until: 2 }, { depth: 0.7, until: 3 }], 1)).toBe(0.5);
    expect(duckLevel([{ depth: 0.5, until: 2 }, { depth: 0.7, until: 3 }], 2.5)).toBe(0.7);
    expect(duckLevel([{ depth: 0.5, until: 2 }], 5)).toBe(1);
    expect(DUCK_RULES.dialogue.music).toBeLessThan(1);
  });
  it('night mode compresses harder with more makeup gain', () => {
    const n = dynamicsSettings(true), d = dynamicsSettings(false);
    expect(n.ratio).toBeGreaterThan(d.ratio);
    expect(n.threshold).toBeLessThan(d.threshold);
    expect(n.makeup).toBeGreaterThan(d.makeup);
  });
  it('picks the audio tier from quality flags, the tier name, then the player override', () => {
    expect(audioTier({ name: 'high' }).lowSpec).toBe(false);
    expect(audioTier({ name: 'low' }).lowSpec).toBe(true);
    expect(audioTier({ name: 'low' }).convolution).toBe(false);
    expect(audioTier({ name: 'potato' }).samples).toBe(false);
    expect(audioTier(null).voices).toBeGreaterThan(audioTier({ name: 'low' }).voices);
    expect(audioTier({ name: 'high', audio: { voices: 9, convolution: false, hrtf: true } })).toMatchObject({ voices: 9, convolution: false, hrtf: true });
    expect(audioTier({ name: 'high' }, { lowSpec: 'on' })).toMatchObject({ lowSpec: true, convolution: false, hrtf: false });
    expect(audioTier({ name: 'low' }, { lowSpec: 'off' }).lowSpec).toBe(false);
    expect(audioTier({ name: 'ultra' }).hrtf).toBe(true);
  });
});

describe('audio prefs', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, val) => m.set(k, val), m }; };
  beforeEach(() => resetAudioPrefsCache());
  it('sanitises anything into the full shape', () => {
    expect(sanitizeAudioPrefs(null)).toEqual({ ...DEFAULT_AUDIO_PREFS });
    expect(sanitizeAudioPrefs({ ambience: 3, mono: 'yes', lowSpec: 'max' })).toMatchObject({ ambience: 1, mono: false, lowSpec: 'auto' });
  });
  it('loads from its own key and survives broken JSON', () => {
    const s = store();
    s.setItem(AUDIO_PREFS_KEY, '{nope');
    expect(loadAudioPrefs(s)).toEqual({ ...DEFAULT_AUDIO_PREFS });
    s.setItem(AUDIO_PREFS_KEY, JSON.stringify({ dialogue: 0.25, nightMode: true }));
    expect(loadAudioPrefs(s)).toMatchObject({ dialogue: 0.25, nightMode: true });
  });
  it('saves, caches and notifies subscribers; never touches the settings key', () => {
    const s = store();
    let seen = null;
    const off = onAudioPrefs((p) => { seen = p; });
    setAudioPrefs({ mono: true }, s);
    expect(seen.mono).toBe(true);
    expect(getAudioPrefs().mono).toBe(true);
    expect(JSON.parse(s.getItem(AUDIO_PREFS_KEY)).mono).toBe(true);
    expect(s.getItem('gotham-settings-v1')).toBe(null);
    off();
    setAudioPrefs({ mono: false }, s);
    expect(seen.mono).toBe(true);
  });
});
