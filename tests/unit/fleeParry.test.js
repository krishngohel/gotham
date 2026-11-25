// [fix1] A knife goon parries plain punches while he fights, but not while he runs for it (fear's
// flee): combatRoles.spec ended with a scared knife goon parrying every punch for a minute and more.
import { describe, it, expect } from 'vitest';
import { resolveHit, ENEMY } from '../../src/combat/rules.js';

const knife = (state) => ({ type: 'knife', def: ENEMY.knife, health: 4, alive: true, down: false, stunned: false, state });

describe('[fix1] parries and fleeing', () => {
  it('a fighting knife goon parries a punch', () => {
    expect(resolveHit('punch', knife('engage')).outcome).toBe('parried');
    expect(resolveHit('punch', knife('hit')).outcome).toBe('parried');
  });
  it('a fleeing one takes it', () => {
    const e = knife('flee');
    expect(resolveHit('punch', e).outcome).toBe('hit');
    expect(e.health).toBeLessThan(4);
  });
});
