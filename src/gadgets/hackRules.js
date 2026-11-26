// [prog] The hacking device's timing minigame. Pure. A needle sweeps a bar back and forth; press
// the fire key while it is inside the lit window, `rounds` times in a row, before `limit` seconds
// run out. One press outside the window fails. The window's width scales with effects.hackWindow
// (the Hack Fast skill), and settings.access.qteAssist changes it: 'slow' halves the needle's speed
// and widens the window by a quarter; 'auto' wins on its own after a short beat (no input needed).

export const HACK = { width: 0.16, speed: 0.9, rounds: 2, limit: 7, autoAfter: 0.9, minWidth: 0.06, maxWidth: 0.6 };

// A deterministic 0..1 sequence for the window centres (tests pass their own).
const defaultRng = () => Math.random();

export function createHackRound({ hackWindow = 1, assist = 'off', rng = defaultRng, rules = HACK } = {}) {
  const slow = assist === 'slow';
  const auto = assist === 'auto';
  const width = Math.min(rules.maxWidth, Math.max(rules.minWidth, rules.width * (hackWindow || 1) * (slow ? 1.25 : 1)));
  const speed = rules.speed * (slow ? 0.5 : 1);
  const centre = () => width / 2 + rng() * (1 - width);
  let t = 0, phase = 0, needle = 0, round = 0, result = null;
  let c = centre();
  return {
    get needle() { return needle; },
    get centre() { return c; },
    get width() { return width; },
    get round() { return round; },
    get rounds() { return rules.rounds; },
    get result() { return result; },
    get timeLeft() { return Math.max(0, rules.limit - t); },
    get auto() { return auto; },
    inside() { return Math.abs(needle - c) <= width / 2; },
    // Advance by `dt` real seconds; returns the result once decided ('win' | 'lose'), else null.
    tick(dt) {
      if (result) return result;
      t += dt;
      phase += dt * speed;
      // A triangle wave 0 -> 1 -> 0.
      const p = phase % 2;
      needle = p < 1 ? p : 2 - p;
      if (auto && t >= rules.autoAfter * (round + 1)) {
        round += 1;
        c = centre();
        if (round >= rules.rounds) result = 'win';
      } else if (t >= rules.limit) result = 'lose';
      return result;
    },
    press() {
      if (result || auto) return result;
      if (Math.abs(needle - c) <= width / 2) {
        round += 1;
        c = centre();
        if (round >= rules.rounds) result = 'win';
      } else result = 'lose';
      return result;
    },
  };
}
