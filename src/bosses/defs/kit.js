// Shared pieces for the Act IV and V bosses (workstream J2): damage that goes through the hero's
// own health and the 'heroHurt' event, world markers for telegraphed hazards (a disc that grows,
// then bites), per-view meters, and the window bookkeeping every phase uses.
import { createMarkers } from '../../story/markers.js';
import { createViewFx } from '../../story/viewFx.js';
import { withPlayer } from '../../core/events.js';

export function bossKit(ctx, b) {
  const D = b.deps;
  const markers = D.scene ? createMarkers(D.scene) : { place: () => null, release() {}, releaseAll() {}, update() {}, color() {}, flash() {} };
  const fx = createViewFx({ hud: D.hud, players: () => ctx.players() });
  const hazards = [];
  const kit = {
    markers, fx, hazards,
    // Damage a hero (scaled by the tier); a dodge or a revive's grace ignores it.
    dose(h, amount, kind = 'buzzer') {
      if (!h || h.dead || h.invulnerable > 0) return false;
      const dmg = Math.max(1, Math.round(amount * b.tier.damage));
      h.health = Math.max(0, h.health - dmg);
      D.events.emit('heroHurt', withPlayer({ kind, damage: dmg }, h.player ?? null));
      if (h.health <= 0) { if (h === D.hero || !D.combat?.fighterFor) D.combat?.killHero?.(); else D.combat.fighterFor(h)?.killHero?.(); }
      return true;
    },
    // A telegraphed disc at p: grows for `grow` seconds (times the tier's tell), then bites everyone
    // within r once (onBite(hero)), then fades. Returns the hazard.
    disc(p, { r = 3.4, grow = 1.6, color = 0xc8323c, onBite = null, linger = 0.6, tag = 'disc' } = {}) {
      const hz = { p: { x: p.x, y: p.y, z: p.z }, r, t: 0, grow: grow * b.tier.tell, linger, onBite, bit: false, tag, m: markers.place('plate', p, { color, scale: 0.3 }) };
      hazards.push(hz);
      return hz;
    },
    tick(dt, heroes = b.heroes) {
      markers.update(dt);
      for (let i = hazards.length - 1; i >= 0; i--) {
        const hz = hazards[i];
        hz.t += dt;
        if (hz.m?.mesh) hz.m.mesh.scale.setScalar(0.3 + (hz.r / 1.6) * Math.min(1, hz.t / hz.grow));
        if (!hz.bit && hz.t >= hz.grow) {
          hz.bit = true;
          if (hz.m) markers.color(hz.m, 0xffffff);
          for (const h of heroes) if (Math.hypot(h.pos.x - hz.p.x, h.pos.z - hz.p.z) < hz.r && Math.abs(h.pos.y - hz.p.y) < 2.5) hz.onBite?.(h);
          hz.onBurst?.();
        }
        if (hz.t > hz.grow + hz.linger) { markers.release(hz.m); hazards.splice(i, 1); }
      }
    },
    clear() { for (const hz of hazards) markers.release(hz.m); hazards.length = 0; markers.releaseAll(); fx.clear(); },
    // Plain data for bosses.snapshot() (online replication).
    netHazards: () => hazards.map((h) => [Math.round(h.p.x * 10) / 10, Math.round(h.p.z * 10) / 10, Math.round(h.t * 100) / 100, h.tag]),
  };
  return kit;
}

// Windows per phase: count them, move on when the phase has had its share.
export function windowsDone(b, needed) {
  b.data.windows = (b.data.windows ?? 0) + 1;
  b.inPhase = Math.min(0.99, b.data.windows / needed);
  if (b.data.windows >= needed) { b.data.windows = 0; b.next(); return true; }
  return false;
}

export const dist2 = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
