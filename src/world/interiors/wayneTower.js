// Wayne Tower, inside, and the Foundation's clinic (workstream K). A lazily built pocket (see
// ./pocketKit.js). The lobby is entered from the Loop (regions/loopData.js wayneTowerLobby); the
// lift bank takes you to Bruce's office, the boardroom and Applied Sciences' lab (each its own
// floor, laid side by side in the pocket); the clinic is the Foundation's ward in the Narrows,
// entered from its street door (westData.js narrowsClinicDoor). Pure data first, then build(ctx).
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import {
  add, addBox, block, shell, panelling, table, chair, armchair, sofa, rug, windowPane, chandelier,
  WOOD, WOOD_DARK, WOOD_LIGHT, BRASS, CREAM, WARM, STEEL, CYAN, STONE_D,
} from './pocketKit.js';

export const TOWER_ORIGIN = Object.freeze({ x: 2400, y: 0, z: -2000 });

export const TOWER_ROOMS = Object.freeze({
  lobby: { id: 'lobby', name: 'Wayne Tower lobby', x0: -16, x1: 16, z0: -12, z1: 12, y: 0, h: 9 },
  office: { id: 'office', name: "Bruce's office", x0: 30, x1: 50, z0: -10, z1: 10, y: 0, h: 5 },
  boardroom: { id: 'boardroom', name: 'The boardroom', x0: 30, x1: 50, z0: 18, z1: 34, y: 0, h: 5 },
  lab: { id: 'lab', name: 'Applied Sciences', x0: -16, x1: 16, z0: 22, z1: 42, y: 0, h: 6 },
  clinic: { id: 'clinic', name: 'The Foundation clinic', x0: 64, x1: 88, z0: -10, z1: 10, y: 0, h: 4.5 },
});

const S = (id, x, z, o) => [id, { id, x, z, y: 0, r: 1.8, ...o }];
export const TOWER_STATIONS = Object.freeze(Object.fromEntries([
  // Lift panels: one per floor (the runtime offers the other floors).
  S('liftLobby', -14.5, 0, { room: 'lobby', kind: 'liftPanel', label: 'The lifts', yaw: -Math.PI / 2 }),
  S('liftOffice', 31.5, 0, { room: 'office', kind: 'liftPanel', label: 'The lift', yaw: -Math.PI / 2 }),
  S('liftBoard', 31.5, 26, { room: 'boardroom', kind: 'liftPanel', label: 'The lift', yaw: -Math.PI / 2 }),
  S('liftLab', -14.5, 32, { room: 'lab', kind: 'liftPanel', label: 'The lift', yaw: -Math.PI / 2 }),
  S('officeDesk', 44, 0, { room: 'office', kind: 'calendar', label: 'Your desk (both calendars)', yaw: Math.PI / 2 }),
  S('officeWindow', 48.5, -6, { room: 'office', kind: 'thing', thing: 'view', label: 'The view', yaw: Math.PI / 2 }),
  S('reception', 0, -5, { room: 'lobby', kind: 'mark', label: 'Reception', yaw: Math.PI }),
  S('pressPodium', 0, -8.5, { room: 'lobby', kind: 'mark', label: 'The podium', yaw: 0 }),
  S('pressFront', -2, -3, { room: 'lobby', kind: 'mark', label: 'The front row', yaw: Math.PI }),
  S('pressBack', 3, 0, { room: 'lobby', kind: 'mark', label: 'The press pool', yaw: Math.PI }),
  S('boardHead', 47, 26, { room: 'boardroom', kind: 'mark', label: 'The head of the table', yaw: -Math.PI / 2 }),
  S('boardSide', 40, 23.5, { room: 'boardroom', kind: 'mark', label: 'Your seat', yaw: 0 }),
  S('labBench', 0, 34, { room: 'lab', kind: 'mark', label: 'The bench', yaw: Math.PI }),
  S('clinicDoor', 66.5, 0, { room: 'clinic', kind: 'mark', label: 'The ward door', yaw: Math.PI / 2 }),
  S('clinicBed', 84, -6, { room: 'clinic', kind: 'mark', label: 'The end bed', yaw: Math.PI / 2 }),
  S('clinicBedPatient', 86.2, -6, { room: 'clinic', kind: 'mark', label: 'The patient', yaw: -Math.PI / 2 }),
]));

export const TOWER_ENTRIES = Object.freeze({
  wayneTowerLobby: { x: 0, y: 0, z: 9.5, yaw: Math.PI, room: 'lobby' },
  narrowsClinicDoor: { x: 66.5, y: 0, z: 0, yaw: Math.PI / 2, room: 'clinic' },
});
export const TOWER_EXITS = Object.freeze([
  { id: 'street', site: 'wayneTowerLobby', x0: -3, x1: 3, z0: 11.4, z1: 12.6, label: 'The street doors' },
  { id: 'clinicStreet', site: 'narrowsClinicDoor', x0: 63.4, x1: 64.6, z0: -1.5, z1: 1.5, label: 'Out to the street' },
]);
// The lift: floor id -> where it puts you.
export const TOWER_FLOORS = Object.freeze({
  lobby: { label: 'Lobby', x: -13, z: 0, yaw: Math.PI / 2 },
  office: { label: 'Executive floor (your office)', x: 33, z: 0, yaw: Math.PI / 2 },
  boardroom: { label: 'Boardroom', x: 33, z: 26, yaw: Math.PI / 2 },
  lab: { label: 'Applied Sciences', x: -13, z: 32, yaw: Math.PI / 2 },
});
export const TOWER_SPAWN = TOWER_ENTRIES.wayneTowerLobby;

