// Texture for the time between beats (research doc 6.4, pacing rules 1 and 2):
//   title       an act or chapter title as a card while she moves (no full-screen page, no stop)
//   banter      lines that play once the step has run a while with the radio quiet
//   interrupts  an optional fight on the way (a rooftop lookout, a mugging): it starts only when a
//               hero passes close by, never blocks the step, and is worth XP and an optional tick
//   preview     during a fight's last wave the corner objective adds what comes next, so the next
//               objective is known before the current one ends
// Interrupt fights run on the same encounter runner as the story (one fight at a time), only while
// it is free, and a story fight starting simply clears them.
const BANTER_AFTER = 14; // seconds into a travel step, radio quiet, before banter
const TRAVEL = new Set([undefined, 'reach', 'interior', 'board', 'collect']);

export function createTravel({ hud, radio, events, encounters, collision, standing, site, fightDef, onOptional }) {
  let step = null, age = 0, quiet = 0, banterAt = 0, armed = [], previewed = false, wave = 0, waves = 0;
  let interruptLive = null;

  events.on('wave', ({ id, wave: w }) => { if (step?.type === 'fight' && id === step.fight) wave = w; });
  events.on('fightDone', ({ id }) => {
    if (interruptLive && id === interruptLive.fightId) {
      const it = interruptLive;
      interruptLive = null;
      onOptional?.(it.id, { xp: it.xp ?? 60, label: it.label ?? 'Optional: route cleared' });
    }
  });

  function resolveInterrupt(it) {
    const base = fightDef(it.fight);
    if (!base) return null;
    const at = typeof it.at === 'string' ? site(it.at) : it.at;
    if (!at) return null;
    // A rooftop lookout stands on the roof under its x, z; a street crime on the street.
    let y = at.y ?? 0;
    if (collision?.groundBelow) {
      const g = collision.groundBelow(at.x, it.roof ? 160 : (at.y ?? 0) + 3, at.z, 0.3);
      if (g > -Infinity) y = g;
    }
    return { ...base, site: { x: at.x, y, z: at.z } };
  }

  return {
    enter(s, { next = null } = {}) {
      step = s; age = 0; quiet = 0; previewed = false; wave = 0;
      if (s.type === 'fight' || s.type === 'boss') interruptLive = null;
      banterAt = s.banter?.length ? BANTER_AFTER : Infinity;
      armed = TRAVEL.has(s.type) ? [...(s.interrupts ?? [])] : [];
      waves = s.type === 'fight' ? fightDef(s.fight)?.waves?.length ?? 1 : 0;
      this.next = next;
      if (s.title) hud.card?.(s.title.text, s.title.sub ?? '', 4200);
    },
    next: null,
    update(dt) {
      if (!step) return;
      age += dt;
      quiet = radio?.playing ? 0 : quiet + dt;
      // Banter: one beat, once the step has run a while and the radio has been quiet for 4 s.
      if (age > banterAt && quiet > 4) {
        banterAt = Infinity;
        radio?.say(step.banter);
      }
      // Interrupts: armed until a hero passes within the radius (and the encounter runner is free).
      if (armed.length && !encounters.id) {
        const heroes = standing();
        for (let i = armed.length - 1; i >= 0; i--) {
          const it = armed[i];
          const at = typeof it.at === 'string' ? site(it.at) : it.at;
          if (!at) { armed.splice(i, 1); continue; }
          if (!heroes.some((h) => Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < (it.radius ?? 25))) continue;
          const def = resolveInterrupt(it);
          armed.splice(i, 1);
          if (!def) continue;
          encounters.begin(it.fight, def);
          interruptLive = { id: it.id, fightId: it.fight, xp: it.xp, label: it.label };
          if (it.lines?.length) radio?.say(it.lines);
          events.emit('dispatch', { kind: 'interrupt', id: it.id });
          break;
        }
      }
      // Preview the next objective once a fight is down to its last wave.
      if (!previewed && step.type === 'fight' && this.next?.text && waves && wave >= waves - 1 && encounters.active) {
        const alive = encounters.enemies?.filter((e) => e.alive).length ?? 0;
        if (alive <= 2) {
          previewed = true;
          hud.setObjective?.(`${step.text}   Next: ${this.next.text}`);
        }
      }
    },
    // A story fight is starting: an interrupt in progress is simply dropped (begin() clears it).
    get interrupting() { return !!interruptLive; },
    clearInterrupt() { interruptLive = null; },
    reset() { step = null; armed = []; interruptLive = null; },
  };
}
