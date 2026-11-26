// Open-world predator encounters (workstream J3, item 4): ten stealth rooms out in the city, away
// from the story's own rooms (Night Four's Narrows rookery and Night Five's Yards roundhouse are
// left alone). Plain data in the story rooms' format (src/story/rooms.js, story-format.md 5), so
// they run on the existing stealth runtime through the encounter system unchanged.
//
// Every patrol point, cover crate and entry here was placed against the real collision of the
// assembled city (tests/unit/owStealth.test.js builds it headless and checks each point stands on
// ground and is not inside a wall). Rooftop rooms use the roof's own height; Bristol's churchyard
// follows the hill (bristolHeight).
//
//   { id, title, district, site (a site id, or a literal { x, y, z } for a roof with no site),
//     entry { x, y, z, yaw }, radius, gang (GANGS look key), blurb, lines (radio, on start),
//     squad: [{ type, route }], lights, cover, huddle?, hostages?: [{ x, y, z }],
//     optional: [{ id: 'unseen'|'noGadgets'|'time', limit? }], medals: { gold, silver, bronze } (s),
//     detector: true on the squad entry that carries it (a lieutenant) }
import { W, route } from '../../story/rooms.js';
import { bristolHeight } from '../../world/regions/bristolLayout.js';

export const OPTIONAL_IDS = ['unseen', 'noGadgets', 'time'];
export const OPTIONAL_TEXT = { unseen: 'Never seen', noGadgets: 'No gadgets', time: 'Under the time' };

const opts = (limit) => [{ id: 'unseen' }, { id: 'noGadgets' }, { id: 'time', limit }];
const L = (speaker, text) => ({ speaker, text });
// Bristol is hills: a point's y is the ground there.
const B = (x, z, wait = 0, face = null) => W(x, bristolHeight(x, z), z, wait, face);
const bx = (x, z, w = 1.4, d = 1.2, h = 1.3) => ({ x, y: bristolHeight(x, z), z, w, d, h });

