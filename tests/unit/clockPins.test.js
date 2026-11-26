// [fix1] The player's 'Always night' pin sits under the story's pins, and what holds the hour can
// be asked (Bruce's bed and the settings page use it instead of silently doing nothing).
import { describe, it, expect } from 'vitest';
import { createClock } from '../../src/env/clock.js';
import { createDayClock } from '../../src/bruce/clock.js';

describe('[fix1] clock pins', () => {
  it("'Always night' stays under a story pin, whichever came first", () => {
    const c = createClock({ startHour: 12 });
    c.pin(11, { id: 'story:day' });
    c.pin(23, { id: 'settings', under: true });
    expect(c.hour).toBe(11);
    c.unpin('story:day');
    expect(c.hour).toBe(23);
    c.pin(22, { id: 'story:night' });
    expect(c.hour).toBe(22);
    expect(c.heldBy(['settings'])).toEqual(['story:night']);
    c.unpin('story:night');
    expect(c.heldBy(['settings'])).toEqual([]);
  });
  it('a plain pin still stacks newest-first', () => {
    const c = createClock({ startHour: 12 });
    c.pin(3, { id: 'a' });
    c.pin(4, { id: 'b' });
    expect(c.hour).toBe(4);
    expect(c.pinId).toBe('b');
  });
  it('the Bruce adapter answers heldBy for the world clock and its stand-in', () => {
    const world = { clock: createClock({ startHour: 9 }) };
    const d = createDayClock({ world });
    world.clock.pin(23, { id: 'story:night' });
    expect(d.heldBy(['settings'])).toEqual(['story:night']);
    const own = createDayClock({});
    own.pin(10, { id: 'bruce:scene' });
    expect(own.heldBy()).toEqual(['bruce:scene']);
  });
});
