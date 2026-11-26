// Poses for photo mode (workstream L1, item 7): any clip the photographer's character has loaded,
// held at a chosen point (scrub 0..1). DOM-free; works on the animator from src/actors/animator.js
// ({ mixer, clips, play, update, currentName, currentAction }).
//
// While a pose is held the animator's own play() and update() are swapped on that instance for
// stand-ins, so the hero's state machine (which asks for Idle_Loop every frame) can't fight the
// pose in a live co-op world. release() puts the real functions back and resumes the clip that
// was playing, from the same time.

import { LoopOnce } from 'three';

// Clips that read well as stills come first when the character has them; the rest follow A-Z.
export const POSE_FAVOURITES = [
  'Idle_Loop', 'Crouch_Idle_Loop', 'Idle_Shield_Loop', 'NinjaJump_Idle_Loop', 'Jump_Loop', 'Fall_Loop',
  'Sprint_Loop', 'Jog_Fwd_Loop', 'Spell_Simple_Shoot', 'Roll', 'Fly_Forward',
];
// Never offered: the bind pose and technical clips.
const HIDDEN = /^(A_TPose|T-?Pose|Bind|_)/i;

export function poseList(names) {
  const all = [...new Set([...names].filter((n) => typeof n === 'string' && n && !HIDDEN.test(n)))];
  const fav = POSE_FAVOURITES.filter((n) => all.includes(n));
  const rest = all.filter((n) => !fav.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...fav, ...rest];
}

export const poseLabel = (name) => (name ? name.replace(/_Loop$/, '').replace(/_/g, ' ') : 'Live');

export function createPoser(animator) {
  let held = null; // { name, action, scrub }
  let saved = null;
  let realPlay = null, realUpdate = null;
  const clips = animator?.clips;
  const names = () => (clips ? [...clips.keys()] : []);

  function apply() {
    const a = held.action;
    const d = a.getClip().duration || 0;
    a.time = Math.min(Math.max(0, held.scrub), 0.999) * d;
    a.timeScale = 0;
    animator.mixer.update(0);
  }

  return {
    get name() { return held?.name ?? null; },
    get scrub() { return held?.scrub ?? 0; },
    list: () => poseList(names()),
    hold(name, scrub = 0) {
      if (!animator || !clips?.has(name)) return false;
      if (!held) {
        const cur = animator.currentAction;
        saved = cur
          ? { name: animator.currentName, time: cur.time, timeScale: cur.timeScale, once: cur.loop === LoopOnce }
          : null;
        realPlay = animator.play;
        realUpdate = animator.update;
      }
      animator.mixer.stopAllAction();
      const action = realPlay.call(animator, name, { fade: 0.001, once: false });
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();
      held = { name, action, scrub };
      // Stand-ins while posed: the state machine's requests are ignored; the pose is re-applied.
      animator.play = () => held.action;
      animator.update = () => { animator.mixer.update(0); };
      apply();
      return true;
    },
    setScrub(s) {
      if (!held) return;
      held.scrub = Math.min(Math.max(0, s), 1);
      apply();
    },
    release() {
      if (!held) return;
      held = null;
      animator.play = realPlay;
      animator.update = realUpdate;
      animator.mixer.stopAllAction();
      if (saved?.name && clips.has(saved.name)) {
        const a = animator.play(saved.name, { fade: 0.001, once: saved.once, timeScale: saved.timeScale, startAt: saved.time });
        if (a && !a.isRunning?.()) { a.enabled = true; a.play(); }
      }
      animator.mixer.update(0);
      saved = null;
    },
  };
}
