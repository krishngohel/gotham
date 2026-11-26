import { describe, it, expect } from 'vitest';
import { signatureChoice, teamMoveFor, teamReady, dualTakedownTarget, createPings, commsSlot, COMMS, TEAM_MOVES, TEAM, PING_TTL } from '../../src/coop/glueRules.js';
import { kitById, kitInfo, HEROES } from '../../src/heroes/roster.js';
import { createInputFilter } from '../../src/coop/glue.js';
import { createScriptedInput } from '../../src/core/input.js';

describe('signature moves', () => {
  const nw = kitInfo(kitById('nightwing')).signature;
  const base = { comboReady: false, moving: false, grounded: true, cooldowns: new Map(), busy: false };
  it('standing plays the first, moving the second', () => {
    expect(signatureChoice(nw, base).id).toBe('escrima');
    expect(signatureChoice(nw, { ...base, moving: true }).id).toBe('wingKick');
  });
  it('a ready combo is the special takedown, not a signature; nor in the air or mid-move', () => {
    expect(signatureChoice(nw, { ...base, comboReady: true })).toBe(null);
    expect(signatureChoice(nw, { ...base, grounded: false })).toBe(null);
    expect(signatureChoice(nw, { ...base, busy: true })).toBe(null);
  });
  it('cooldowns: the other move stands in, then nothing', () => {
    const cd = new Map([['escrima', 3]]);
    expect(signatureChoice(nw, { ...base, cooldowns: cd }).id).toBe('wingKick');
    cd.set('wingKick', 2);
    expect(signatureChoice(nw, { ...base, cooldowns: cd })).toBe(null);
  });
  it('Batman\'s signatures are combat\'s own (single-player unchanged)', () => {
    expect(signatureChoice(kitInfo(kitById('m')).signature, base)).toBe(null);
  });
});

describe('team moves', () => {
  const tags = (id) => kitInfo(kitById(id)).teamTags;
  it('one move per pairing category, at least three distinct', () => {
    expect(teamMoveFor(tags('m'), tags('superman'))).toBe(TEAM_MOVES.thunderclap);
    expect(teamMoveFor(tags('m'), tags('nightwing'))).toBe(TEAM_MOVES.launchPad);
    expect(teamMoveFor(tags('red-hood'), tags('red-hood'))).toBe(TEAM_MOVES.doubleTrouble);
    expect(teamMoveFor(tags('m'), tags('f'))).toBe(TEAM_MOVES.darkDuet);
    const seen = new Set();
    for (const a of HEROES) for (const b of HEROES) seen.add(teamMoveFor(a.teamTags, b.teamTags).id);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('both presses inside the window, close, with goons near, off cooldown', () => {
    const ok = { pressA: 10, pressB: 10.3, now: 10.3, dist: 3, enemiesNear: 2, cooldown: 0 };
    expect(teamReady(ok)).toBe(true);
    expect(teamReady({ ...ok, pressA: 10.3 - TEAM.window - 0.1 })).toBe(false);
    expect(teamReady({ ...ok, dist: TEAM.range + 1 })).toBe(false);
    expect(teamReady({ ...ok, enemiesNear: 0 })).toBe(false);
    expect(teamReady({ ...ok, cooldown: 2 })).toBe(false);
    expect(teamReady({ ...ok, pressB: -Infinity })).toBe(false);
  });
});

describe('dual takedowns', () => {
  const goon = (x, o = {}) => ({ alive: true, pos: { x, z: 0 }, def: {}, ...o });
  it('needs both heroes beside the same stunned or floored goon', () => {
    const e = goon(0, { stunned: true });
    expect(dualTakedownTarget({ x: -1, z: 0 }, { x: 1, z: 0 }, [e])).toBe(e);
    expect(dualTakedownTarget({ x: -1, z: 0 }, { x: 5, z: 0 }, [e])).toBe(null);
    expect(dualTakedownTarget({ x: -1, z: 0 }, { x: 1, z: 0 }, [goon(0)])).toBe(null);
    expect(dualTakedownTarget({ x: -1, z: 0 }, { x: 1, z: 0 }, [goon(0, { down: true, def: { boss: true } })])).toBe(null);
    const near = goon(0.2, { down: true }), far = goon(1.5, { down: true });
    expect(dualTakedownTarget({ x: -1, z: 0 }, { x: 1, z: 0 }, [far, near])).toBe(near);
  });
});

describe('the comms wheel and marks', () => {
  it('slots run clockwise from the top, with a dead zone', () => {
    expect(commsSlot(0, -1)).toBe(0);
    expect(commsSlot(0, 0.1)).toBe(null);
    expect(commsSlot(0, 1)).toBe(Math.round(COMMS.length / 2) % COMMS.length);
    expect(commsSlot(1, 0)).toBe(Math.round(COMMS.length / 4));
  });
  it('one mark per kind per player, expiring, and a marked goon going down ends it', () => {
    const p = createPings();
    const g = { alive: true };
    p.add({ id: 'enemy', by: 0, target: g });
    p.add({ id: 'enemy', by: 0, target: { alive: true } });
    p.add({ id: 'here', by: 1, pos: { x: 0, y: 0, z: 0 } });
    expect(p.marks.length).toBe(2);
    p.update(PING_TTL.here + 0.1);
    expect(p.marks.length).toBe(0);
    p.add({ id: 'enemy', by: 0, target: g });
    g.alive = false;
    p.update(0.1);
    expect(p.marks.length).toBe(0);
  });
});

describe('the input filter', () => {
  it('passes everything through until a press is masked for the frame', () => {
    const src = createScriptedInput();
    const f = createInputFilter(src);
    src.tap('special');
    src.press('block');
    src.update();
    expect(f.pressed('special')).toBe(true);
    f.mask('special');
    expect(f.pressed('special')).toBe(false);
    expect(f.down('block')).toBe(true);
    f.clear();
    expect(f.pressed('special')).toBe(true);
    expect(f.move).toBe(src.move);
  });
});
