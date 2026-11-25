// A shared base for a villain boss on the framework: the model loads lazily, the villain holds an
// arena, picks targets with the anti-kite rule (src/bosses/rules.js) and runs the phase the def
// describes. Each specific boss (penguin.js, riddler.js, scarecrow.js, freeze.js) passes its own
// `phase` hooks; this file supplies the plumbing so each of those stays about its mechanic.
//
//   makeVillainBoss({ id, name, villain, model, site, arena, colors, phases, intro, outro, lines,
//                     setup(ctx, b), phase: { [phaseId]: { enter(b), update(dt, b), exit(b) } } })
// `b` (the boss handle the hooks get): { actor, e, ctx, target, punish, heroes, tier, players,
//   phase, inPhase (settable), next() (phase done), win(), say(), arena, site, rng, t }
import { createBossActor, loadVillain } from '../actor.js';
import { createTargeting } from '../rules.js';

export function makeVillainBoss(spec) {
  return (deps) => ({
    id: spec.id, name: spec.name, villain: spec.villain, model: spec.model, site: spec.site, colors: spec.colors, gang: spec.gang, act: spec.act,
    phases: spec.phases, intro: spec.intro ?? null, outro: spec.outro ?? null,
    // [story2] the night simulator's hint for this boss (scripts/night-sim.mjs) and its replicable hazards
    sim: spec.sim ?? null,
    async create(ctx) {
      const ch = await loadVillain(deps.assets, spec.model);
      // [story2] a second (third...) figure for a dual boss, loaded before setup
      const extras = {};
      for (const m of spec.extraModels ?? []) extras[m] = await loadVillain(deps.assets, m);
      const centre = ctx.site ? ctx.site(spec.site) : null;
      const arena = spec.arena ? { ...spec.arena } : centre ? { x: centre.x, y: centre.y, z: centre.z, r: 14 } : null;
      const b = {
        ctx, deps, arena, extras, rng: deps.rng, t: 0, phase: 0, inPhase: 0, target: null, punish: null, done: false, data: {},
        get heroes() { return ctx.heroes().filter((h) => !h.dead); },
        get tier() { return ctx.tier; },
        get players() { return ctx.players().length; },
        say: (text, secs) => actor.say(text, secs),
        next() {
          hooks()?.exit?.(b);
          if (b.phase + 1 >= spec.phases.length) { b.win(); return; }
          b.phase += 1; b.inPhase = 0; b.t = 0;
          ctx.phaseDone(b.phase);
          hooks()?.enter?.(b);
        },
        win() {
          if (b.done) return;
          b.done = true;
          hooks()?.exit?.(b);
          spec.onWin?.(b); // [story2]
          deps.combat.setEnemies([]);
          deps.time?.slowMo?.(1.2, 0.3, 'world');
          b.actor.ch.animator.play('Death01', { once: true, fade: 0.1 });
          setTimeout(() => ctx.defeated(), 1500);
        },
      };
      const actor = createBossActor({ ch, id: spec.id, scene: deps.scene, arena, events: deps.events, hud: deps.hud, combat: deps.combat, rng: deps.rng, lines: spec.lines ?? {}, onWindowClosed: () => hooks()?.windowClosed?.(b) });
      b.actor = actor;
      b.e = actor.e;
      const targeting = createTargeting(spec.targeting ?? {});
      const hooks = () => spec.phase[spec.phases[b.phase]?.id];
      // The combat system drives him as an enemy (aggro, counters, hit reactions).
      actor.e.update = (dt, ectx) => {
        b.t += dt;
        b.target = targeting.update(dt, actor.pos, b.heroes) ?? deps.hero;
        b.punish = targeting.punish;
        b.ectx = ectx;
        if (!actor.tick(dt, ectx, b.target)) hooks()?.update?.(dt, b);
        actor.ch.animator.update(dt);
      };
      spec.setup?.(ctx, b);
      return {
        begin(phase = 0) {
          b.phase = phase; b.inPhase = 0; b.t = 0; b.done = false;
          const p = spec.start ? ctx.site(spec.start) ?? centre : centre;
          actor.place(p ?? deps.hero.pos, 0);
          actor.show(true);
          targeting.reset();
          deps.combat.setEnemies([actor.e]);
          hooks()?.enter?.(b);
        },
        update(dt) {
          // Phases that run while he is off the combat list (a puzzle, a hunt) still tick.
          if (!deps.combat.enemies.includes(actor.e)) { b.t += dt; b.target = targeting.update(dt, actor.pos, b.heroes) ?? deps.hero; hooks()?.idle?.(dt, b); actor.ch.animator.update(dt); }
        },
        restart(phase) {
          hooks()?.exit?.(b);
          deps.encounters?.end?.();
          this.begin(phase);
        },
        hide() { hooks()?.exit?.(b); spec.hide?.(b); actor.hide(); deps.combat.setEnemies(deps.combat.enemies.filter((x) => x !== actor.e)); },
        get phase() { return b.phase; },
        get inPhase() { return b.inPhase; },
        get speech() { return actor.speech; },
        headWorld: (out) => actor.headWorld(out),
        debugPhase() { b.next(); },
        debugWin() { b.win(); },
        get handle() { return b; },
        // [story2] Online: the def's own hazard timers in plain data (bosses.snapshot), and back.
        hazards: () => (spec.hazards ? spec.hazards(b) : null),
        applyHazards: (h) => { if (h && spec.applyHazards) spec.applyHazards(b, h); },
      };
    },
  });
}

// A boss that brawls: approach, a counterable swing (blue) every few seconds, a dodge-only one
// (red) mixed in; two counters in a row open a window. Phases can reuse it as their update.
export function brawl(dt, b, { counters = 2, windup = 0.6, every = [1.2, 2.2], redChance = 0.3, kind = 'joker', openFor = 4 } = {}) {
  const { actor, e } = b;
  b.data.cool = (b.data.cool ?? 1) - dt;
  const tgt = b.target;
  if (!tgt) return;
  const d = actor.moveTo(tgt.pos, dt, { speed: 3.4, stop: 2.1 });
  actor.face(tgt.pos, 8, dt);
  if (d <= 2.4 && b.data.cool <= 0) {
    const red = b.rng.next() < redChance;
    actor.melee({ kind, windup: windup * b.tier.tell, counter: !red });
    b.data.cool = every[0] + b.rng.next() * (every[1] - every[0]);
  }
  e.onCountered = () => {
    b.data.countered = (b.data.countered ?? 0) + 1;
    if (b.data.countered >= counters) { b.data.countered = 0; actor.open(openFor * b.tier.window); }
  };
}