export function buildWayneTower(ctx) {
  const R = TOWER_ROOMS;
  const rich = (ctx.quality?.crowdDensity ?? 1) >= 0.5;
  const MARBLE = 0xd8d4cc, MARBLE_D = 0x2a2a30, DECO = 0xb89a52;

  // ---- the lobby: art deco marble, the big brass W-less crest, reception, the press corner ----
  shell(ctx, { ...R.lobby, wall: 0x3a3a42, floor: MARBLE, ceil: 0x2a2a30, doors: [{ side: 's', at: 0, w: 6, h: 4.2 }] });
  for (let i = -15; i < 16; i += 2) for (let j = -11; j < 12; j += 2) if (((i + j) / 2) % 2 === 0) add(ctx, 'painted', box(1.9, 0.02, 1.9, i, 0.035, j), MARBLE_D);
  for (const x of [-12, -6, 6, 12]) { add(ctx, 'painted', cylinder(0.6, 0.6, 9, x, 4.5, -4, 12), MARBLE_D); add(ctx, 'painted', cylinder(0.75, 0.75, 0.5, x, 8.6, -4, 12), DECO); addBox(ctx, x - 0.6, 0, -4.6, x + 0.6, 9, -3.4, 'pillar'); }
  for (const x of [-12, 12]) { add(ctx, 'painted', cylinder(0.6, 0.6, 9, x, 4.5, 6, 12), MARBLE_D); addBox(ctx, x - 0.6, 0, 5.4, x + 0.6, 9, 6.6, 'pillar'); }
  // Reception desk (a curve of dark wood with a brass band) and the crest on the back wall.
  block(ctx, -4, 0, -6.2, 4, 1.1, -5.4, WOOD_DARK, { tag: 'furniture' });
  add(ctx, 'painted', box(8.1, 0.12, 0.9, 0, 1.12, -5.8), DECO);
  add(ctx, 'painted', new THREE.CircleGeometry(3, 6).translate(0, 5.5, -11.7), DECO);
  add(ctx, 'painted', new THREE.CircleGeometry(2.6, 6).translate(0, 5.5, -11.65), 0x1e2b44);
  add(ctx, 'painted', box(1, 3, 0.05, 0, 5.4, -11.6), DECO);
  // The press corner: a podium on a low riser and the cameras' rope.
  block(ctx, -3, 0, -10.5, 3, 0.3, -7.4, MARBLE_D, { tag: 'stage' });
  block(ctx, -0.5, 0.3, -9.4, 0.5, 1.4, -8.9, WOOD_DARK);
  add(ctx, 'painted', box(0.7, 0.4, 0.05, 0, 1.0, -8.85), DECO);
  for (let x = -6; x <= 6; x += 2) add(ctx, 'painted', cylinder(0.05, 0.08, 1, x, 0.5, -6.6 + 0.0, 8), BRASS);
  if (rich) for (let x = -5; x <= 5; x += 2.5) for (const z of [-2, 0.5]) chair(ctx, x, z, Math.PI, { color: 0x2a2a30 });
  // Lift doors on the west wall (the lift bank).
  for (const z of [-4, 4]) add(ctx, 'painted', box(0.1, 3, 2.2, -15.75, 1.5, z), DECO);
  for (const z of [-8, 8]) chandelier(ctx, 0, 7.2, z, { r: 1.6 });
  for (const x of [-10, 10]) windowPane(ctx, 'x', 12, x, 1, 4, 6, -1, { night: 0x1a2232 });
  ctx.spot(0, 6, 0, 0xffe8c0, 18, 24);
  ctx.spot(0, 3, -8, 0xffffff, 10, 10);

  // ---- the office: a desk, a sofa, a wall of glass over the city ----
  shell(ctx, { ...R.office, wall: 0x3a3a42, floor: 0x2a2620, ceil: 0x2a2a30 });
  panelling(ctx, R.office, { dado: 1.0, color: WOOD_DARK, skip: ['e'] });
  table(ctx, 44.5, 0, 1.6, 3.4, { color: WOOD_DARK });
  chair(ctx, 46, 0, -Math.PI / 2, { color: 0x1a1a1a });
  sofa(ctx, 38, -8.5, 0, 3);
  for (const z of [-6, 0, 6]) cityWindow(ctx, 50, z);
  rug(ctx, 42, 0, 8, 8, 0x2a3048);
  ctx.spot(44, 3.5, 0, WARM, 10, 14);

  // ---- the boardroom: the long table, chairs, a screen ----
  shell(ctx, { ...R.boardroom, wall: 0x2a2a32, floor: 0x2a2620, ceil: 0x26262c });
  panelling(ctx, R.boardroom, { dado: 1.0, color: WOOD_DARK });
  table(ctx, 41, 26, 10, 2.4, { color: WOOD_DARK });
  if (rich) for (let x = 37; x <= 45; x += 2) { chair(ctx, x, 24.3, 0, { color: 0x1a1a1a }); chair(ctx, x, 27.7, Math.PI, { color: 0x1a1a1a }); }
  chair(ctx, 47, 26, -Math.PI / 2, { color: 0x3a1a1a });
  add(ctx, 'glow', box(0.08, 2, 3.6, 49.7, 2.3, 26), 0x1a2a3a);
  add(ctx, 'glow', box(0.06, 0.3, 2.4, 49.65, 2.7, 26), 0x6a8aa8);
  for (const z of [21, 31]) cityWindow(ctx, 50, z, 2.6);
  ctx.spot(41, 3.5, 26, 0xf0f0ff, 12, 14);

  // ---- Applied Sciences: benches, a test rig, crates marked "patience" ----
  shell(ctx, { ...R.lab, wall: 0x4a5058, floor: 0x3a3e44, ceil: 0x5a6068 });
  table(ctx, 0, 34, 6, 2, { color: STEEL });
  add(ctx, 'painted', box(0.6, 0.4, 0.5, -1.5, 1.0, 34), 0x8a9098); // the grapple prototype
  add(ctx, 'painted', box(1.4, 0.3, 0.9, 1.6, 0.95, 34), 0x2a2e34); // the vehicle module
  add(ctx, 'painted', box(0.3, 0.03, 0.4, 0.2, 0.8, 34.4), CREAM); // the notebook
  for (const [x, z] of [[-12, 25], [-9, 25], [12, 39], [9, 39]]) block(ctx, x - 1.2, 0, z - 1, x + 1.2, 1.4, z + 1, 0x6a5a3a);
  add(ctx, 'painted', cylinder(2, 2, 0.1, 9, 0.05, 27, 20), 0x2a2e34);
  add(ctx, 'glow', new THREE.TorusGeometry(2, 0.05, 6, 32).rotateX(Math.PI / 2).translate(9, 0.12, 27), CYAN);
  for (const x of [-8, 0, 8]) add(ctx, 'glow', box(4, 0.1, 0.6, x, 5.8, 32), 0xf0f4ff);
  ctx.spot(0, 4.5, 33, 0xf0f4ff, 14, 16);

  // ---- the Foundation clinic in the Narrows: a row of beds, a nurses' station with a scanner ----
  shell(ctx, { ...R.clinic, wall: 0xc8ccc4, floor: 0x8a9088, ceil: 0xd8dcd4, doors: [{ side: 'w', at: 0, w: 2.4 }] });
  for (const [z0, z1] of [[-9.6, -6.8], [6.8, 9.6]]) for (let x = 70; x <= 86; x += 4) {
    block(ctx, x - 0.9, 0, z0, x + 0.9, 0.7, z1, 0xe8e8e0, { tag: 'bed' });
    add(ctx, 'painted', box(1.7, 0.12, 0.6, x, 0.76, z0 < 0 ? z0 + 0.4 : z1 - 0.4), 0xf8f8f4);
  }
  block(ctx, 70, 0, -1.5, 74, 1.1, 1.5, 0xa8b0a8, { tag: 'furniture' }); // the nurses' station
  add(ctx, 'painted', box(0.3, 0.15, 0.2, 72, 1.2, 0), 0x2a2a2a); // the scanner
  add(ctx, 'glow', box(0.1, 0.05, 0.05, 72.1, 1.25, 0.11), 0x40ff60);
  for (let x = 68; x <= 86; x += 6) add(ctx, 'glow', box(2.4, 0.06, 0.5, x, 4.4, 0), 0xf4f8f0);
  windowPane(ctx, 'x', -10, 78, 1.2, 3, 2, 1);
  ctx.spot(77, 3.6, 0, 0xf4f8f0, 12, 16);
  void WOOD; void WOOD_LIGHT; void armchair; void STONE_D;
}

// A tall pane of the city at night (the Loop from high up) on an east wall.
function cityWindow(ctx, x, z, w = 5) {
  add(ctx, 'glow', box(0.05, 3.4, w, x - 0.25, 2.2, z), 0x0e1622);
  add(ctx, 'rain', new THREE.PlaneGeometry(w, 3.4).rotateY(-Math.PI / 2).translate(x - 0.35, 2.2, z));
  let s = Math.round((x + z) * 13) + 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 14; k++) add(ctx, 'glow', box(0.02, 0.06 + r() * 0.1, 0.06, x - 0.28, 1 + r() * 2.4, z - w / 2 + 0.2 + r() * (w - 0.4)), r() < 0.5 ? 0xffd890 : 0xd8e8ff);
}
