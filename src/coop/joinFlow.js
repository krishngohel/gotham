// Who plays on which device, as players join, drop out and lose controllers (workstream D1).
// Pure: the game feeds it presses and pad connection changes and acts on what it returns.
//
// Rules (docs/design/research/coop-netcode.md, "Input assignment"):
// - Alone, player 0 owns everything: the keyboard+mouse and whichever pad is used ('first'),
//   exactly as before co-op.
// - "Press Start / Enter to join": a join press comes from a device player 0 is not using. A pad
//   (Start or A) gives the joiner that pad, by Gamepad.index; Enter gives the joiner the keyboard
//   and mouse, which needs player 0 to be on a pad (at most one keyboard+mouse player).
// - When a second player joins, player 0 keeps the keyboard+mouse unless the joiner took it, and
//   keeps the last pad it was seen using unless that is the joiner's pad.
// - A pad that disconnects puts its player in 'waiting': the game pauses and asks that player to
//   press a button on a controller; the next join press from a free pad (any index: indices are
//   reused after a disconnect) re-binds them. A waiting player 2 may also be dropped instead.
// - Dropping out (player 2 leaves) gives player 0 everything again.
//
// Devices: 'kbm' or a pad index (number).
export const KBM = 'kbm';

export function createJoinFlow({ max = 2 } = {}) {
  // slot: { kbm, pad: number | 'first' | null, status: 'playing' | 'waiting' }
  const slots = [{ kbm: true, pad: 'first', status: 'playing' }];
  // The device player 0 used last while alone: decides what it keeps when someone joins.
  let soloDevice = KBM;
  const owns = (s, d) => (d === KBM ? s.kbm : s.pad === 'first' ? typeof d === 'number' : s.pad === d);

  const api = {
    slots,
    get count() { return slots.length; },
    // The first player waiting for a controller, or -1.
    get waiting() { return slots.findIndex((s) => s.status === 'waiting'); },
    get soloDevice() { return soloDevice; },
    // Any input from a device (a key, a button, a stick): who is using what while alone.
    activity(device) { if (slots.length === 1 && device !== undefined && device !== null) soloDevice = device; },
    ownerOf(device) { return slots.findIndex((s) => owns(s, device)); },

    // A join press (Start or A on a pad, Enter on the keyboard). connectedPads: indices connected
    // now. Returns what it means:
    //   { type: 'join', slot, device }      a new player can join with this device (not yet
    //                                       committed: the game runs the hero select, then commit())
    //   { type: 'reassign', slot, device }  a waiting player got a controller back (committed)
    //   { type: 'ignore' }                  the device already plays, or nobody can join now
    //   { type: 'refused', reason }         a keyboard join while player 0 has no pad
    press(device, connectedPads = []) {
      const w = api.waiting;
      if (w >= 0) {
        if (device === KBM || slots.some((s, i) => i !== w && owns(s, device))) return { type: 'ignore' };
        slots[w].pad = device;
        slots[w].status = 'playing';
        return { type: 'reassign', slot: w, device };
      }
      if (slots.length >= max) return { type: 'ignore' };
      if (slots.length === 1) {
        if (device === soloDevice) return { type: 'ignore' }; // player 0 pressing its own pause/accept
        if (device === KBM && !connectedPads.some((i) => i !== undefined)) return { type: 'refused', reason: 'Player 1 needs a controller before Player 2 can take the keyboard.' };
      } else if (slots.some((s) => owns(s, device))) return { type: 'ignore' };
      return { type: 'join', slot: slots.length, device };
    },
    // Commits a join: re-assigns player 0 and adds the new slot. Returns the new assignment.
    commit(device, connectedPads = []) {
      const p0 = slots[0];
      if (device === KBM) {
        p0.kbm = false;
        p0.pad = typeof soloDevice === 'number' ? soloDevice : connectedPads.find((i) => typeof i === 'number') ?? null;
        slots.push({ kbm: true, pad: null, status: 'playing' });
      } else {
        p0.kbm = true;
        p0.pad = typeof soloDevice === 'number' && soloDevice !== device ? soloDevice : null;
        slots.push({ kbm: false, pad: device, status: 'playing' });
      }
      return api.assignment();
    },
    // A pad went away: the player on it waits for a controller (returns that slot, or -1).
    // Player 0 alone on 'first' never waits: any pad (or the keyboard) still drives it.
    disconnect(index) {
      const i = slots.findIndex((s) => s.pad === index);
      if (i < 0) return -1;
      // Player 0 with the keyboard as well can keep playing on it.
      if (slots[i].kbm) { slots[i].pad = null; return -1; }
      slots[i].status = 'waiting';
      slots[i].pad = null;
      return i;
    },
    // A player leaves (drop-out). Player 0 never leaves; alone again, it owns everything.
    leave(slot) {
      if (slot <= 0 || slot >= slots.length) return false;
      slots.splice(slot, 1);
      if (slots.length === 1) { slots[0].kbm = true; slots[0].pad = 'first'; slots[0].status = 'playing'; }
      return true;
    },
    // [{ kbm, pad }] per slot, for createInputFor (src/core/input.js).
    assignment() { return slots.map((s) => ({ kbm: s.kbm, pad: s.pad })); },
  };
  return api;
}
