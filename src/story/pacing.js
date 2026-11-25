// Pacing report for a step list (pure): how much of a night takes the controls away, how often the
// story stops her, and how many camera cuts it makes. Used by scripts/story-walk.mjs and
// scripts/pacing.mjs to measure the J1 pacing pass, and by the campaign tests to keep later nights
// honest (research doc 6.4: no stop-and-listen radio step on its own).
//
// Definitions:
//   hard stop     a step that takes the controls or leaves her with nothing to do: a cutscene
//                 (comic page or cinematic), a stand-alone radio step (no marker, wait for the
//                 lines), a cinematic on any step
//   no agency (s) comic panels x PANEL_S, cinematic shot time + the 0.7 s hand-back, the lines of a
//                 stand-alone radio step at the radio's own pace (radioQueue.js), the finale reel
//   camera cuts   every cinematic, every comic scene (out and back), every placeAt teleport
import { typeDuration, holdDuration } from '../ui/radioQueue.js';

export const PANEL_S = 2.5;
// Panels per comic scene (src/game/scenes.js; a night's own scenes declare `panels` on the step).
export const SCENE_PANELS = { intro: 5, card: 2, crates: 2, rig: 3, antidote: 2, actOne: 1, actTwo: 1, actThree: 1, bossIntro: 2, bossEnd: 2, death: 1, finale: 0 };
const FINALE_REEL_S = 21; // src/game/finale.js: the roof sequence before the credits
const lineS = (l) => typeDuration(l.text ?? '') + holdDuration(l.text ?? '');

function cinematicS(c) {
  if (!c) return 0;
  if (c.orbit) return (c.orbit.dur ?? 6) + 0.7;
  if (c.shots) return c.shots.reduce((a, s) => a + (s.dur ?? 0), 0) + 0.7;
  if (c.reveal) return 5.7;
  return 0;
}

export function pacingReport(steps, { scenePanels = SCENE_PANELS } = {}) {
  let hardStops = 0, noAgency = 0, cuts = 0, radioSteps = 0, comics = 0, cinematics = 0;
  const stops = [];
  for (const s of steps) {
    let stop = false, t = 0;
    const cin = cinematicS(s.cinematic);
    if (cin) { stop = true; t += cin; cuts += 1; cinematics += 1; }
    if (s.type === 'cutscene') {
      stop = true;
      if (s.scene === 'finale') t += FINALE_REEL_S;
      const panels = s.panels ?? scenePanels[s.scene] ?? 2;
      if (panels) { t += panels * PANEL_S; cuts += 1; comics += 1; }
    }
    if (s.type === 'boss' && !s.noIntro) { const p = s.introPanels ?? scenePanels.bossIntro; t += p * PANEL_S; cuts += 1; comics += 1; stop = true; }
    if (s.type === 'radio' && s.talk !== 'over') {
      stop = true;
      radioSteps += 1;
      // A cinematic radio beat plays its lines over the shot; the rest is standing listening.
      t += Math.max(0, (s.lines ?? []).reduce((a, l) => a + lineS(l), 0) - cin);
    }
    if (s.placeAt) cuts += 1;
    if (stop) { hardStops += 1; stops.push({ id: s.id, type: s.type, seconds: Math.round(t * 10) / 10 }); }
    noAgency += t;
  }
  return { steps: steps.length, hardStops, radioSteps, comics, cinematics, cuts, noAgencySeconds: Math.round(noAgency), stops };
}
