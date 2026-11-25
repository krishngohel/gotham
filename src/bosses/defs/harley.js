// Harley Quinn in the chemical hall (Night One), ported onto the boss framework as a watched fight:
// the fight is still the 'harleyHall' encounter (Harley plus her crew, src/combat/harleyLogic.js),
// unchanged; the framework adds her name bar (her health, read off the live enemy), the boss
// music context while she is up, and a framework entry for mission select and the docs.
export function harleyDef({ encounters }) {
  let her = null, max = 1;
  return {
    id: 'harley', name: 'HARLEY QUINN', villain: 'harley', site: 'aceHall',
    colors: ['#c8323c', '#16161c'],
    phases: [{ id: 'hall', name: 'The chemical hall' }],
    watch: {
      begin(ctx) { her = null; max = 1; this.ctx = ctx; },
      update() {
        if (!her) {
          her = encounters.enemies?.find((e) => e.type === 'harley') ?? null;
          if (!her) return encounters.active || !!encounters.id;
          max = Math.max(1, her.health);
        }
        const up = her.alive;
        this.ctx.hud.bossBar(up, Math.max(0, her.health) / max, 1, { name: 'HARLEY QUINN', phases: 1, colors: ['#c8323c', '#16161c'] });
        return up;
      },
    },
    // Not a boss step of its own: watched during the harleyFight step only.
    create() { return { begin() {}, update() {}, restart() {}, hide() {}, phase: 0, inPhase: 0 }; },
  };
}
