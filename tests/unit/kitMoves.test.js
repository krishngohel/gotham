import { describe, it, expect } from 'vitest';
import { movesFor, BATMAN_MOVES, firstHad } from '../../src/combat/kitMoves.js';
import { KITS } from '../../src/heroes/roster.js';
import { createStrikeChooser } from '../../src/combat/strikeChoice.js';
import { ROLE_KIT, roleKit, roleClips, ROLE_NAMES, REACT_TABLE } from '../../src/enemies/roleKit.js';
import { ENEMY } from '../../src/combat/rules.js';
import { MOCAP_DATA as COMBAT2 } from '../../src/config/mocapData.combat2.js';
import { MOCAP_DATA as ENEMIES } from '../../src/config/mocapData.enemies.js';
import { MOCAP_DATA } from '../../src/config/mocapData.js';

describe('kit strike tables', () => {
  it("the roster's Batman kits read back as the upgraded Batman tables", () => {
    for (const kit of KITS) {
      const m = movesFor(kit);
      expect(m.cape[0]).toBe('Cape_Swirl');
      expect(m.throw[0]).toBe('Throw_Shoulder');
      expect(m.punchTiers).toEqual(BATMAN_MOVES.punchTiers);
    }
  });
  it('a kit with its own tables uses them; anything malformed falls back to Batman', () => {
    const m = movesFor({ moves: { punchTiers: [['Brawl_LeadHook'], ['Brawl_BackHook'], ['Brawl_JabElbow']], kicks: 'nope', finishers: { punch: ['Brawl_Eight'] }, cape: 42 } });
    expect(m.punchTiers[0]).toEqual(['Brawl_LeadHook']);
    expect(m.kicks).toEqual(BATMAN_MOVES.kicks);
    expect(m.finishers.punch).toEqual(['Brawl_Eight']);
    expect(m.finishers.kick).toEqual(BATMAN_MOVES.finishers.kick);
    expect(m.cape).toEqual(BATMAN_MOVES.cape);
    expect(movesFor(null)).toEqual(movesFor(undefined));
  });
  it('the chooser draws from a kit table and skips clips the build lacks', () => {
    const tables = movesFor({ moves: { punchTiers: [['A', 'B'], ['A'], ['A']], finishers: { punch: ['X', 'Y'] } } });
    const c = createStrikeChooser({ has: (n) => n !== 'X', random: () => 0, tables });
    expect(['A', 'B']).toContain(c.punch(1, 2));
    expect(c.punchFinisher()).toBe('Y');
    expect(firstHad(['X', 'Y'], (n) => n === 'Y')).toBe('Y');
  });
  it('every Batman table clip exists in the preloaded or combat pack data (or is code-authored)', () => {
    const known = (n) => !!(MOCAP_DATA[n] || COMBAT2[n] || ['Punch_Backfist', 'Punch_Hammer', 'Sword_Regular_B', 'Sword_Heavy_Combo', 'Roll', 'NinjaJump_Start', 'Hit_Head', 'Hit_Chest', 'Hit_Knockback'].includes(n));
    const all = [...BATMAN_MOVES.punchTiers.flat(), ...BATMAN_MOVES.kicks, ...BATMAN_MOVES.finishers.punch, ...BATMAN_MOVES.finishers.kick, ...BATMAN_MOVES.counters,
      ...BATMAN_MOVES.ground, ...BATMAN_MOVES.stomp, ...BATMAN_MOVES.beatdown, ...BATMAN_MOVES.travel.kick, ...BATMAN_MOVES.cape, ...BATMAN_MOVES.throw,
      ...Object.values(BATMAN_MOVES.dodge).flat(), ...Object.values(BATMAN_MOVES.reactLight).flat(), ...Object.values(BATMAN_MOVES.reactHeavy).flat()];
    for (const n of all) expect(known(n), n).toBe(true);
  });
});

describe('enemy roles', () => {
  it('every role has rules, a look, a tell and an answer; the old type names still work', () => {
    for (const r of ROLE_NAMES) {
      expect(ENEMY[r], r).toBeDefined();
      expect(ROLE_KIT[r].answer.length, r).toBeGreaterThan(10);
      expect(['blue', 'red']).toContain(ROLE_KIT[r].glyph);
    }
    for (const old of ['grunt', 'knife', 'brute', 'rifle']) expect(roleKit(old)).toBe(ROLE_KIT[old]);
    expect(roleKit('somethingElse')).toBe(ROLE_KIT.grunt);
  });
  it('unblockable or must-dodge roles show red; counterable ones blue', () => {
    for (const r of ROLE_NAMES) {
      if (ENEMY[r].ranged) continue;
      expect(ROLE_KIT[r].glyph === 'blue', r).toBe(!!ENEMY[r].counterable);
    }
  });
  it('role clips come from the enemy or combat packs', () => {
    for (const r of ROLE_NAMES) for (const c of roleClips(r)) expect(!!(ENEMIES[c] || COMBAT2[c]), `${r}: ${c}`).toBe(true);
    for (const n of Object.values(REACT_TABLE.knockdown)) expect(COMBAT2[n]).toBeDefined();
  });
  it('pack strikes used by roles carry a contact event (the hit fires from it)', () => {
    for (const r of ROLE_NAMES) for (const c of ROLE_KIT[r].attacks ?? []) expect(ENEMIES[c]?.events?.contact ?? COMBAT2[c]?.events?.contact, c).toBeTypeOf('number');
  });
});
