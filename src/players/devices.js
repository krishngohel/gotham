// Which input devices drive which local player. Pure (workstream B, Long Night 2).
//
// Rules (docs/design/research/coop-netcode.md, "Input assignment"):
// - At most one keyboard+mouse player: browsers expose no per-device ids for keyboards or mice.
// - Pads are matched by Gamepad.index (two identical pads share an id string, never an index).
// - One player: everything merges, exactly as before co-op existed: the keyboard+mouse and the
//   first connected pad (whatever its index) both drive player 0.
//
// Returns one entry per player: { kbm: boolean, pad: number | 'first' | null }.
// `claims` (optional) is the pad index each player claimed ("press A to join", wave 2); without
// it, player i of several gets pad index i, and player 0 also has the keyboard+mouse.
export function assignDevices(playerCount, { kbmPlayer = 0, claims = null } = {}) {
  const n = Math.max(1, playerCount | 0);
  if (n === 1) return [{ kbm: true, pad: 'first' }];
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let pad = claims ? claims[i] ?? null : i;
    if (pad !== null && used.has(pad)) pad = null; // one pad, one player
    if (pad !== null) used.add(pad);
    out.push({ kbm: i === kbmPlayer, pad });
  }
  return out;
}

// True when an assignment breaks a rule: two keyboard players, or a pad index used twice.
export function assignmentProblem(assignment) {
  let kbm = 0;
  const pads = new Set();
  for (const a of assignment) {
    if (a.kbm) kbm += 1;
    if (typeof a.pad === 'number') {
      if (pads.has(a.pad)) return `pad ${a.pad} assigned twice`;
      pads.add(a.pad);
    }
  }
  if (kbm > 1) return 'more than one keyboard+mouse player';
  return null;
}
