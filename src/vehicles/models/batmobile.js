// The Batmobile, our own design ("Nightjar"): a long, low, faceted armoured hull with a wedge ram
// prow and a raised hood spine, the cockpit set far back under a faceted canopy, four oversized
// exposed tyres on visible suspension arms with armoured blade fenders, and a single afterburner
// nozzle in the tail. Not modelled on any film's or game's car.
//
// Two modes blended by setMode(t), t = 0 pursuit .. 1 battle:
//   pursuit  sleek: armour flush, deck hatches shut, turret stowed, narrow track
//   battle   raised ride, wider track, flank armour lifted clear of the missile pods, deck hatches
//            open and a twin vulcan turret up out of the deck, ram blade extended
// Every moving part is a bone of ONE skinned body (see kit.js), so the whole car is 7 draws:
// body, ink, glass, lamps, jet glow, jet halo, afterburner flame.
//
// Handles for the mechanics workstream (all Object3Ds that move with their part):
//   wheels[i] = { pivot, swivel, spin, mount, front }  pivot.rotation.y steers (vehicles.js),
//     swivel.rotation.y turns the wheel for strafing (setStrafe), spin.rotation.x rolls it
//   turret = { lift, yaw, pitch, spin, muzzles[2] }   aimTurret(yaw, pitch), setFiring(on)
//   canopy (bone hinged at its rear edge; setCanopy(0..1)), seat, ejectPoint
//   grapplePoint (nose winch), missilePorts[4] (flanks, under the armour), vulcanPorts = muzzles
//   hull (bone: setAttitude(pitch, roll) for body roll and dive)
//   jetGlow, jetHalo, flame; setBoost(on) (old contract), setAfterburner(0..1)
//   setLamps({ head, tail, brake, intake, battle, pursuit })
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, glowMaterial, loft, ring8, boxAt, cylX, cylZ, cylY, C } from './kit.js';
import { strut } from './bodies.js';
import { addRim } from '../../actors/outfitParts.js';
import { toonMaterial } from '../../render/toon.js';
import { LAYER_FX } from '../../render/layers.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

export const BATMOBILE = {
  wheelR: 0.56, frontW: 0.44, rearW: 0.52, trackX: 1.42, frontZ: 2.02, rearZ: -1.9,
  halfLength: 3.3, halfWidth: 1.5, radius: 2.05,
  battleTrack: 0.2, battleRide: 0.12, turretRise: 0.6,
};

const SKINS = {
  // [move] Lighter gunmetal than the first pass (it read too dark at night) and a brighter rim.
  nightjar: { body: 0x48505f, armour: 0x353c49, dark: 0x1b1d23, accent: 0x7fd6ff, hub: 0x434852, cap: C.chrome, emblem: 0x9aa3b1, rim: 0x8fb6f0, bulk: 1 },
  // Classic roadster flavour: gloss black, long raked tail fins, red pinstripes and bright hubs.
  classic: { body: 0x15161b, armour: 0x101115, dark: 0x0b0b0e, accent: 0xff4a3a, hub: 0x9aa2ad, cap: 0xff4a3a, emblem: 0xff4a3a, rim: 0xa8b8d8, fins: true, bulk: 0 },
};

function mirrorX(g) {
  g.scale(-1, 1, 1);
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return g;
}

const templates = {};

