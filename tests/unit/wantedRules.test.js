import { describe, it, expect } from 'vitest';
import {
  LEVELS, MAX_LEVEL, OFFENCES, RESTRICTED, levelForPoints, witnessFactor, addOffence, modifiers, NEUTRAL,
  districtStance, gordonTrust, searchTime, searchDrain, createWantedState, stepWanted, setLevel, canCallOff,
  caughtStep, caughtOutcome, caughtPenalty, NONLETHAL, convertAttack, loseTime, RESPOND_TIME,
} from '../../src/wanted/rules.js';
import { canSee, inSearchlight, weatherFactor, worstSpot } from '../../src/wanted/witness.js';

// Runs the state machine for `secs` seconds in 0.1 s ticks with the same input.
function run(s, secs, input) {
  const log = [];
  for (let t = 0; t < secs; t += 0.1) log.push(...stepWanted(s, { dt: 0.1, ...input }));
  return log;
}

describe('levels and the rise table', () => {
  it('has six levels with rising thresholds and rising responses', () => {
    expect(LEVELS.length).toBe(6);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].pts).toBeGreaterThan(LEVELS[i - 1].pts);
      expect(LEVELS[i].officers).toBeGreaterThanOrEqual(LEVELS[i - 1].officers);
      expect(LEVELS[i].search).toBeGreaterThan(LEVELS[i - 1].search);
    }
    expect(LEVELS[3].roadblocks).toBeGreaterThan(0);
    expect(LEVELS[3].spikes).toBe(true);
    expect(LEVELS[4].heli).toBe(true);
    expect(LEVELS[3].heli).toBe(false);
    expect(LEVELS[5].bridges).toBe(true);
  });
  it('maps points to levels', () => {
    expect(levelForPoints(0)).toBe(0);
    expect(levelForPoints(0.99)).toBe(0);
    expect(levelForPoints(1)).toBe(1);
    expect(levelForPoints(6.5)).toBe(3);
    expect(levelForPoints(99)).toBe(MAX_LEVEL);
  });
  it('caps each offence: a dented bin never brings out the helicopter', () => {
    let p = 0;
    for (let i = 0; i < 100; i++) p = addOffence(p, 'collateral', { wit: 'police' });
    expect(levelForPoints(p)).toBe(OFFENCES.collateral.cap);
    // ...but ramming police keeps climbing to its own cap, past the bins.
    for (let i = 0; i < 100; i++) p = addOffence(p, 'ramPolice', { wit: null });
    expect(levelForPoints(p)).toBe(OFFENCES.ramPolice.cap);
    // and an offence never lowers what is already there
    expect(addOffence(p, 'collateral', { wit: 'police' })).toBe(p);
  });
  it('rate offences scale with dt', () => {
    const a = addOffence(0, 'reckless', { wit: 'police', dt: 0.5 });
    const b = addOffence(0, 'reckless', { wit: 'police', dt: 1 });
    expect(b).toBeCloseTo(a * 2);
  });
  it('restricted sites use their own points and caps; Wayne sites are not police business', () => {
    const bg = addOffence(0, 'trespass', { wit: 'police', site: 'blackgate' });
    const gc = addOffence(0, 'trespass', { wit: 'police', site: 'gcpd' });
    expect(bg).toBeGreaterThan(gc);
    expect(addOffence(0, 'trespass', { wit: 'police', site: 'wayne' })).toBe(0);
    expect(RESTRICTED.wayne.suspicion).toBeGreaterThan(0);
    let p = 0;
    for (let i = 0; i < 50; i++) p = addOffence(p, 'trespass', { wit: 'police', site: 'blackgate' });
    expect(levelForPoints(p)).toBe(RESTRICTED.blackgate.cap);
  });
});

