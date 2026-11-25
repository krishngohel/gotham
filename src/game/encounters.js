// Runs one fight at a time: spawns the goons where they wait, wakes them when the hero arrives,
// brings in later waves, and reports when the fight is won.
import { FIGHTS } from './fights.js';
import { SITES } from '../world/mapData.js';
import { scaleWave } from '../players/coopRules.js';

const siteOf = (f) => (typeof f.site === 'string' ? SITES[f.site] : f.site);

// getPlayerCount: heroes in the fight; co-op adds goons to every wave (src/players/coopRules.js).
export function createEncounters({ spawn, despawn, combat, events, collision, stealth = null, getPlayerCount = () => 1 }) {
  let fight = null;
  let def = null;
  let id = null;
  let wave = 0;
  let live = [];
  let dead = [];
  // Bodies of a fight already won, still in the scene: a finishing blow's slow-motion shot may be
  // flying one of them when the next fight begins straight away (n3 into the balcony room, a3 into
  // the catwalks). cleanupBodies() removes them on its normal timer, not begin().
  let lingering = [];
  let triggered = false;
  let nextWaveT = 0;

  function placeWave(index, awake) {
    const site = siteOf(fight);
    // Predator rooms keep their authored squads: their goons are placed on catwalks and routes.
    const entries = fight.stealth ? fight.waves[index] : scaleWave(fight.waves[index], getPlayerCount());
    const made = entries.map(({ type, dx, dz, y: wy, gang }) => {
      const x = site.x + dx, z = site.z + dz;
      // Stealth squads start on catwalks and balconies: look for the floor from their own height.
      const y = collision.groundBelow(x, (wy ?? site.y) + 3, z, 0.3);
      // [story] A night fight names its gang (the role figures wear its colours).
      return spawn(type, { x, y: y > -Infinity ? y : wy ?? site.y, z, gang: gang ?? fight.gang }, site); // [world-content] per-goon gang (a gang war's two crews)
    });
    live.push(...made);
    publish();
    if (awake) for (const e of made) e.wake();
    return made;
  }

  // Combat updates (and draws) every goon in its list, so bodies stay in it until despawned.
  function publish() { combat.setEnemies([...live, ...dead, ...lingering]); }

  // `keepWon`: the fight before was already won (fight is null), so its bodies linger instead.
  function clear({ keepWon = false } = {}) {
    stealth?.end();
    if (keepWon && !fight) { lingering.push(...dead); dead = []; }
    for (const e of [...live, ...dead]) despawn(e);
    live = []; dead = [];
    if (!keepWon) { for (const e of lingering) despawn(e); lingering = []; }
    publish();
  }

  // A lieutenant calls for backup (combatSystem's squad pass): a few more goons run in from the
  // fight's edge, into the wave in progress.
  events.on?.('callReinforcements', ({ pos, count = 2, type = 'grunt' } = {}) => {
    if (!fight || !triggered || fight.stealth || !pos) return;
    const site = siteOf(fight);
    const made = [];
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(pos.x - site.x, pos.z - site.z) + Math.PI + (i - (count - 1) / 2) * 0.6;
      const x = site.x + Math.sin(a) * 12, z = site.z + Math.cos(a) * 12;
      const y = collision.groundBelow(x, site.y + 3, z, 0.3);
      made.push(spawn(type, { x, y: y > -Infinity ? y : site.y, z }, site));
    }
    live.push(...made);
    publish();
    for (const e of made) e.wake();
    events.emit('reinforcements', { id, count: made.length });
  });

  return {
    get id() { return id; },
    get active() { return triggered && !!fight; },
    get enemies() { return live; },
    // Sets up a fight: goons wait at their spots until the hero shows up. `fightDef` defaults to
    // the story fight of that id; side content passes its own ({ site: key or {x,y,z}, radius, waves }).
    begin(fightId, fightDef = FIGHTS[fightId]) {
      clear({ keepWon: true });
      id = fightId;
      def = fightDef;
      fight = fightDef;
      wave = 0;
      triggered = false;
      const made = placeWave(0, false);
      // A predator room: the stealth runtime drives this squad (src/stealth/stealthSystem.js).
      // [story] A night's own predator room travels with its fight (src/story/rooms.js).
      if (fight.stealth) { if (fight.room) stealth?.begin(fight, made, fight.room); else stealth?.begin(fight, made); }
    },
    restart() {
      if (!id) return;
      this.begin(id, def);
    },
    end() { clear(); fight = null; id = null; def = null; triggered = false; },
    trigger() {
      if (!fight || triggered) return;
      triggered = true;
      if (!fight.stealth) for (const e of live) e.wake();
      events.emit('fightStart', { id });
    },
    // heroes: the hero, or every player's hero (co-op: any of them walking in starts the fight).
    update(dt, heroes) {
      if (!fight) return;
      const site = siteOf(fight);
      if (!triggered) {
        const list = Array.isArray(heroes) ? heroes : [heroes];
        for (let i = 0; i < list.length; i++) {
          const hero = list[i];
          if (!hero || hero.dead) continue;
          const d = Math.hypot(hero.pos.x - site.x, hero.pos.z - site.z);
          if (d < fight.radius && Math.abs(hero.pos.y - site.y) < 7) { this.trigger(); break; }
        }
        // Getting hit (or hitting someone) also starts the fight. In a predator room a silent
        // takedown or perch drop from the room's edge (or from a gargoyle above) counts too.
        if (live.some((e) => e.aware || (fight.stealth && !e.alive))) this.trigger();
        return;
      }
      // A medic got a knocked-out goon back up (src/actors/enemy.js revive): he is in the fight again.
      if (dead.length) for (let i = dead.length - 1; i >= 0; i--) if (dead[i].alive) live.push(dead.splice(i, 1)[0]);
      // Move KO'd goons out of the active list.
      for (const e of live) if (!e.alive) dead.push(e);
      const before = live.length;
      live = live.filter((e) => e.alive);
      if (live.length !== before) publish();
      if (live.length === 0) {
        if (wave + 1 < fight.waves.length) {
          nextWaveT += dt;
          if (nextWaveT > 1.4) {
            nextWaveT = 0;
            wave += 1;
            const made = placeWave(wave, true);
            events.emit('wave', { id, wave, count: made.length });
          }
        } else {
          // Clear the id before announcing the win: listeners may begin the next fight.
          const done = id;
          if (fight.stealth) stealth?.end();
          fight = null;
          id = null;
          triggered = false;
          events.emit('fightDone', { id: done });
        }
      }
    },
    // Removes the bodies of fights already won. A fight still running keeps its own bodies, so the
    // 5 s timer from the fight before cannot take away a room goon knocked out in the first 5 s.
    cleanupBodies() {
      for (const e of lingering) despawn(e);
      lingering = [];
      if (!fight) { for (const e of dead) despawn(e); dead = []; }
    },
  };
}
