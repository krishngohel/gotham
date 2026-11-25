import { describe, it, expect } from 'vitest';
import { sanitizeProgress, DEFAULT_PROGRESS } from '../../src/core/save.js';
import { sanitizeEnv, ENV_DEFAULTS } from '../../src/env/envSave.js';
import { sanitizeSettings } from '../../src/core/settings.js';

describe('env save field', () => {
  it('an old save without it loads with the defaults', () => {
    const p = sanitizeProgress({ ...DEFAULT_PROGRESS, gadgetsUsed: 3 });
    expect(p.env).toEqual(ENV_DEFAULTS);
    expect(p.env.abs).toBe(null);
  });
  it('keeps a valid clock and seed, drops junk', () => {
    expect(sanitizeEnv({ abs: 47.5, seed: 99 })).toEqual({ abs: 47.5, seed: 99 });
    expect(sanitizeEnv({ abs: 'noon', seed: -3 })).toEqual(ENV_DEFAULTS);
    expect(sanitizeEnv({ abs: Infinity })).toEqual(ENV_DEFAULTS);
    expect(sanitizeProgress({ env: { abs: 30, seed: 5 } }).env).toEqual({ abs: 30, seed: 5 });
  });
  it('the new settings default sensibly and old settings load', () => {
    const s = sanitizeSettings({});
    expect(s.inkLight).toBe('auto');
    expect(s.timeOfDay).toBe('cycle');
    expect(sanitizeSettings({ inkLight: 'max', timeOfDay: 'noon' }).inkLight).toBe('auto');
  });
});