function buildTemplate(skinName) {
  const sk = SKINS[skinName] ?? SKINS.nightjar;
  const B = BATMOBILE;
  const b = new VehicleBuilder({ outline: 0.03, name: `batmobile-${skinName}` });
  b.bone('hull', 'root', V(0, 0, 0));
  const hull = (geo, color = sk.body, o = {}) => b.add(geo, { color, bone: 'hull', ...o });
  const lamp = (geo, group, on, off, bone = 'hull') => b.add(geo, { to: 'lamps', bone, lamp: group, on, off });

  // ---- hull, spine, prow
  // [move] `bulk` (nightjar 1): wider shoulders, a taller armoured deck and a heavier prow, so it
  // reads as the heavy tank of the brief rather than a lean sports car.
  const K = sk.bulk ?? 0;
  hull(loft([
    [3.3, 0.36, 0.3, 0.44, 0.5, 0.18],
    [2.85, 0.3, 0.66, 0.58, 0.7, 0.4],
    [2.0, 0.28, 0.86, 0.68, 0.86, 0.5],
    [0.8, 0.28, 0.96, 0.78, 0.98, 0.6],
    [-0.6, 0.28, 1.0, 0.82, 1.02, 0.64],
    [-2.2, 0.3, 0.98, 0.82, 1.0, 0.7],
    [-2.95, 0.34, 0.88, 0.78, 0.92, 0.62],
    [-3.3, 0.42, 0.7, 0.7, 0.8, 0.48],
  ].map(([z, y0, hw, ym, yt, ht]) => [z, y0, hw + 0.09 * K, ym + 0.04 * K, yt + 0.07 * K, ht + 0.06 * K]).map(([z, y0, hw, ym, yt, ht]) => ({ z, pts: ring8(y0, hw - 0.14, hw, ym, ht, yt) }))));
  if (K) {
    for (const s of [-1, 1]) {
      // Shoulder armour slabs either side of the cockpit, and a raised plate over each fender line.
      hull(boxAt(0.4, 0.12, 3.1, s * 0.87, 1.07, -0.75).rotateZ(0), sk.armour);
      hull(boxAt(0.36, 0.1, 1.0, s * 0.9, 0.98, 2.0), sk.armour);
      // Edge lighting: a thin light line along the top of each flank and the prow's lip, the
      // pursuit colour (cyan) that switches to the battle red with the lamps.
      lamp(boxAt(0.025, 0.03, 4.4, s * 1.12, 0.93, -0.6), 'pursuit', sk.accent, 0x1a2a33);
      lamp(boxAt(0.025, 0.03, 4.4, s * 1.12, 0.89, -0.6), 'battle', 0xff3040, 0x3a1015);
    }
    lamp(boxAt(1.7, 0.03, 0.03, 0, 0.42, 3.33), 'pursuit', sk.accent, 0x1a2a33);
    // A heavy push block under the prow blade.
    hull(boxAt(1.9, 0.24, 0.3, 0, 0.36, 3.15), sk.dark);
  }
  // Raised spine down the hood, ending in front of the canopy.
  hull(loft([
    { z: 3.05, pts: ring8(0.5, 0.06, 0.08, 0.54, 0.04, 0.58) },
    { z: 2.2, pts: ring8(0.8, 0.14, 0.2, 0.9, 0.1, 0.98) },
    { z: 0.75, pts: ring8(0.94, 0.16, 0.22, 1.02, 0.12, 1.08) },
    { z: 0.5, pts: ring8(0.94, 0.12, 0.16, 1.0, 0.08, 1.03) },
  ]), sk.armour);
  for (const s of [-1, 1]) {
    // Hood intakes either side of the spine: dark slots with a glow strip inside (lamp 'intake').
    hull(boxAt(0.32, 0.06, 0.9).rotateX(0.08).translate(s * 0.5, 0.93, 1.45), C.grille, { ink: false });
    lamp(boxAt(0.26, 0.03, 0.8).rotateX(0.08).translate(s * 0.5, 0.955, 1.45), 'intake', 0xffa040, 0x3a2412);
    // Flank strakes: three angled slats behind the front wheel.
    for (let i = 0; i < 3; i++) hull(boxAt(0.04, 0.06, 0.5, s * 0.99, 0.45 + i * 0.1, 1.05 - i * 0.08), sk.dark, { ink: false });
  }
  // Armoured sills between the wheels: heavy side skirts that make the hull read wide and low
  // (they stop short of the wheels, which need the room to swivel sideways in battle mode).
  for (const s of [-1, 1]) {
    const sill = loft([
      { z: 1.35, pts: [[-0.12, 0.3], [-0.12, 0.66], [0.06, 0.7], [0.2, 0.56], [0.22, 0.34], [0.1, 0.28], [0.0, 0.26], [-0.08, 0.27]] },
      { z: 1.1, pts: [[-0.12, 0.26], [-0.12, 0.7], [0.08, 0.74], [0.26, 0.6], [0.28, 0.32], [0.2, 0.24], [0.06, 0.22], [-0.06, 0.23]] },
      { z: -1.05, pts: [[-0.12, 0.26], [-0.12, 0.72], [0.08, 0.76], [0.26, 0.62], [0.28, 0.32], [0.2, 0.24], [0.06, 0.22], [-0.06, 0.23]] },
      { z: -1.3, pts: [[-0.12, 0.3], [-0.12, 0.68], [0.06, 0.72], [0.2, 0.58], [0.22, 0.34], [0.12, 0.28], [0.0, 0.26], [-0.08, 0.27]] },
    ]);
    hull((s < 0 ? mirrorX(sill) : sill).translate(s * 0.98, 0, 0), sk.armour);
    // A row of bolt heads along the sill: comic armour detail.
    for (let k = 0; k < 6; k++) hull(boxAt(0.03, 0.05, 0.05, s * 1.25, 0.5, 0.9 - k * 0.38), sk.dark, { ink: false });
  }
  // Ram prow blade on its own bone (pushes out in battle).
  b.bone('prow', 'hull', V(0, 0.3, 3.2));
  b.add(loft([
    { z: 3.55, pts: [[-0.5, 0.22], [-0.42, 0.3], [0.42, 0.3], [0.5, 0.22]] },
    { z: 3.1, pts: [[-1.05, 0.2], [-0.95, 0.36], [0.95, 0.36], [1.05, 0.2]] },
  ]), { color: sk.dark, bone: 'prow' });
  // Our emblem on the hood tip: an angular chevron-wing (not any film's or game's crest).
  hull(new THREE.ShapeGeometry(new THREE.Shape([
    [0, -0.05], [0.16, 0.06], [0.1, 0.0], [0.05, 0.05], [0, 0.0], [-0.05, 0.05], [-0.1, 0.0], [-0.16, 0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-Math.PI / 2 + 0.25).translate(0, 0.66, 2.9), sk.emblem, { ink: false });

  // ---- cockpit tub, seats, wheel; canopy on a bone hinged at its rear edge
  hull(boxAt(1.2, 0.2, 1.9, 0, 0.98, -0.55), C.interior, { ink: false });
  for (const x of [-0.3, 0.3]) {
    hull(boxAt(0.42, 0.5, 0.12, x, 1.2, -0.95), C.seat, { ink: false });
    hull(boxAt(0.22, 0.16, 0.1, x, 1.5, -0.98), C.interior, { ink: false });
  }
  hull(new THREE.TorusGeometry(0.15, 0.022, 4, 10).rotateX(-0.4).translate(-0.3, 1.18, -0.1), C.interior, { ink: false });
  b.bone('canopy', 'hull', V(0, 1.02, -1.62));
  b.add(loft([
    { z: 0.62, pts: [[-0.58, 0.99], [-0.58, 0.995], [-0.4, 1.0], [0.4, 1.0], [0.58, 0.995], [0.58, 0.99]] },
    { z: 0.1, pts: [[-0.66, 1.0], [-0.6, 1.26], [-0.34, 1.44], [0.34, 1.44], [0.6, 1.26], [0.66, 1.0]] },
    { z: -0.95, pts: [[-0.66, 1.0], [-0.58, 1.26], [-0.32, 1.46], [0.32, 1.46], [0.58, 1.26], [0.66, 1.0]] },
    { z: -1.62, pts: [[-0.6, 1.0], [-0.52, 1.08], [-0.3, 1.12], [0.3, 1.12], [0.52, 1.08], [0.6, 1.0]] },
  ]), { to: 'glass', color: 0x2b4a68, bone: 'canopy' });
  b.add(strut(V(0, 1.0, 0.62), V(0, 1.45, 0.1), 0.08, 0.05), { color: sk.armour, bone: 'canopy' });
  b.add(strut(V(0, 1.46, 0.1), V(0, 1.47, -0.95), 0.08, 0.05), { color: sk.armour, bone: 'canopy' });
  b.add(strut(V(0, 1.47, -0.95), V(0, 1.13, -1.6), 0.08, 0.05), { color: sk.armour, bone: 'canopy' });
  for (const s of [-1, 1]) b.add(strut(V(s * 0.61, 1.27, 0.08), V(s * 0.6, 1.27, -0.95), 0.05, 0.06), { color: sk.armour, bone: 'canopy' });

  // ---- flank armour panels (lift in battle) over the missile pods (fixed to the hull)
  for (const [s, name] of [[-1, 'armorR'], [1, 'armorL']]) {
    b.bone(name, 'hull', V(s * 0.98, 0.8, -0.2));
    const panel = loft([
      { z: 1.5, pts: [[-0.02, 0.6], [-0.02, 0.78], [0.12, 0.88], [0.14, 0.62]] },
      { z: -1.7, pts: [[-0.02, 0.6], [-0.02, 0.8], [0.12, 0.92], [0.14, 0.62]] },
      { z: -2.4, pts: [[-0.02, 0.62], [-0.02, 0.78], [0.08, 0.86], [0.1, 0.64]] },
    ]);
    b.add((s < 0 ? mirrorX(panel) : panel).translate(s * 0.96, 0, 0), { color: sk.armour, bone: name });
    lamp(boxAt(0.02, 0.025, 2.6, s * 1.11, 0.66, -0.3), 'pursuit', sk.accent, 0x1a2a33, name);
    // Missile pods: two rows of two tubes per side, red tips, hidden under the panel in pursuit.
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      hull(cylZ(0.055, 0.6, s * 0.9, 0.7 + i * 0.11, 0.55 - j * 0.15, 8), sk.dark, { ink: false });
      lamp(cylZ(0.045, 0.04, s * 0.9, 0.7 + i * 0.11, 0.86 - j * 0.15, 8), 'battle', 0xff3040, 0x3a1015);
    }
  }

  // ---- rear deck: hatch doors over the turret well; the turret on lift > yaw > pitch > spin
  hull(boxAt(1.0, 0.03, 1.3, 0, 1.005, -2.3), C.under, { ink: false });
  // Two hatch doors hinged on their outer edges: in battle they stand up at a rake either side of
  // the turret like gun shields.
  for (const [s, name] of [[-1, 'hatchR'], [1, 'hatchL']]) {
    b.bone(name, 'hull', V(s * 0.52, 1.02, -2.3));
    b.add(boxAt(0.5, 0.05, 1.32, s * 0.26, 1.035, -2.3), { color: sk.armour, bone: name });
    b.add(boxAt(0.4, 0.02, 0.04, s * 0.26, 1.065, -1.9), { color: sk.dark, bone: name, ink: false });
  }
  b.bone('turretLift', 'hull', V(0, 0.5, -2.35));
  b.bone('turretYaw', 'turretLift', V(0, 0.5, -2.35));
  b.bone('turretPitch', 'turretYaw', V(0, 0.84, -2.25));
  b.bone('vulcanSpin', 'turretPitch', V(0, 0.84, -2.25));
  b.add(cylY(0.4, 0.3, 0, 0.42, -2.35, 12), { color: sk.dark, bone: 'turretYaw' });
  b.add(loft([
    { z: -1.75, pts: ring8(0.56, 0.24, 0.3, 0.72, 0.18, 0.82) },
    { z: -2.05, pts: ring8(0.54, 0.44, 0.52, 0.8, 0.34, 0.98) },
    { z: -2.7, pts: ring8(0.54, 0.44, 0.52, 0.8, 0.34, 0.96) },
    { z: -2.95, pts: ring8(0.56, 0.3, 0.36, 0.72, 0.24, 0.84) },
  ]), { color: sk.armour, bone: 'turretYaw' });
  b.add(boxAt(0.5, 0.03, 0.05, 0, 0.99, -2.0), { color: sk.dark, bone: 'turretYaw', ink: false });
  for (const s of [-1, 1]) {
    b.add(boxAt(0.16, 0.2, 0.6, s * 0.3, 0.84, -1.85), { color: sk.dark, bone: 'turretPitch' });
    // A three-barrel vulcan cluster per side on the spin bone (barrels point forward, +z).
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.add(cylZ(0.035, 1.4, s * 0.3 + Math.cos(a) * 0.06, 0.84 + Math.sin(a) * 0.06, -0.95, 6), { color: C.hub, bone: 'vulcanSpin', ink: k === 0 });
    }
    b.add(cylZ(0.11, 0.14, s * 0.3, 0.84, -1.55, 8), { color: sk.dark, bone: 'vulcanSpin' });
    b.add(cylZ(0.1, 0.08, s * 0.3, 0.84, -0.3, 8), { color: sk.dark, bone: 'vulcanSpin' }); // muzzle ring
  }
  lamp(boxAt(0.16, 0.07, 0.06, 0.0, 0.92, -1.74), 'battle', 0xff3040, 0x3a1015, 'turretPitch'); // targeting eye

  // ---- tail: nozzle, shoulder intakes, fins, tail lamps; headlamp slits in the prow
  hull(cylZ(0.4, 0.5, 0, 0.6, -3.25, 14, 0.34), sk.dark);
  hull(new THREE.CircleGeometry(0.31, 14).rotateY(Math.PI).translate(0, 0.6, -3.48), 0x050507, { ink: false });
  for (const s of [-1, 1]) {
    hull(boxAt(0.3, 0.16, 0.7, s * 0.62, 0.98, -2.75), sk.dark);
    lamp(boxAt(0.22, 0.08, 0.04, s * 0.62, 0.98, -3.11), 'intake', 0xffa040, 0x3a2412);
    // Angular tail fins: short and raked in our skin, long and tall in the classic one.
    const finLen = sk.fins ? 2.6 : 1.15, finH = sk.fins ? 0.75 : 0.42;
    const fin = new THREE.Shape([[0, 0], [-finLen * 0.75, finH], [-finLen, finH * 0.92], [-finLen * 0.96, 0]].map(([x, y]) => new THREE.Vector2(x, y)));
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateY(-Math.PI / 2);
    fg.rotateZ(-s * 0.12).translate(s * 0.82, 0.92, sk.fins ? -0.4 : -1.95);
    hull(fg, sk.armour);
    lamp(boxAt(0.4, 0.06, 0.04, s * 0.6, 0.76, -3.24), 'tail', C.tail, C.tailOff);
    lamp(boxAt(0.4, 0.04, 0.04, s * 0.6, 0.68, -3.24), 'brake', C.brake, C.tailOff);
    lamp(boxAt(0.42, 0.07, 0.05, 0, 0, 0).rotateY(s * -0.45).translate(s * 0.46, 0.6, 2.98), 'head', C.head, C.headOff);
    lamp(boxAt(0.2, 0.05, 0.05, s * 0.7, 0.4, 2.72), 'head', C.head, C.headOff);
  }
  if (sk.fins) for (const s of [-1, 1]) lamp(boxAt(0.02, 0.02, 4.4, s * 0.995, 0.86, 0.4), 'pursuit', sk.accent, 0x3a1015);

  // ---- wheels: pivot (steer) > swivel (strafe) > spin. The blade fenders ride the swivel; the
  // suspension arms ride a separate mount bone that follows the pivot but never steers.
  const wheels = [];
  [[1, B.frontZ, true], [-1, B.frontZ, true], [1, B.rearZ, false], [-1, B.rearZ, false]].forEach(([s, z, front], i) => {
    const r = B.wheelR, w = front ? B.frontW : B.rearW, x = s * B.trackX;
    b.bone(`wheel${i}`, 'root', V(x, r, z));
    b.bone(`swivel${i}`, `wheel${i}`, V(x, r, z));
    b.bone(`spin${i}`, `swivel${i}`, V(x, r, z));
    b.bone(`mount${i}`, 'root', V(x, r, z));
    const sp = `spin${i}`;
    const prof = [[r * 0.6, -w / 2], [r - 0.07, -w / 2], [r - 0.02, -w / 2 + 0.07], [r - 0.02, w / 2 - 0.07], [r - 0.07, w / 2], [r * 0.6, w / 2]].map(([a, c]) => new THREE.Vector2(a, c));
    b.add(new THREE.LatheGeometry(prof, 14).rotateZ(Math.PI / 2).translate(x, r, z), { color: C.tyre, bone: sp, smooth: true });
    // Chunky tread blocks proud of the tyre: a knobbly silhouette.
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      b.add(boxAt(w - 0.06, 0.06, 0.16, 0, r, 0).rotateX(Math.PI / 2 - a).translate(x, r, z), { color: C.tyreWall, bone: sp, ink: false });
    }
    b.add(cylX(r * 0.6, w * 0.86, x, r, z, 12), { color: sk.hub, bone: sp, smooth: true });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.add(boxAt(0.04, r * 0.5, 0.09, 0, r * 0.25, 0).rotateX(a).translate(x + s * w * 0.44, r, z), { color: sk.dark, bone: sp, ink: false });
    }
    b.add(cylX(0.11, w + 0.04, x, r, z, 8), { color: sk.cap, bone: sp });
    // Blade fender over the top of the tyre: steers and swivels with it.
    const arc = [];
    for (let k = 0; k <= 6; k++) {
      const a = 0.5 + 2.0 * (k / 6);
      const yi = r + Math.sin(a) * (r + 0.07), yo = r + Math.sin(a) * (r + 0.16);
      arc.push({ z: z + Math.cos(a) * (r + 0.1), pts: [[x - w / 2 - 0.05, yi], [x - w / 2 - 0.02, yo], [x + w / 2 + 0.02, yo], [x + w / 2 + 0.05, yi]] });
    }
    b.add(loft(arc), { color: sk.armour, bone: `swivel${i}` });
    // Suspension: two arms from the hull flank to the hub, and a coil-over strut.
    const hx = s * 0.92, ix = x - s * w / 2;
    b.add(strut(V(hx, 0.42, z + 0.25), V(ix, r - 0.06, z), 0.08, 0.06), { color: sk.dark, bone: `mount${i}` });
    b.add(strut(V(hx, 0.42, z - 0.25), V(ix, r - 0.06, z), 0.08, 0.06), { color: sk.dark, bone: `mount${i}` });
    b.add(strut(V(hx, 0.8, z), V(ix, r + 0.12, z), 0.1, 0.1), { color: C.hub, bone: `mount${i}` });
    wheels.push({ i, front, x, z });
  });

  return { tpl: b.template({ extraBounds: 0.8 }), wheels };
}

