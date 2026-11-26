// [m45] Night Four's "Friendly Fire": the rules of an `hunted` step, pure (no DOM, no three.js).
// The story raises the police response outright (the cordon breathed the toxin and sees a monster)
// and the step ends when the heroes have lost them. Being caught is a retry, never a cell; a run
// that keeps failing, or goes on too long, is called off by Gordon so the night can never stall.
//
//   level        the scripted police level the step starts at
//   softLevel    the level after `softenAfter` failed attempts (Gordon has pulled some off the line)
//   callOffAfter failed attempts after which the next one is called off at once
//   maxTime      seconds of one attempt before Gordon calls it off
//   degrade      seconds the step lasts with no police system at all (tests, a stripped build)
export const HUNTED = { level: 3, softLevel: 2, softenAfter: 1, callOffAfter: 3, maxTime: 210, degrade: 2 };

export const huntedRules = (step = {}) => ({ ...HUNTED, ...(step.hunted ?? {}), ...(step.level != null ? { level: step.level } : {}), ...(step.maxTime != null ? { maxTime: step.maxTime } : {}) });

// The level this attempt starts at.
export function huntedLevel(fails, rules = HUNTED) {
  return fails >= rules.softenAfter ? Math.min(rules.level, rules.softLevel) : rules.level;
}

// What the step should do now.
//   run: { t (seconds into this attempt), fails (attempts lost so far), armed (the level was raised) }
//   police: { present, level, state } as window.__game.wanted reports them
// -> 'run' | 'escaped' | 'caught' | 'calledOff'
export function huntedVerdict(run, police, rules = HUNTED) {
  if (!police?.present) return run.t >= rules.degrade ? 'escaped' : 'run';
  if (run.fails >= rules.callOffAfter) return 'calledOff';
  if (police.state === 'caught' || police.state === 'custody') return 'caught';
  if (run.armed && police.level === 0) return 'escaped';
  if (run.t >= rules.maxTime) return 'calledOff';
  return 'run';
}