describe('witnesses', () => {
  it('needs a witness: unseen offences count only when only police could suffer them', () => {
    expect(witnessFactor('collateral', null)).toBe(0);
    expect(witnessFactor('collateral', 'civilian')).toBeGreaterThan(0);
    expect(witnessFactor('collateral', 'civilian')).toBeLessThan(witnessFactor('collateral', 'police'));
    expect(witnessFactor('wrongWay', 'civilian')).toBe(0); // civilians don't phone in a wrong turn
    expect(witnessFactor('restrainOfficer', null)).toBe(1);
    expect(addOffence(0, 'publicFight', { wit: null })).toBe(0);
  });
  it('officers see in a cone, not through their backs; close is instant', () => {
    const o = { kind: 'officer', x: 0, y: 0, z: 0, yaw: 0 }; // facing +z
    expect(canSee(o, { x: 0, y: 0, z: 20 })).toBeGreaterThan(0);
    expect(canSee(o, { x: 0, y: 0, z: -20 })).toBe(-1);
    expect(canSee(o, { x: 0, y: 0, z: -2 })).toBeGreaterThan(0); // instant range, behind
    expect(canSee(o, { x: 0, y: 0, z: 60 })).toBe(-1); // too far
    expect(canSee({ ...o, stun: 2 }, { x: 0, y: 0, z: 10 })).toBe(-1); // smoked / stunned
    expect(canSee(o, { x: 0, y: 0, z: 10, hidden: true })).toBe(-1); // inside
  });
  it('street officers barely see dark rooftops; spotters and the helicopter do', () => {
    const roof = { x: 0, y: 20, z: 18 };
    expect(canSee({ kind: 'officer', x: 0, y: 0, z: 0, yaw: 0 }, roof, { night: 1 })).toBe(-1);
    expect(canSee({ kind: 'spotter', x: 0, y: 18, z: 0, yaw: 0 }, roof, { night: 1 })).toBeGreaterThan(0);
    expect(canSee({ kind: 'heli', x: 0, y: 45, z: 0, yaw: 0 }, roof, { night: 1 })).toBeGreaterThan(0);
    expect(canSee({ kind: 'heli', x: 0, y: 45, z: 0, yaw: 0 }, { ...roof, overhead: true })).toBe(-1);
  });
  it('fog and rain shorten sight', () => {
    expect(weatherFactor({ fog: 1 })).toBeLessThan(weatherFactor({ rain: 1 }));
    const o = { kind: 'officer', x: 0, y: 0, z: 0, yaw: 0 };
    const h = { x: 0, y: 0, z: 26 };
    expect(canSee(o, h, { night: 0 })).toBeGreaterThan(0);
    expect(canSee(o, h, { night: 1, fog: 1 })).toBe(-1);
  });
  it('the searchlight sees anyone in its spot unless they have cover', () => {
    const light = { x: 10, z: 10, r: 7 };
    expect(inSearchlight(light, { x: 12, y: 0, z: 12 })).toBe(true);
    expect(inSearchlight(light, { x: 30, y: 0, z: 12 })).toBe(false);
    expect(inSearchlight(light, { x: 12, y: 0, z: 12, overhead: true })).toBe(false);
    expect(inSearchlight(light, { x: 12, y: 0, z: 12, hidden: true })).toBe(false);
  });
  it('two hidden heroes drain at the slower one', () => {
    const s = worstSpot([{ safe: true, rooftop: false }, { safe: false, rooftop: true }]);
    expect(s.safe).toBe(false);
    expect(s.rooftop).toBe(false);
  });
});

describe('modifiers', () => {
  it('Gordon: good trust softens and can call it off; bad trust is harsher city-wide', () => {
    expect(gordonTrust(5)).toBe('good');
    expect(gordonTrust(0)).toBe('bad');
    const good = modifiers({ gordon: 5 }), bad = modifiers({ gordon: 0 }), fair = modifiers({ gordon: 2 });
    expect(good.gain).toBeLessThan(fair.gain);
    expect(bad.gain).toBeGreaterThan(fair.gain);
    expect(bad.units).toBeGreaterThan(fair.units);
    expect(good.callOff).toBe(true);
    expect(fair.callOff).toBe(false);
  });
  it('a story menace branding beats Gordon and keeps the city looking', () => {
    const m = modifiers({ gordon: 5, menace: true });
    expect(m.callOff).toBe(false);
    expect(m.minLevel).toBe(1);
    expect(m.gain).toBeGreaterThan(modifiers({ gordon: 5 }).gain);
  });
  it('districts: a cleaned-up one is friendlier; a corrupt precinct is hostile regardless', () => {
    expect(districtStance('loop', { stopped: 6, heat: 1 })).toBe('friendly');
    expect(districtStance('loop', { stopped: 0, heat: 3 })).toBe('neutral');
    expect(districtStance('narrows', { stopped: 20, heat: 0 })).toBe('hostile');
    expect(modifiers({ stance: 'hostile' }).gain).toBeGreaterThan(modifiers({ stance: 'friendly' }).gain);
  });
  it('a clean record excuses small offences, not big ones', () => {
    const m = modifiers({ record: 10 });
    expect(addOffence(0, 'collateral', { wit: 'police', mods: m })).toBeLessThan(addOffence(0, 'collateral', { wit: 'police' }));
    expect(addOffence(0, 'ramPolice', { wit: 'police', mods: m })).toBe(addOffence(0, 'ramPolice', { wit: 'police' }));
  });
  it('difficulty changes rise and search', () => {
    const r = modifiers({ difficulty: 'relaxed' }), h = modifiers({ difficulty: 'relentless' });
    expect(r.gain).toBeLessThan(h.gain);
    expect(searchTime(3, r)).toBeLessThan(searchTime(3, h));
  });
});

