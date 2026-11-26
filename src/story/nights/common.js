// Shared helpers for the night files (workstream J2): radio lines, comic balloons, the "Previously"
// recap page every night opens with, and villain panels drawn as title cards in each rogue's
// colours (no portrait art needed). Data helpers only: no state.
import { titleCard } from '../../ui/comicArt.js';

export const g = (speaker, text) => ({ speaker, portrait: speaker, text });
export const v = (speaker, text) => ({ speaker, portrait: 'radio', text }); // villains, goons, civilians
export const B = (text, x = 50, y = 6, extra = {}) => ({ text, x, y, w: 70, ...extra });

const COLORS = {
  ivy: '#1f3a1a', firefly: '#3a1c0c', blackMask: '#111116', joker: '#2a1640', harley: '#3a1018', gordon: '#1a2436', alfred: '#2a2620', recap: '#14141c',
};
// A villain (or any speaker) as a coloured card with their name; the line goes in a balloon.
export function face(who, name, sub = '') { return titleCard(name, sub, { w: 600, h: 720, bg: COLORS[who] ?? '#1a2436' }); }

// The "Previously..." page: one strip of three panels, the last night in short.
export function recap(stage, { title, panels }) {
  return [{
    layout: 'trio',
    panels: [
      { img: titleCard('PREVIOUSLY', title, { w: 560, h: 760, bg: COLORS.recap }), caption: panels[0] },
      { img: stage.shot(panels[1].shot), caption: panels[1].caption },
      { img: stage.shot(panels[2].shot), caption: panels[2].caption, captionPos: 'bottom' },
    ],
  }];
}
