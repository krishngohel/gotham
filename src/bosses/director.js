// The boss framework (workstream J1). One director runs whichever boss a story step names:
//   { type: 'boss', boss: 'penguin' }  (Night One's bare 'boss' step is the Joker)
// It owns what every boss shares: the intro and outro comics, the HUD bar (name, phase pips,
// colours), checkpoints between phases (a death restarts the phase reached, never the whole
// fight), the music context (boss theme per villain), difficulty tiers and two-player targeting
// (src/bosses/rules.js), and adds through composeWave. Each boss is a def (src/bosses/defs/*.js):
//
//   def = { id, name, villain, site, colors, phases: [{ id, name }], intro, outro,
//           create(ctx) -> controller }      (create may return a Promise: models load lazily)
//   controller = { begin(phaseIndex), update(dt), restart(phaseIndex), hide(), debugWin(),
//                  get phase(), get inPhase() (0..1), get speechWorld?(out), get speech? }
//   ctx = { game deps, tier, players(), heroes(), hud, events, say(text), phaseDone(), defeated(),
//           adds(budget, opts), hurt(hero, kind), scenePages }
//
// A controller reports progress through ctx.phaseDone() (the director moves the checkpoint on)
// and ctx.defeated() (the director emits 'bossDefeated' { id }, the flow plays the outro and
// advances). Host-only online (coop-seams.md): the director runs where the story runs.
import { bossTier, barFraction } from './rules.js';
import { buildFight } from '../story/fightBuilder.js';