// Builds a Batmobile. opts.skin: 'nightjar' (default) | 'classic'.
export function createBatmobileModel({ skin = 'nightjar' } = {}) {
  const sk = SKINS[skin] ?? SKINS.nightjar;
  templates[skin] ??= buildTemplate(skin);
  const T = templates[skin];
  // Its own rimmed body material (a stronger cool rim so dark facets read in a night street);
  // glass and lamps are the fleet's shared ones.
  // [move] Rim widened and brightened, and a higher light floor (0.42): the dark facets keep their
  // shape against a night street instead of merging into one silhouette.
  const body = addRim(toonMaterial({ vertexColors: true }), sk.rim, 1.05, [0.58, 0.82], 0.42);
  body.name = `batmobile-body-${skin}`;
  const s = spawnTemplate(T.tpl, { materials: { ...fleetMaterials(), body } });
  const { group, bones } = s;
  group.name = 'batmobile';
  const B = BATMOBILE;

  const wheels = T.wheels.map((w) => ({
    pivot: bones[`wheel${w.i}`], swivel: bones[`swivel${w.i}`], spin: bones[`spin${w.i}`], mount: bones[`mount${w.i}`],
    front: w.front, rest: V(w.x, B.wheelR, w.z),
  }));

  // Jet glow, halo and afterburner flame: unlit, additive, FX layer, riding the hull bone.
  const jetGlow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), glowMaterial(0xffb020, 0.85));
  jetGlow.position.set(0, 0.6, -3.5);
  jetGlow.rotation.y = Math.PI;
  jetGlow.layers.set(LAYER_FX);
  const jetHalo = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), glowMaterial(0xff8a3d, 0.3));
  jetHalo.position.set(0, 0.6, -3.53);
  jetHalo.rotation.y = Math.PI;
  jetHalo.layers.set(LAYER_FX);
  // Cone: base at the nozzle, tip trailing back along -z, so scale.z stretches it.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.27, 1.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.8), glowMaterial(0xffc060, 0.7));
  flame.position.set(0, 0.6, -3.5);
  flame.material.side = THREE.DoubleSide;
  flame.layers.set(LAYER_FX);
  flame.visible = false;
  bones.hull.add(jetGlow, jetHalo, flame);

  const anchor = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    const pw = worldOf(parent);
    o.position.set(x - pw.x, y - pw.y, z - pw.z);
    parent.add(o);
    return o;
  };
  const seat = anchor('seat', bones.hull, -0.3, 1.0, -0.95);
  const ejectPoint = anchor('eject', bones.canopy, -0.3, 1.6, -0.9);
  const grapplePoint = anchor('grapple', bones.prow, 0, 0.32, 3.55);
  const missilePorts = [];
  for (const s2 of [-1, 1]) for (let i = 0; i < 2; i++) missilePorts.push(anchor(`missile${missilePorts.length}`, bones.hull, s2 * 0.9, 0.7 + i * 0.11, 0.9));
  const muzzles = [-1, 1].map((s2) => anchor(`muzzle${s2 > 0 ? 'L' : 'R'}`, bones.turretPitch, s2 * 0.3, 0.84, -0.25));
  const turret = { lift: bones.turretLift, yaw: bones.turretYaw, pitch: bones.turretPitch, spin: bones.vulcanSpin, muzzles };

  const lampState = { head: true, tail: true, pursuit: true }, last = {};
  applyLamps(s.lamps, s.lampRanges, lampState, last);
  const rest = {};
  for (const n of ['hull', 'prow', 'armorL', 'armorR', 'turretLift']) rest[n] = bones[n].position.clone();

  let mode = 0, strafe = 0, firing = false, afterburner = 0;
  const susp = [0, 0, 0, 0];
  function layoutWheels() {
    wheels.forEach((w, i) => {
      w.pivot.position.x = w.rest.x + Math.sign(w.rest.x) * B.battleTrack * mode;
      w.pivot.position.y = w.rest.y + susp[i];
      w.mount.position.copy(w.pivot.position);
    });
  }

  const api = {
    group, kind: 'batmobile', skin, wheels, jetGlow, jetHalo, flame, turret, seat, ejectPoint, grapplePoint, missilePorts, vulcanPorts: muzzles,
    canopy: bones.canopy, hull: bones.hull, bones,
    radius: B.radius, halfLength: B.halfLength, halfWidth: B.halfWidth, wheelRadius: B.wheelR,
    get mode() { return mode; },
    get strafe() { return strafe; },
    // 0 = pursuit, 1 = battle; values between blend (call every frame while transforming).
    setMode(t) {
      mode = Math.min(1, Math.max(0, t));
      bones.hull.position.y = rest.hull.y + B.battleRide * mode;
      bones.prow.position.set(rest.prow.x, rest.prow.y - 0.06 * mode, rest.prow.z + 0.22 * mode);
      const a = smooth(0, 0.5, mode);
      for (const [n, s2] of [['armorL', 1], ['armorR', -1]]) {
        bones[n].position.set(rest[n].x + s2 * 0.1 * a, rest[n].y + 0.16 * a, rest[n].z);
        bones[n].rotation.z = -s2 * 0.32 * a; // top edge flares outward
      }
      const h = smooth(0.05, 0.4, mode);
      bones.hatchL.rotation.z = -1.25 * h;
      bones.hatchR.rotation.z = 1.25 * h;
      bones.turretLift.position.y = rest.turretLift.y + B.turretRise * smooth(0.3, 0.85, mode);
      layoutWheels();
      api.setLamps({ battle: mode > 0.5, pursuit: mode <= 0.5 });
    },
    // Wheels turned toward sideways (t = 1: 90 degrees) for battle-mode strafing.
    setStrafe(t) {
      strafe = Math.min(1, Math.max(0, t));
      for (const w of wheels) w.swivel.rotation.y = (Math.PI / 2) * strafe;
    },
    aimTurret(yaw, pitch = 0) { bones.turretYaw.rotation.y = yaw; bones.turretPitch.rotation.x = -Math.min(0.7, Math.max(-0.25, pitch)); },
    setFiring(on) { firing = on; },
    setCanopy(t) { bones.canopy.rotation.x = -1.15 * Math.min(1, Math.max(0, t)); },
    // Per-wheel suspension travel in metres (+ up), e.g. from a ground probe under each wheel.
    setSuspension(travel) { for (let i = 0; i < 4; i++) susp[i] = Math.max(-0.2, Math.min(0.2, travel[i] ?? 0)); layoutWheels(); },
    setAttitude(pitch = 0, roll = 0) { bones.hull.rotation.x = pitch; bones.hull.rotation.z = roll; },
    setLamps(state) { Object.assign(lampState, state); applyLamps(s.lamps, s.lampRanges, lampState, last); },
    setAfterburner(level) {
      afterburner = Math.min(1, Math.max(0, level));
      flame.visible = afterburner > 0.02;
      flame.scale.set(0.6 + 0.4 * afterburner, 0.6 + 0.4 * afterburner, 0.3 + afterburner);
      api.setLamps({ intake: afterburner > 0.1 });
    },
    setBoost(on) {
      jetGlow.material.color.setHex(on ? 0xfff2c0 : 0xffb020);
      jetGlow.material.opacity = on ? 1 : 0.85;
      jetGlow.scale.setScalar(on ? 1.5 : 1);
      jetHalo.scale.setScalar(on ? 1.9 : 1);
      jetHalo.material.opacity = on ? 0.55 : 0.3;
      api.setAfterburner(on ? 1 : 0);
    },
    // Per-frame cosmetics only: the vulcans spin while firing, the flame flickers.
    update(dt) {
      if (firing) bones.vulcanSpin.rotation.z += dt * 30;
      if (flame.visible) flame.scale.z = (0.3 + afterburner) * (0.85 + 0.3 * Math.random());
    },
  };
  return api;
}

function worldOf(bone) {
  const v = new THREE.Vector3();
  for (let o = bone; o && o.isBone; o = o.parent) v.add(o.position);
  return v;
}
