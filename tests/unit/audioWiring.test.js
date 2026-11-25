import { describe, it, expect, vi } from 'vitest';
import { wireAudio } from '../../src/game/sound.js';
import { createAudio } from '../../src/audio/audio.js';
import { createEvents } from '../../src/core/events.js';

// Every event sound.js listens to must survive a missing or partial payload: other workstreams
// add fields at their own pace, and a throw inside an event handler would break gameplay.
function setup() {
  const events = createEvents();
  const names = new Set();
  const on = events.on;
  events.on = (name, fn) => { names.add(name); return on(name, fn); };
  const audio = createAudio(); // never unlocked here: every call only records state
  const hero = { pos: { x: 0, y: 0, z: 0 }, state: 'ground', speed: 3 };
  const combat = { active: false, enemies: [], combo: { value: 0 } };
  const flow = { mode: 'play', objectives: { step: null } };
  const sound = wireAudio({ audio, events, hero, combat, flow, settings: {} });
  return { events, names, audio, sound, hero, combat, flow };
}

describe('wireAudio', () => {
  it('no handler throws on an absent, empty or odd payload', () => {
    const { events, names } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const n of names) {
      for (const payload of [undefined, null, {}, { pos: null, target: null, kind: 7 }, { pos: { x: 1, y: 2, z: 3 }, actor: {}, name: 'footL' }]) {
        expect(() => events.emit(n, payload), n).not.toThrow();
      }
    }
    warn.mockRestore();
    expect(names.size).toBeGreaterThan(80);
  });
  it('per-frame update survives missing camera, world and environment', () => {
    const { sound, combat, flow } = setup();
    expect(() => sound.update(0.016)).not.toThrow();
    combat.active = true;
    expect(() => sound.update(0.016, { hush: true })).not.toThrow();
    flow.objectives.step = { type: 'boss', villain: 'riddler' };
    expect(() => sound.update(0.3)).not.toThrow();
    expect(() => sound.start()).not.toThrow();
  });
  it('the audio API records state and returns quietly before the user gesture', () => {
    const audio = createAudio();
    expect(audio.context).toBe(null);
    expect(() => {
      audio.play('hit_cross', { pos: { x: 1, y: 0, z: 0 } });
      audio.impact({ move: 'punch' });
      audio.footstep({ surface: 'metal' });
      audio.setListeners([{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 5, y: 0, z: 0 }]);
      audio.setEnvironment({ district: 'loop', weather: 'snow' });
      audio.setMusicContext({ context: 'boss', villain: 'penguin' });
      audio.setEngine('batmobile', 1, 0.5, { mode: 'battle', boost: true });
      audio.thunder({ distance: 900 });
      audio.update(0.016);
    }).not.toThrow();
    expect(audio.listenerCount).toBe(2);
    expect(audio.impact({ move: 'kick', outcome: 'hit' })).toBe('kick');
  });
  it('barks return a subtitle even before audio starts, and the hook hears it', () => {
    const audio = createAudio();
    const seen = [];
    const off = audio.onSubtitle((s) => seen.push(s));
    const sub = audio.bark({ table: 'alfred', channel: 'voice' });
    expect(sub.text.length).toBeGreaterThan(0);
    expect(sub.name).toBe('Alfred');
    expect(sub.duration).toBeGreaterThan(0.5);
    expect(seen.length).toBe(1);
    const d = audio.dispatch({ kind: 'robbery', district: 'The Docks' });
    expect(d.queued || d.text.includes('The Docks')).toBe(true);
    off();
  });
});