export function createBossDirector(deps) {
  const { hud, events, getDifficulty = () => 'normal', getPlayers = () => [], encounters = null, site = (s) => s } = deps;
  const DEFS = new Map();
  let def = null, ctrl = null, phase = 0, checkpoint = 0, active = false, pending = null, watching = null;
  // [story2] The boss stays in the combat list while his adds fight (encounters.publish() replaces
  // the list with the squad's goons): pinned until the phase ends, he hides or the fight restarts.
  let pinned = null, pinnedFight = null, resume = null, replica = null;
  const heroes = () => getPlayers().map((p) => p.hero);

  function bar() {
    if (!active || !def || !ctrl || def.legacyBar) return;
    hud.bossBar(true, barFraction(ctrl.phase ?? phase, def.phases.length, ctrl.inPhase ?? 0), (ctrl.phase ?? phase) + 1, { name: def.name, phases: def.phases.length, colors: def.colors });
  }

  const ctx = (d) => ({
    ...deps,
    def: d,
    get tier() { return bossTier(getDifficulty()); },
    get difficulty() { return getDifficulty(); },
    players: () => getPlayers(),
    heroes,
    say(text, secs = 2.5) { hud.speech?.(text); ctxSpeech = { text, t: secs }; },
    phaseDone(next) {
      pinned = null; pinnedFight = null;
      phase = next ?? phase + 1;
      checkpoint = phase;
      events.emit('bossPhase', { id: d.id, phase: phase + 1 });
      bar();
    },
    defeated() {
      active = false;
      hud.bossBar(false);
      setTimeout(() => events.emit('bossDefeated', { id: d.id }), 0);
    },
    // Adds: a squad from composeWave around the arena (scaled for co-op by encounters).
    adds(budget, { at = null, ring = 7, gang = d.gang, act = d.act ?? 2, id = `${d.id}Adds`, lead = null } = {}) {
      if (!encounters) return null;
      const centre = site(at ?? d.site);
      const t = bossTier(getDifficulty());
      const fight = buildFight(id, { site: centre, radius: 40, gang, act, waves: [{ budget: Math.max(1, Math.round(budget * t.adds)), ring, lead }] }, { difficulty: getDifficulty(), act });
      const boss = ctrl?.handle?.e ?? null;
      const listed = boss && deps.combat?.enemies?.includes(boss);
      encounters.begin(id, { ...fight, site: centre, bossAdds: true });
      encounters.trigger();
      if (listed) { pinned = boss; pinnedFight = id; keepPinned(); }
      return id;
    },
    hurt(h, kind = 'buzzer', from = null) {
      const C = deps.combat;
      const f = C?.fighterFor?.(h);
      if (f?.onAttackLand) f.onAttackLand(from, kind);
      else C?.onAttackLand?.(from, kind);
    },
  });
  let ctxSpeech = null;
  function keepPinned() {
    const C = deps.combat;
    if (!pinned || !C?.enemies || !active) return;
    if (ctrl?.handle?.done || !pinned.ch?.root?.visible) { pinned = null; pinnedFight = null; return; }
    if (!C.enemies.includes(pinned)) C.setEnemies([...C.enemies, pinned]);
  }
  // The replicable state of whichever boss is up: the Joker's bossNet shape ({ on, phase, bar })
  // plus the figure's pose and the def's own hazard timers (controller.hazards()).
  function snapshot() {
    if (!def || !ctrl) return { on: false };
    const h = ctrl.handle, e = h?.e, ch = h?.actor?.ch;
    const ph = ctrl.phase ?? phase;
    return {
      id: def.id, on: active, phase: ph, phases: def.phases.length, bar: barFraction(ph, def.phases.length, ctrl.inPhase ?? 0),
      name: def.name, colors: def.colors ?? null, villain: def.villain ?? null,
      pos: e ? [e.pos.x, e.pos.y, e.pos.z] : null, yaw: ch?.yaw ?? 0, visible: !!ch?.root?.visible,
      state: e?.state ?? null, glyph: e?.glyph ?? null, vulnerable: e?.vulnerable ?? 0, hits: e?.hits ?? 0,
      anim: ch?.animator?.currentName ?? null, speech: (ctrl.speech ?? ctxSpeech)?.text ?? null,
      tells: e?.attack ? { kind: e.attack.kind ?? null, counter: e.attack.counter !== false, ranged: !!e.attack.ranged, windup: e.windupDur ?? 0, t: e.t ?? 0 } : null,
      hazards: ctrl.hazards?.() ?? null,
    };
  }

  return {
    register(d) { DEFS.set(d.id, d); return d; },
    has: (id) => DEFS.has(id),
    def: (id) => DEFS.get(id) ?? null,
    get defs() { return [...DEFS.values()]; },
    get active() { return active; },
    get current() { return def; },
    get controller() { return ctrl; },
    get phase() { return ctrl?.phase ?? phase; },
    get villain() { return def?.villain ?? watching?.villain ?? null; },
    get watching() { return watching?.villain ?? null; },
    siteOf(id) { const d = DEFS.get(id); return d ? site(d.site) : null; },
    // Starts the boss a story step names (intro comic first, then phase 0, or the phase this save
    // last reached when it is the same boss).
    async begin(id, { step = null, playScene = null } = {}) {
      const d = DEFS.get(id);
      if (!d) { console.warn('unknown boss', id); return; }
      const same = def?.id === id;
      def = d;
      if (!same) { phase = 0; checkpoint = 0; }
      // [story2] A save made mid-fight resumes at the phase it reached (checkpoint after every phase).
      if (resume?.id === id) { phase = Math.max(0, Math.min(d.phases.length - 1, resume.phase)); checkpoint = phase; }
      resume = null;
      pending = (async () => {
        if (!ctrl || !same) ctrl = await d.create(ctx(d));
        if (d.intro && playScene) await playScene(d.intro);
        active = true;
        events.emit('bossStart', { id: d.id, villain: d.villain });
        await ctrl.begin(checkpoint, { step });
        bar();
      })();
      return pending;
    },
    // Before begin(): start this boss at a saved phase (the story runtime calls it on a resume).
    resumeAt(id, ph = 0) { resume = ph > 0 ? { id, phase: ph } : null; },
    snapshot,
    // A guest's copy (online): builds the def's figure without running its brain, then poses it,
    // and draws the bar, from the host's snapshot(). apply({ on: false }) hides it.
    async apply(snap) {
      if (!snap?.on || !snap.id || !DEFS.has(snap.id)) {
        if (replica) { replica.ctrl?.hide?.(); replica = null; }
        hud.bossBar(false);
        return;
      }
      if (replica?.id !== snap.id) {
        replica?.ctrl?.hide?.();
        const d = DEFS.get(snap.id);
        replica = { id: snap.id, def: d, ctrl: null };
        replica.ready = Promise.resolve(d.create(ctx(d))).then((c) => { if (replica?.id === snap.id) replica.ctrl = c; return c; });
      }
      const c = replica.ctrl ?? await replica.ready;
      const h = c?.handle;
      if (h?.actor && snap.pos) {
        h.actor.show(snap.visible !== false);
        h.actor.pos.set(snap.pos[0], snap.pos[1], snap.pos[2]);
        h.actor.ch.face(snap.yaw ?? 0);
        h.e.state = snap.state ?? 'idle'; h.e.glyph = snap.glyph ?? null; h.e.vulnerable = snap.vulnerable ?? 0;
        if (snap.anim) h.actor.ch.animator.play(snap.anim, { fade: 0.15 });
      }
      c?.applyHazards?.(snap.hazards);
      hud.bossBar(true, snap.bar ?? 1, (snap.phase ?? 0) + 1, { name: snap.name, phases: snap.phases, colors: snap.colors });
    },
    async outro(id, playScene) {
      const d = DEFS.get(id) ?? def;
      if (d?.outro && playScene) await playScene(d.outro);
      ctrl?.hide?.();
      hud.bossBar(false);
      active = false;
      pinned = null; pinnedFight = null;
      if (d === def) { def = null; phase = 0; checkpoint = 0; }
    },
    // A death mid-fight: back to the start of the phase reached (the checkpoint between phases).
    restart() {
      if (!ctrl || !def) return;
      phase = checkpoint;
      pinned = null; pinnedFight = null;
      ctrl.restart(checkpoint);
      bar();
    },
    // A fight step with a boss bar (Harley in Night One): the def watches the fight's enemies.
    watch(id) {
      const d = DEFS.get(id);
      if (!d?.watch) return;
      watching = d;
      d.watch.begin?.(ctx(d));
    },
    update(dt) {
      if (watching) { if (watching.watch.update(dt) === false) { watching = null; hud.bossBar(false); } }
      if (ctxSpeech) { ctxSpeech.t -= dt; if (ctxSpeech.t <= 0) { ctxSpeech = null; if (!def?.legacyBar) hud.speech?.(null); } }
      if (replica?.ctrl?.handle) replica.ctrl.handle.actor.ch.animator.update(dt);
      if (!active || !ctrl) return;
      ctrl.update?.(dt);
      keepPinned();
      bar();
    },
    get speech() { return ctrl?.speech ?? ctxSpeech; },
    headWorld(out) { return ctrl?.headWorld?.(out) ?? null; },
    // Dev and the playthrough: finish the boss through its own defeat path.
    debugWin() { if (ctrl?.debugWin) ctrl.debugWin(); },
    debugPhase() { if (ctrl?.debugPhase) ctrl.debugPhase(); },
    abort() { ctrl?.hide?.(); active = false; hud.bossBar(false); def = null; ctrl = null; watching = null; pinned = null; pinnedFight = null; },
    // [net2] An online guest's copy of a boss (src/net/game/bossNet.js): the def's model and body,
    // no phase logic (the host's snapshots pose it). Resolves to its combat-enemy object, or null
    // for a boss with no body of its own (the Joker rides on boss.js).
    async puppet(id) {
      const d = DEFS.get(id);
      if (!d) return null;
      if (def?.id !== id || !ctrl) { def = d; phase = 0; checkpoint = 0; ctrl = await d.create(ctx(d)); }
      return ctrl?.handle?.actor?.e ?? null;
    },
    // [net2] The bar a guest draws (the host's fight state): { id, name, phases, phase, inPhase, colors }.
    get barState() { return active && def && ctrl && !def.legacyBar ? { id: def.id, name: def.name, phases: def.phases.length, phase: ctrl.phase ?? phase, inPhase: ctrl.inPhase ?? 0, colors: def.colors ?? null } : null; },
    // Dev and the night simulator: what a scripted player should do against this boss right now
    // (the def's sim(b) -> { goTo?, action?, hold? } or null: just fight).
    simHint() { const h = ctrl?.handle; return active && h && def?.sim ? def.sim(h) : null; },
  };
}
