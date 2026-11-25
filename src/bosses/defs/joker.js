// The Joker on the clock tower (Night One), ported onto the boss framework: the fight itself is
// still src/game/boss.js (three phases: balcony and buzzer tiles with goon waves, laughing gas and
// the batarang stun, counter chains for the finisher), untouched, so it plays exactly as before on
// every difficulty. The framework supplies the intro/outro comics, the music context, the phase
// checkpoint (boss.js's own restart keeps the phase reached) and the dev win hook. boss.js draws
// its own bar (legacyBar) with the generalised HUD's default name.
export function jokerDef(boss, { follow, hero }) {
  return {
    id: 'joker', name: 'THE JOKER', villain: 'joker', site: 'arena', legacyBar: true,
    phases: [{ id: 'balcony', name: 'The balcony' }, { id: 'gas', name: 'Laughing gas' }, { id: 'dance', name: 'The last dance' }],
    intro: 'bossIntro', outro: 'bossEnd',
    create(ctx) {
      return {
        begin() {
          boss.begin();
          // He opens from his balcony ten metres up: face him and tilt the camera up, then settle.
          const j = boss.joker?.pos;
          if (!j) return;
          const yaw = Math.atan2(j.x - hero.pos.x, j.z - hero.pos.z);
          hero.bat.face(yaw);
          follow?.snapBehind(yaw, -0.2);
          follow?.settlePitch?.(0.12, 2.5);
        },
        // boss.js is ticked by game.js itself (and emits bossDefeated); nothing to do here.
        update() {},
        restart() { boss.restart(); },
        hide() { boss.hide(); },
        get phase() { return Math.max(0, Math.min(2, boss.phase - 1)); },
        get inPhase() { return 0; },
        debugWin() { boss.debugFinish(); },
      };
    },
  };
}
