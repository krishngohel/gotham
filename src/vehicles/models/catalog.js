// Every code-built vehicle in one list: the garage page (tools/garage.html), the contact-sheet
// script and the model-contract tests all walk this, so a new vehicle added here is shot, budgeted
// and tested without touching those. Each entry's create() returns the vehicle's handle object
// (always at least { group }).
import { FLEET, FLEET_TYPES, createStreetVehicle } from './street.js';
import { createBatmobileModel } from './batmobile.js';
import { createBatcycle, createWingBike } from './heroBikes.js';
import { createBatwingModel } from './batwing.js';
import { createElCar, createElTrain } from './elTrain.js';
import { createBoat, BOAT_TYPES } from './marine.js';
import { createHelicopter, createBlimpModel } from './aircraft.js';

export const CATALOG = [
  { id: 'batmobile', label: 'Batmobile', group: 'hero', create: () => createBatmobileModel() },
  { id: 'batmobile_classic', label: 'Batmobile (classic skin)', group: 'hero', create: () => createBatmobileModel({ skin: 'classic' }) },
  { id: 'batcycle', label: 'Batcycle', group: 'hero', create: () => createBatcycle() },
  { id: 'wingbike', label: 'Nightwing bike', group: 'hero', create: () => createWingBike() },
  { id: 'batwing', label: 'Batwing', group: 'hero', create: () => { const w = createBatwingModel(); w.group.visible = true; return w; } },
  ...FLEET_TYPES.map((t) => ({ id: t, label: FLEET[t].label, group: 'fleet', palettes: FLEET[t].palettes.length, create: (o) => createStreetVehicle(t, o) })),
  { id: 'el_cab', label: 'El car (cab)', group: 'rail', create: () => createElCar({ cab: 'front' }) },
  { id: 'el_mid', label: 'El car (middle)', group: 'rail', create: () => createElCar({ cab: 'none' }) },
  { id: 'el_train', label: 'El train (4 cars)', group: 'rail', create: () => createElTrain(4) },
  ...BOAT_TYPES.map((t) => ({ id: t, label: t.replace('_', ' '), group: 'marine', create: () => createBoat(t) })),
  { id: 'heli_gcpd', label: 'GCPD helicopter', group: 'air', create: () => createHelicopter('gcpd') },
  { id: 'heli_news', label: 'News helicopter', group: 'air', create: () => createHelicopter('news') },
  { id: 'blimp', label: 'GCPD blimp', group: 'air', create: () => createBlimpModel() },
];
