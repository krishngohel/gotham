// [prog] a11y (wave 3 L1 item 6): subtitle timing from the audio subtitle hook's payload.
import { describe, it, expect } from 'vitest';
import { subtitleSchedule, MIN_READ } from '../../src/ui/subtitles.js';

describe('subtitleSchedule', () => {
  const sub = { channel: 'radio', radio: true, lines: [
    { name: 'Alfred', text: 'Do mind the gargoyles, sir.', delay: 0, duration: 1.2 },
    { name: 'Dispatch', text: 'All units, a robbery on Fifth.', delay: 2, duration: 3 },
  ] };
  it('one caption per line, at its delay, with the speaker and long enough to read', () => {
    const s = subtitleSchedule(sub);
    expect(s.map((l) => [l.name, l.at])).toEqual([['Alfred', 0], ['Dispatch', 2]]);
    expect(s[0].until).toBeGreaterThanOrEqual(MIN_READ);
    expect(s[1].until - s[1].at).toBeGreaterThanOrEqual(3);
    expect(s.every((l) => l.radio)).toBe(true);
  });
  it('speaker names can be turned off', () => {
    expect(subtitleSchedule(sub, { speakers: false }).map((l) => l.name)).toEqual(['', '']);
  });
  it('skips empty lines and survives junk payloads', () => {
    expect(subtitleSchedule({ lines: [{ text: '  ' }, { text: 'Hey!', delay: -3 }] })).toMatchObject([{ text: 'Hey!', at: 0 }]);
    expect(subtitleSchedule(null)).toEqual([]);
    expect(subtitleSchedule({ text: 'Only text', name: 'Goon' })).toMatchObject([{ text: 'Only text', name: 'Goon' }]);
  });
});