export const STEALTH_ENCOUNTERS = [
  // 1. The Loop: a sniper team on the crown of the Herald Building, watching the street.
  {
    id: 'heraldNests', title: 'Nests on the Herald', district: 'loop', site: 'heraldCrown',
    entry: { x: -58, y: 80, z: -399, yaw: 0 }, radius: 16, gang: 'twoFace',
    blurb: 'A Coin crew sniper team on the Herald crown, covering a payoff on the street below.',
    lines: [L('dispatch', 'All units avoid Herald Square. Shots from the roofline. Repeat, the roofline.'), L('alfred', 'Two rifles on the crown and a lieutenant with some sort of listening gadget. Mind your footsteps, sir.')],
    lights: [{ x: -60, y: 81.6, z: -399, r: 4 }, { x: -60, y: 81.6, z: -381, r: 4 }],
    cover: [{ x: -55, y: 80, z: -398.3, w: 1.4, d: 1.2, h: 1.3 }, { x: -60, y: 80, z: -398.6, w: 1.2, d: 1.2, h: 1.2 }, { x: -58.5, y: 80, z: -381.4, w: 1.2, d: 1.2, h: 1.1 }],
    squad: [
      { type: 'sniper', route: route('pingpong', W(-66.5, 80, -398, 4, Math.PI), W(-66.5, 80, -383, 4, 0)) },
      { type: 'sniper', route: route('pingpong', W(-50.5, 80, -382, 4, 0), W(-50.5, 80, -397, 4, Math.PI)) },
      { type: 'pistol', route: route('loop', W(-65.8, 80, -396.5, 1), W(-52, 80, -396.5, 1), W(-52, 80, -383.5, 1), W(-65.8, 80, -383.5, 1)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(-53.5, 80, -392, 2, Math.PI / 2), W(-53.5, 80, -388, 2, Math.PI / 2)) },
    ],
    optional: opts(150), medals: { gold: 75, silver: 120, bronze: 200 },
  },
  // 2. The Narrows: hostages held in the clinic's loading yard.
  {
    id: 'clinicHostages', title: 'The Clinic Yard', district: 'narrows', site: 'narrowsClinicDoor',
    entry: { x: -307, y: 0, z: -489.5, yaw: Math.PI }, radius: 18, gang: 'scarecrow',
    blurb: 'Three clinic staff tied up in the loading yard while a crew loads the pharmacy into a van.',
    lines: [L('alfred', 'Three staff from the free clinic, sir. They patched you up once, if you recall. Quietly, please.'), L('goon', 'Nobody said anything about hostages. I signed up for pills. Pills!')],
    hostages: [{ x: -305, y: 0, z: -505 }, { x: -305, y: 0, z: -507 }, { x: -305, y: 0, z: -503 }],
    lights: [{ x: -307.5, y: 3.2, z: -498, r: 4.5, post: true }, { x: -307.5, y: 3.2, z: -514, r: 3.5, post: true }],
    cover: [{ x: -309.6, y: 0, z: -510, w: 1.2, d: 1.4, h: 1.3 }, { x: -304.6, y: 0, z: -495, w: 1.2, d: 1.2, h: 1.2 }, { x: -309.6, y: 0, z: -500, w: 1.2, d: 1.2, h: 1.1 }],
    huddle: { x: -307, y: 0, z: -505 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-307, 0, -518, 2, 0), W(-307, 0, -508, 2, Math.PI)) },
      { type: 'grunt', route: route('pingpong', W(-306.5, 0, -492, 2, Math.PI), W(-306.5, 0, -501, 2, 0)) },
      { type: 'knife', route: route('pingpong', W(-308, 0, -513, 3, Math.PI / 2), W(-308, 0, -497, 3, -Math.PI / 2)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(-306, 0, -510, 3, 0), W(-306, 0, -514, 2, 0)) },
    ],
    optional: opts(140), medals: { gold: 70, silver: 110, bronze: 180 },
  },
  // 3. Chinatown: the triad's counting house, behind the mahjong parlour.
  {
    id: 'countingHouse', title: 'The Counting House', district: 'chinatown', site: 'chinatownMahjongDoor',
    entry: { x: -318, y: 0, z: -92, yaw: Math.PI / 2 }, radius: 20, gang: 'blackMask',
    blurb: "The Red Lantern triad counts the week's protection money in the lane behind the parlour.",
    lines: [L('alfred', "The lane behind the mahjong parlour. They count the street's money there every Thursday. Today is, regrettably, Thursday."), L('goon', 'Count it again. If the boss finds one note missing, it is your fingers he counts next.')],
    lights: [{ x: -305, y: 3.2, z: -110, r: 5, post: true }, { x: -330, y: 3.2, z: -94, r: 4, post: true }],
    cover: [{ x: -306, y: 0, z: -104, w: 1.6, d: 1.2, h: 1.2 }, { x: -302.6, y: 0, z: -116, w: 1.2, d: 1.4, h: 1.3 }, { x: -325, y: 0, z: -96.6, w: 1.4, d: 1.2, h: 1.3 }],
    huddle: { x: -305, y: 0, z: -110 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-305, 0, -124, 2, 0), W(-305, 0, -112, 2, Math.PI)) },
      { type: 'grunt', route: route('pingpong', W(-303, 0, -100, 2, Math.PI), W(-303, 0, -108, 2, 0)) },
      { type: 'grunt', route: route('pingpong', W(-336, 0, -94, 2, Math.PI / 2), W(-312, 0, -94, 2, -Math.PI / 2)) },
      { type: 'medic', route: route('pingpong', W(-308, 0, -96, 3, 0), W(-308, 0, -106, 2, Math.PI)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(-304, 0, -113, 3, Math.PI / 2), W(-304, 0, -118, 3, Math.PI / 2)) },
    ],
    optional: opts(170), medals: { gold: 85, silver: 135, bronze: 220 },
  },
  // 4. The Yards: the chop-shop ring's warehouse lot beside the cold store.
  {
    id: 'coldStoreLot', title: 'The Cold Store Lot', district: 'yards', site: 'yardsColdStorageDoor',
    entry: { x: -375, y: 0, z: 137, yaw: Math.PI }, radius: 20, gang: 'firefly',
    blurb: 'Stolen cars stripped to the frame in the lot by the cold store. A rifle watches from the dock.',
    lines: [L('dispatch', 'Report of cutting torches in the Yards after midnight. Probably the steelworks. Probably.'), L('alfred', 'Seven stolen cars and counting, sir. The owners would like them back in fewer pieces.')],
    lights: [{ x: -370, y: 3.4, z: 112, r: 5, post: true }, { x: -370, y: 3.4, z: 130, r: 4.5, post: true }],
    cover: [{ x: -374, y: 0, z: 118, w: 1.6, d: 1.2, h: 1.3 }, { x: -367.5, y: 0, z: 124, w: 1.4, d: 1.4, h: 1.2 }, { x: -374, y: 0, z: 128, w: 1.2, d: 1.6, h: 1.3 }, { x: -366, y: 0, z: 110, w: 1.2, d: 1.2, h: 1.1 }],
    squad: [
      { type: 'rifle', route: route('pingpong', W(-365, 0, 108, 3, -Math.PI / 2), W(-365, 0, 134, 3, -Math.PI / 2)) },
      { type: 'grunt', route: route('pingpong', W(-376, 0, 110, 2, 0), W(-376, 0, 135, 2, Math.PI)) },
      { type: 'knife', route: route('loop', W(-369, 0, 114, 1), W(-369, 0, 132, 1), W(-372, 0, 132, 1), W(-372, 0, 114, 1)) },
      { type: 'shield', route: route('pingpong', W(-368, 0, 107, 2, 0), W(-376, 0, 107, 2, 0)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(-370, 0, 121, 3, Math.PI / 2), W(-370, 0, 126, 3, -Math.PI / 2)) },
    ],
    optional: opts(170), medals: { gold: 85, silver: 135, bronze: 220 },
  },
  // 5. Amusement Mile: a midnight deal on the shut pier, over the undercroft. (The undercroft's
  //    catwalk sits 2.7 m under the deck: too low for the encounter system's floor snap, so the
  //    crew holds the deck above it.)
  {
    id: 'pierAfterHours', title: 'The Pier After Hours', district: 'amusementMile', site: 'pierUndercroft',
    entry: { x: 455, y: 3, z: -460, yaw: Math.PI / 2 }, radius: 24, gang: 'joker',
    blurb: 'The carnival crew is moving something off a boat under the pier lights. The rides are off. Mostly.',
    lines: [L('alfred', 'The pier closed at eleven. Someone has turned the Ferris wheel lights back on, which I take as an invitation.'), L('goon', 'Why are we doing this on a pier? Every pier in this city ends with someone in the lake.')],
    lights: [{ x: 470, y: 6.2, z: -454, r: 5, post: true, base: 3 }, { x: 486, y: 6.2, z: -444, r: 4, post: true, base: 3 }],
    cover: [{ x: 465, y: 3, z: -457, w: 1.6, d: 1.2, h: 1.3 }, { x: 478, y: 3, z: -446, w: 1.4, d: 1.4, h: 1.3 }, { x: 467, y: 3, z: -444, w: 1.2, d: 1.2, h: 1.2 }, { x: 486, y: 3, z: -457, w: 1.2, d: 1.6, h: 1.2 }],
    squad: [
      { type: 'pistol', route: route('pingpong', W(456, 3, -450, 2, Math.PI / 2), W(488, 3, -450, 2, -Math.PI / 2)) },
      { type: 'grunt', route: route('pingpong', W(474, 3, -463, 2, 0), W(474, 3, -441, 2, Math.PI)) },
      { type: 'knife', route: route('loop', W(461, 3, -441, 1), W(490, 3, -441, 1), W(490, 3, -462, 1), W(461, 3, -462, 1)) },
      { type: 'grunt', route: route('pingpong', W(482, 3, -458, 3, Math.PI), W(482, 3, -443, 3, 0)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(470, 3, -458, 3, 0), W(470, 3, -449, 3, Math.PI)) },
    ],
    optional: opts(170), medals: { gold: 85, silver: 135, bronze: 220 },
  },
  // 6. Arkham: inmates have the east wing's yard and the orderlies' keys.
  {
    id: 'arkhamWing', title: 'The East Wing Yard', district: 'arkham', site: 'arkhamYard',
    entry: { x: 715, y: 5, z: -67, yaw: -Math.PI * 0.75 }, radius: 18, gang: 'joker',
    blurb: 'A lockdown went wrong. The inmates hold the yard, and one of them found the guard armoury.',
    lines: [L('officer', 'Arkham security to anyone listening: east yard is theirs. We are behind the door. Please hurry, the door is not very good.'), L('alfred', 'Inmates, not soldiers, sir. Frightened men fight badly and run well. Let them see you only once.')],
    lights: [{ x: 702, y: 8.4, z: -86, r: 5, post: true, base: 5 }, { x: 714, y: 8.4, z: -74, r: 4, post: true, base: 5 }],
    cover: [{ x: 696, y: 5, z: -72, w: 1.4, d: 1.2, h: 1.3 }, { x: 710, y: 5, z: -84, w: 1.2, d: 1.4, h: 1.3 }, { x: 698, y: 5, z: -87.5, w: 1.6, d: 1.2, h: 1.2 }],
    huddle: { x: 702, y: 5, z: -80 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(690, 5, -92, 3, Math.PI / 4), W(704, 5, -92, 3, 0)) },
      { type: 'pistol', route: route('loop', W(693, 5, -70, 1), W(712, 5, -70, 1), W(712, 5, -90, 1), W(693, 5, -90, 1)) },
      { type: 'grunt', route: route('pingpong', W(700, 5, -68, 2, Math.PI), W(700, 5, -84, 2, 0)) },
      { type: 'medic', route: route('pingpong', W(706, 5, -76, 3, Math.PI / 2), W(714, 5, -80, 3, -Math.PI / 2)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(696, 5, -80, 3, 0), W(705, 5, -80, 3, Math.PI)) },
    ],
    optional: opts(170), medals: { gold: 85, silver: 140, bronze: 230 },
  },
  // 7. Bristol: a burglary at the rectory of St. Swithin's, among the gravestones.
  {
    id: 'rectoryJob', title: 'The Rectory Job', district: 'bristol', site: 'bristolChurch',
    entry: { x: -145, y: bristolHeight(-145, -684), z: -684, yaw: -Math.PI / 2 }, radius: 18, gang: 'penguin',
    blurb: "Burglars in good coats are carrying St. Swithin's silver down the churchyard to a waiting car.",
    lines: [L('alfred', "St. Swithin's, sir. The rector christened you, and he has asked me twice to mention he would like his candlesticks back."), L('goon', 'Robbing a church. In Bristol. With a bat about. My mother would be so disappointed.')],
    lights: [{ x: -156, y: bristolHeight(-156, -678) + 3.2, z: -678, r: 4.5, post: true, base: bristolHeight(-156, -678) }],
    cover: [bx(-150, -676), bx(-160, -672, 1.2, 1.4, 1.2), bx(-147, -671, 1.2, 1.2, 1.1)],
    squad: [
      { type: 'pistol', route: route('pingpong', B(-161, -683, 2, 0), B(-161, -671, 2, Math.PI)) },
      { type: 'grunt', route: route('pingpong', B(-145, -680, 2, -Math.PI / 2), B(-157, -680, 2, Math.PI / 2)) },
      { type: 'knife', route: route('loop', B(-152, -683, 1), B(-144, -683, 1), B(-144, -674, 1), B(-152, -674, 1)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', B(-155, -676, 3, 0), B(-150, -671, 3, Math.PI)) },
    ],
    optional: opts(130), medals: { gold: 65, silver: 105, bronze: 170 },
  },
  // 8. Blackgate: the exercise yard after lights-out, a breakout half-planned.
  {
    id: 'blackgateYardNight', title: 'Blackgate After Lights-Out', district: 'blackgate', site: 'blackgateYard',
    entry: { x: 150, y: 2.2, z: 381, yaw: Math.PI / 2 }, radius: 22, gang: 'twoFace',
    blurb: 'A crew of trustees has the yard and the guards\' radios, and a plan for the wall at three a.m.',
    lines: [L('officer', 'This is Blackgate tower two. The yard went quiet ten minutes ago. Blackgate is never quiet.'), L('alfred', 'They have the guards\' radios, sir, so they will hear the guards panic. They will not hear you.')],
    lights: [{ x: 171, y: 5.4, z: 375.6, r: 5, post: true, base: 2.2 }, { x: 158, y: 5.4, z: 386.6, r: 4.5, post: true, base: 2.2 }],
    cover: [{ x: 170.5, y: 2.2, z: 381.5, w: 1.4, d: 1.2, h: 1.3 }, { x: 159, y: 2.2, z: 384.6, w: 1.6, d: 1.0, h: 1.2 }, { x: 174, y: 2.2, z: 378.6, w: 1.2, d: 1.2, h: 1.2 }],
    squad: [
      { type: 'rifle', route: route('pingpong', W(156, 2.2, 376.5, 3, Math.PI / 2), W(175, 2.2, 376.5, 3, -Math.PI / 2)) },
      { type: 'pistol', route: route('pingpong', W(157, 2.2, 386, 2, Math.PI / 2), W(175, 2.2, 386, 2, -Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(165, 2.2, 378, 1), W(172, 2.2, 378, 1), W(172, 2.2, 384.8, 1), W(165, 2.2, 384.8, 1)) },
      { type: 'grunt', route: route('pingpong', W(156, 2.2, 384, 2, 0), W(156, 2.2, 378, 2, Math.PI)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(168, 2.2, 379.5, 3, 0), W(168, 2.2, 383.5, 3, Math.PI)) },
    ],
    optional: opts(170), medals: { gold: 85, silver: 135, bronze: 220 },
  },
  // 9. Gotham Mile: a penthouse roof terrace where the Umbrella Men keep the books.
  {
    id: 'pembertonPenthouse', title: 'The Pemberton Penthouse', district: 'gothamMile', site: { x: 116, y: 30, z: -683 },
    entry: { x: 128, y: 30, z: -689, yaw: -Math.PI / 2 }, radius: 18, gang: 'penguin',
    blurb: "The Umbrella Men's ledger lives on a penthouse terrace thirty metres over Gotham Mile.",
    lines: [L('alfred', 'The Pemberton penthouse, sir. Fourteen thousand a month and they still left the roof door propped open.'), L('goon', 'Mister Pemberton says no shoes on the terrace. Do I look like I own terrace socks?')],
    lights: [{ x: 116, y: 32, z: -686, r: 5 }, { x: 106, y: 32, z: -671, r: 4 }],
    cover: [{ x: 122, y: 30, z: -681, w: 1.6, d: 1.2, h: 1.2 }, { x: 105, y: 30, z: -688, w: 1.2, d: 1.4, h: 1.3 }, { x: 124, y: 30, z: -670, w: 1.4, d: 1.2, h: 1.2 }],
    squad: [
      { type: 'pistol', route: route('pingpong', W(104, 30, -669, 2, 0), W(104, 30, -682, 2, Math.PI)) },
      { type: 'pistol', route: route('pingpong', W(128, 30, -672, 2, -Math.PI / 2), W(128, 30, -686, 2, -Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(112, 30, -690, 1), W(124, 30, -690, 1), W(124, 30, -676, 1), W(112, 30, -676, 1)) },
      { type: 'baton', route: route('pingpong', W(116, 30, -668, 2, Math.PI), W(116, 30, -684, 2, 0)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(119, 30, -679, 3, 0), W(119, 30, -685, 3, Math.PI)) },
    ],
    optional: opts(160), medals: { gold: 80, silver: 125, bronze: 210 },
  },
  // 10. The Museum Campus: the gallery roof at night, a crew lowering a case through the skylight.
  {
    id: 'galleryRoof', title: 'The Gallery at Night', district: 'museumCampus', site: 'museumRoofStealth',
    entry: { x: 266, y: 20, z: 130, yaw: Math.PI / 2 }, radius: 30, gang: 'freeze',
    blurb: "A crew is winching the Gotham Sapphire up through the natural history gallery's skylight.",
    lines: [L('alfred', 'The Gotham Sapphire, sir. Forty carats and a curse, according to the gift shop. The curse is new tonight.'), L('goon', 'Easy with the winch. If that rock hits the dinosaur we are explaining it to the dinosaur.')],
    lights: [{ x: 294, y: 25.6, z: 118, r: 6 }, { x: 268, y: 21.6, z: 118, r: 4 }],
    cover: [{ x: 280, y: 20, z: 105.9, w: 1.4, d: 1.0, h: 1.2 }, { x: 308, y: 20, z: 130.1, w: 1.4, d: 1.0, h: 1.2 }, { x: 322.2, y: 20, z: 118, w: 1.0, d: 1.4, h: 1.2 }, { x: 290, y: 24, z: 114, w: 1.6, d: 1.6, h: 1.3 }],
    squad: [
      { type: 'sniper', route: route('pingpong', W(278, 24, 111, 4, Math.PI), W(310, 24, 111, 4, Math.PI)) },
      { type: 'pistol', route: route('loop', W(268, 20, 108, 1), W(320, 20, 108, 1), W(320, 20, 128, 1), W(268, 20, 128, 1)) },
      { type: 'grunt', route: route('pingpong', W(296, 24, 125, 2, 0), W(296, 24, 113, 2, Math.PI)) },
      { type: 'grunt', route: route('pingpong', W(318, 20, 110, 2, 0), W(318, 20, 126, 2, Math.PI)) },
      { type: 'lieutenant', detector: true, route: route('pingpong', W(286, 24, 121, 3, Math.PI / 2), W(302, 24, 121, 3, -Math.PI / 2)) },
    ],
    optional: opts(180), medals: { gold: 90, silver: 140, bronze: 230 },
  },
];

export const STEALTH_IDS = STEALTH_ENCOUNTERS.map((e) => e.id);
export const encounterById = (id) => STEALTH_ENCOUNTERS.find((e) => e.id === id) ?? null;

// Medal for a clear time (seconds); null when slower than bronze.
export function stealthMedal(enc, time) {
  if (time <= enc.medals.gold) return 'gold';
  if (time <= enc.medals.silver) return 'silver';
  if (time <= enc.medals.bronze) return 'bronze';
  return null;
}