describe('the search and decay', () => {
  it('drains faster in safe places, not at all in the open at a manhunt', () => {
    expect(searchDrain(2, { safe: true })).toBeGreaterThan(searchDrain(2, {}));
    expect(searchDrain(3, { rooftop: true })).toBeGreaterThan(searchDrain(3, {}));
    expect(searchDrain(5, { rooftop: true, cover: true })).toBe(0);
    expect(searchDrain(5, { safe: true })).toBeGreaterThan(0);
    expect(searchDrain(4, {})).toBeLessThan(searchDrain(3, {}));
    expect(searchDrain(2, { districtChanged: true })).toBeGreaterThan(searchDrain(2, {}));
  });
  it('pursuit -> search (after losing sight) -> cooldown -> clear', () => {
    const s = createWantedState();
    s.points = addOffence(0, 'ramPolice', { wit: 'police' });
    let log = run(s, 0.2, { seen: true, seenAt: { x: 1, z: 2, district: 'loop' } });
    expect(s.level).toBe(2);
    expect(s.state).toBe('pursuit');
    expect(log).toContain('level:0:2');
    expect(s.lkp).toEqual({ x: 1, z: 2 });
    log = run(s, loseTime(2) + 0.3, { seen: false, spot: {} });
    expect(s.state).toBe('search');
    expect(s.search).toBeGreaterThan(0);
    // Seen again: back to the chase, timer refilled on the next loss.
    run(s, 0.2, { seen: true, seenAt: { x: 5, z: 5 } });
    expect(s.state).toBe('pursuit');
    log = run(s, loseTime(2) + searchTime(2) + 1, { seen: false, spot: {} });
    expect(log).toContain('state:cooldown');
    log = run(s, 7, { seen: false, spot: {} });
    expect(log).toContain('cleared');
    expect(s.level).toBe(0);
    expect(s.state).toBe('clear');
  });
  it('a fresh call gives the units time to arrive before the search starts', () => {
    const s = createWantedState();
    s.points = addOffence(0, 'carjack', { wit: 'civilian' });
    s.points = addOffence(s.points, 'ramPolice', { wit: 'police' });
    run(s, loseTime(2) + 1, { seen: false, spot: {} });
    expect(s.state).toBe('pursuit');
    run(s, RESPOND_TIME + 1, { seen: false, spot: {} });
    expect(s.state).toBe('search');
  });
  it('the level never falls during the chase, only when the search ends', () => {
    const s = createWantedState();
    setLevel(s, 3);
    run(s, 30, { seen: true, seenAt: { x: 0, z: 0 } });
    expect(s.level).toBe(3);
  });
  it('level 5 only ends by going to ground', () => {
    const s = createWantedState();
    setLevel(s, 5);
    run(s, 200, { seen: false, spot: { rooftop: true } });
    expect(s.state).toBe('search');
    expect(s.level).toBe(5);
    run(s, 200, { seen: false, spot: { safe: true } });
    expect(s.level).toBe(0);
  });
  it('a menace branding floors the level at Noticed', () => {
    const s = createWantedState();
    const mods = modifiers({ menace: true });
    setLevel(s, 2);
    run(s, 200, { seen: false, spot: { safe: true }, mods });
    expect(s.level).toBe(1);
  });
  it('Gordon can call off levels 1-2, never higher, never a scripted level', () => {
    const s = createWantedState();
    const good = modifiers({ gordon: 5 });
    setLevel(s, 2);
    s.state = 'search';
    expect(canCallOff(s, good)).toBe(true);
    setLevel(s, 3); s.state = 'search';
    expect(canCallOff(s, good)).toBe(false);
    setLevel(s, 1, { scripted: true });
    expect(canCallOff(s, good)).toBe(false);
  });
  it('the setting off clears it, but scripted story levels still play', () => {
    const s = createWantedState();
    setLevel(s, 3);
    run(s, 0.2, { enabled: false });
    expect(s.level).toBe(0);
    setLevel(s, 3, { scripted: true });
    run(s, 0.2, { enabled: false, seen: true, seenAt: { x: 0, z: 0 } });
    expect(s.level).toBe(3);
  });
  it('suspended holds everything', () => {
    const s = createWantedState();
    setLevel(s, 2);
    s.suspended.push('cutscene');
    run(s, 100, { seen: false });
    expect(s.state).toBe('pursuit');
  });
});

