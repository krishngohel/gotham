// Acoustic spaces: which reverb a positioned sound is sent to. Pure data + a picker.
//
// seconds/decay/predelay shape the generated impulse; `taps` are early reflections in seconds
// (the slap off an alley wall, the flutter under a bridge); `bright` is how long the tail keeps
// its top end; `send` is the default wet level multiplier for effects played in this space.
export const SPACES = Object.freeze({
  street: { seconds: 1.7, decay: 3.4, predelay: 0.02, taps: [0.045, 0.11], bright: 0.6, send: 1 },
  alley: { seconds: 1.3, decay: 3, predelay: 0.008, taps: [0.018, 0.031, 0.052], bright: 0.75, send: 1.25 },
  interior: { seconds: 2.4, decay: 2.6, predelay: 0.014, taps: [0.022, 0.037], bright: 0.5, send: 1.3 },
  rooftop: { seconds: 0.9, decay: 4.5, predelay: 0.03, taps: [], bright: 0.4, send: 0.55 },
  underpass: { seconds: 2.2, decay: 2.4, predelay: 0.006, taps: [0.014, 0.028, 0.042, 0.056], bright: 0.85, send: 1.5 },
});

export const SPACE_NAMES = Object.keys(SPACES);

// env: the environment object (design 4.5) or anything with the same fields. An explicit
// env.space always wins; otherwise indoors -> interior, high up -> rooftop, under the El or the
// lower deck -> underpass, the tight districts -> alley, everything else -> street.
const ALLEY_DISTRICTS = new Set(['narrows', 'parkRow', 'crimeAlley', 'chinatown', 'littleOdessa']);
const UNDER_DISTRICTS = new Set(['lowerGotham']);

export function spaceFor(env = {}) {
  const e = env && typeof env === 'object' ? env : {};
  if (typeof e.space === 'string' && SPACES[e.space]) return e.space;
  if (e.indoors) return 'interior';
  const alt = Number(e.altitude) || 0;
  if (alt > 18) return 'rooftop';
  if (e.underpass || UNDER_DISTRICTS.has(e.district)) return 'underpass';
  if (e.alley || ALLEY_DISTRICTS.has(e.district)) return 'alley';
  return 'street';
}
