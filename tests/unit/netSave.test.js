import { describe, it, expect } from 'vitest';
import { loadProgress, saveProgress } from '../../src/core/save.js';
import { guestStorage, sanitizeOnline, PROGRESS_KEY } from '../../src/net/netSave.js';

function mem(init = {}) { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; }

describe('online save field', () => {
  it('an old save without it loads with the defaults', () => {
    const st = mem({ [PROGRESS_KEY]: JSON.stringify({ step: 7, trophies: [1, 2] }) });
    const p = loadProgress(st);
    expect(p.step).toBe(7);
    expect(p.online).toEqual({ sessions: 0, hostedSteps: 0, guestBestStep: 0 });
  });
  it('sanitises garbage', () => {
    expect(sanitizeOnline({ sessions: -1, hostedSteps: 'x', guestBestStep: 3.5 })).toEqual({ sessions: 0, hostedSteps: 0, guestBestStep: 0 });
  });
});

describe('the guest save rule', () => {
  it('a guest keeps XP, unlocks and trophies earned online, never the host\'s story step', () => {
    const real = mem();
    const own = { ...loadProgress(mem({ [PROGRESS_KEY]: JSON.stringify({ step: 3, stepId: 'card', trophies: [0] }) })) };
    const st = guestStorage(real, own);
    // The run in the host's world: step 40, a trophy, XP.
    const session = { ...own, step: 40, stepId: 'a3', finished: false, trophies: [0, 5], wayne: { ...(own.wayne ?? {}), xp: 900 } };
    saveProgress(st, session);
    const back = loadProgress(real);
    expect(back.step).toBe(3);
    expect(back.stepId ?? null).not.toBe('a3');
    expect(back.trophies).toEqual([0, 5]);
    expect(back.online.guestBestStep).toBe(40);
  });
  it('other keys pass straight through', () => {
    const real = mem();
    guestStorage(real, {}).setItem('gotham-settings-v1', '{"a":1}');
    expect(real.getItem('gotham-settings-v1')).toBe('{"a":1}');
  });
});
