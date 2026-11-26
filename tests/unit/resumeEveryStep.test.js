// [m23] A save parked on any step of any campaign night resumes ON that step: the step is found by
// its id, the hero is put down at a real place, and never on the goal of the travel step she is
// resuming (which finished the step unplayed: the save came back one step further on, and the
// e2e "a save in the middle of Night Two resumes on its step" failed once the middle step was a
// travel step carrying the next beat's checkpoint).
import { describe, it, expect } from 'vitest';
import { allNights, stepsOf, STEP_ID, STEP_TYPES } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner, resumeCheckpoint, checkpointFor } from '../../src/story/runner.js';
import { sanitizeCampaign, CAMPAIGN_DEFAULT } from '../../src/story/campaignSave.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';

const later = allNights().filter((n) => n.id !== 'n1');
const finite = (p) => !!p && [p.x, p.y, p.z].every(Number.isFinite);

describe('resuming a save on every step of every night', () => {
  for (const n of later) {
    const steps = stepsOf(n);
    const site = (id) => (typeof id === 'object' ? id : n.sites?.[id] ?? SITES[id] ?? REGION_SITES[id] ?? null);
    it(`${n.id}: every step id survives the save and is found again`, () => {
      for (const s of steps) {
        expect(STEP_ID.test(s.id), s.id).toBe(true);
        expect(STEP_TYPES, `${s.id} type`).toContain(s.type ?? 'reach');
        const saved = sanitizeCampaign(JSON.parse(JSON.stringify({ ...CAMPAIGN_DEFAULT, night: n.id, stepId: s.id, nightsDone: ['n1'] })));
        expect(saved.night).toBe(n.id);
        expect(saved.stepId).toBe(s.id);
        // the runtime's lookup (storyRuntime.start): the step's index in the night's list
        const i = steps.findIndex((x) => x.id === saved.stepId);
        expect(i).toBeGreaterThanOrEqual(0);
        const r = createRunner(steps, i);
        expect(r.step).toBe(s);
        expect(r.missionOf()).toBe(s.mission);
      }
    });
    it(`${n.id}: every step resumes at a real place, and a travel step never on its own goal`, () => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.type === 'fight') {
          const f = n.fights[s.fight];
          const room = f.stealth ? n.rooms[f.stealth] : null;
          expect(finite(site(room ? room.entry : f.site)), `${s.id} fight place`).toBe(true);
          continue;
        }
        const cp = resumeCheckpoint(steps, i, { site, start: n.start });
        expect(finite(site(cp)), `${n.id} ${s.id} resumes at ${JSON.stringify(cp)}`).toBe(true);
        if (![undefined, 'reach', 'collect', 'interior'].includes(s.type) || !s.site) continue;
        const p = site(cp), goal = site(s.site);
        const onGoal = Math.hypot(p.x - goal.x, p.z - goal.z) < (s.radius ?? 8) && Math.abs(p.y - goal.y) < 6;
        if (!onGoal) continue;
        // The one case with nowhere else to stand: a night's opening walk to its own start site
        // (no checkpoint before it). It resumes at the night's start, as a new night begins there.
        const earlier = steps.slice(0, i).some((x) => x.checkpoint && x.checkpoint !== cp);
        expect(earlier, `${n.id} ${s.id}: resuming at ${JSON.stringify(cp)} would finish the step on the spot`).toBe(false);
        expect(cp, `${n.id} ${s.id}`).toBe(n.start);
      }
    });
  }
  it('the rule only steps back when it has to: a checkpoint away from the goal is kept as it is', () => {
    const site = (id) => ({ a: { x: 0, y: 0, z: 0 }, b: { x: 100, y: 0, z: 0 }, c: { x: 104, y: 0, z: 0 } }[id] ?? null);
    const steps = [{ id: 's0', checkpoint: 'a' }, { id: 's1', site: 'b', radius: 10, checkpoint: 'c' }, { id: 's2', type: 'scan', site: 'b', checkpoint: 'c' }, { id: 's3', site: 'b', radius: 10 }];
    expect(resumeCheckpoint(steps, 0, { site, start: 'a' })).toBe('a');
    expect(resumeCheckpoint(steps, 1, { site, start: 'a' })).toBe('a'); // its own checkpoint is on its goal
    expect(resumeCheckpoint(steps, 2, { site, start: 'a' })).toBe('c'); // not a reach step: untouched
    expect(resumeCheckpoint(steps, 3, { site, start: 'a' })).toBe('a'); // inherited checkpoint on the goal too
    expect(checkpointFor(steps, 1)).toBe('c'); // the plain rule (Night One's) is unchanged
  });
});