describe('caught', () => {
  it('fills when held or surrounded while slow, drains when struggling or free', () => {
    let m = 0;
    for (let i = 0; i < 20; i++) m = caughtStep(m, { dt: 0.1, near: 2, slow: true, level: 2 });
    expect(m).toBeGreaterThan(0.5);
    const held = m;
    for (let i = 0; i < 5; i++) m = caughtStep(m, { dt: 0.1, near: 2, slow: true, struggle: true, level: 2 });
    expect(m).toBeLessThan(held);
    for (let i = 0; i < 50; i++) m = caughtStep(m, { dt: 0.1, level: 2 });
    expect(m).toBe(0);
    expect(caughtStep(0, { dt: 1, near: 3, slow: true, level: 0 })).toBe(0);
  });
  it('good trust: a warning; otherwise the holding cell (never a game over)', () => {
    expect(caughtOutcome({ gordon: 5, level: 2 })).toBe('warning');
    expect(caughtOutcome({ gordon: 5, level: 4 })).toBe('cell');
    expect(caughtOutcome({ gordon: 5, level: 2, menace: true })).toBe('cell');
    expect(caughtOutcome({ gordon: 1, level: 1 })).toBe('cell');
    const p = caughtPenalty('cell', { level: 3, identityRisk: true });
    expect(p.hours).toBeGreaterThan(0);
    expect(p.rep).toBeLessThan(0);
    expect(p.suspicion).toBeGreaterThan(0);
    expect(p.gadgetLock).toBeGreaterThan(0);
    expect(caughtPenalty('cell', { level: 3 }).suspicion).toBe(0);
  });
});

describe('the rule that keeps this Batman: no harm to police', () => {
  it('every attack on every kind of unit deals zero damage', () => {
    for (const kind of Object.keys(NONLETHAL)) {
      for (const attack of Object.keys(NONLETHAL[kind])) expect(convertAttack(kind, attack).dmg).toBe(0);
      expect(convertAttack(kind, 'somethingNew').dmg).toBe(0);
    }
  });
  it('strikes on officers become restraint, stuns and disarms that cost attention', () => {
    expect(convertAttack('officer', 'punch').outcome).toBe('zipTie');
    expect(convertAttack('officer', 'punch').restrain).toBe(true);
    expect(convertAttack('officer', 'cape').outcome).toBe('capeStun');
    expect(convertAttack('officer', 'bolas').offence).toBe('stunOfficer');
    for (const a of Object.values(NONLETHAL.officer)) if (a.offence) expect(OFFENCES[a.offence]).toBeTruthy();
  });
  it('the Batmobile immobilises and shoves police cars, never destroys them', () => {
    expect(convertAttack('vehicle', 'cannon').outcome).toBe('refused');
    expect(convertAttack('vehicle', 'riotRound').outcome).toBe('immobilise');
    expect(convertAttack('vehicle', 'emp').outcome).toBe('immobilise');
    expect(convertAttack('vehicle', 'ram').outcome).toBe('shove');
    for (const a of Object.values(NONLETHAL.vehicle)) expect(['shove', 'immobilise', 'refused', 'glue', 'tyre']).toContain(a.outcome);
  });
  it('the helicopter can be made to lose you, never brought down', () => {
    expect(convertAttack('heli', 'disruptor').outcome).toBe('lost');
    expect(convertAttack('heli', 'grapplePull').outcome).toBe('none');
    expect(convertAttack('heli', 'cannon').outcome).toBe('refused');
  });
});
