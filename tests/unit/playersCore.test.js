import { describe, it, expect } from 'vitest';
import { createPlayer, createPlayers } from '../../src/players/players.js';
import { botDecide, createBotDriver } from '../../src/players/bot.js';
import { createScriptedInput } from '../../src/core/input.js';
import { createTimeControl } from '../../src/core/time.js';
import { withPlayer } from '../../src/core/events.js';

describe('players list', () => {
  it('the Player record has the contract fields; adding points hero.player back and sets the time mode', () => {
    const time = createTimeControl();
    const players = createPlayers({ time });
    const hero = { pos: { x: 0, z: 0 }, dead: false };
    const p = players.add(createPlayer({ id: 0, kit: { id: 'm' }, hero, input: {} }));
    for (const k of ['id', 'slot', 'local', 'kit', 'hero', 'input', 'view', 'fighter', 'hudSlot']) expect(k in p).toBe(true);
    expect(hero.player).toBe(p);
    expect(time.playerCount).toBe(1);
    const q = players.add(createPlayer({ id: 1, kit: { id: 'f' }, hero: { pos: { x: 1, z: 0 }, dead: true }, input: {} }));
    expect(time.playerCount).toBe(2);
    expect(players.standing()).toEqual([p]);
    expect(players.byId(1)).toBe(q);
    players.remove(q);
    players.remove(p); // player 0 never leaves
    expect(players.count).toBe(1);
    expect(time.playerCount).toBe(1);
  });
  it('events carry the player without changing what the payload compares or serialises to', () => {
    const p = { id: 3 };
    const d = withPlayer({ count: 2 }, p);
    expect(d.player).toBe(p);
    expect(d).toEqual({ count: 2 });
    expect(JSON.stringify(d)).toBe('{"count":2}');
  });
});

describe('dev bot', () => {
  const me = { pos: { x: 0, z: 0 }, dead: false };
  it('counters a wind-up aimed at it', () => {
    expect(botDecide({ me, enemies: [{ pos: { x: 2, z: 0 }, alive: true, aware: true, state: 'windup', mine: true }] }).action).toBe('block');
    expect(botDecide({ me, enemies: [{ pos: { x: 2, z: 0 }, alive: true, aware: true, state: 'windup', mine: false }] }).action).toBe('punch');
  });
  it('walks to a downed partner instead of fighting', () => {
    const d = botDecide({ me, partner: { pos: { x: 0, z: 10 }, dead: true }, enemies: [{ pos: { x: 2, z: 0 }, alive: true, aware: true, state: 'engage', mine: true }] });
    expect(d.action).toBe(null);
    expect(d.dz).toBeCloseTo(1);
  });
  it('closes on the nearest goon and punches when ready', () => {
    const d = botDecide({ me, enemies: [{ pos: { x: 5, z: 0 }, alive: true, aware: true, state: 'engage', mine: true }] });
    expect(d.dx).toBeCloseTo(1);
    expect(d.action).toBe('punch');
    expect(botDecide({ me, enemies: [{ pos: { x: 5, z: 0 }, alive: true, aware: true }], ready: false }).action).toBe(null);
  });
  it('drives a scripted input in camera space', () => {
    const input = createScriptedInput();
    const player = { input, hero: { pos: { x: 0, z: 0 }, dead: false }, fighter: {} };
    const cam = { forward: (v) => v.set(1, 0, 0), right: (v) => v.set(0, 0, -1) }; // camera looks down +x
    const drv = createBotDriver({ player, partner: null, combat: { enemies: [{ pos: { x: 6, z: 0 }, alive: true, aware: true, state: 'engage' }] }, cam, rng: () => 0 });
    drv.update(0.016);
    input.update();
    expect(input.move.y).toBeCloseTo(1); // the goon is straight ahead of the camera
    expect(input.pressed('punch')).toBe(true);
  });
});
