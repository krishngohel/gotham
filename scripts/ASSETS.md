# Rebuilding assets

`assets-src/` is not committed. To rebuild `public/assets/`:

1. Download the Standard zips (free, no account) from
   - https://quaternius.itch.io/universal-base-characters
   - https://quaternius.itch.io/universal-animation-library
   - https://quaternius.itch.io/universal-animation-library-2
2. Copy into `assets-src/`: everything in `Base Characters/Godot - UE/`, `Hairstyles/Origin at 0/glTF (Godot)/Hair_Long.*` and its textures, `UAL1_Standard.glb`, `UAL2_Standard.glb`. The male body references `T_Eye_Normal_png.png` and `T_Hair_1_Normal_png.png`, which the pack does not ship: copy `T_Eye_Normal.png` and `T_Hair_1_Normal.png` to those names.
3. `npm run assets`

## Mocap clips (`anims_mocap.glb`, preloaded)

`public/assets/anims_mocap.glb` and the generated `src/config/mocapData.js` hold **56 clips**: the
five Meshy/Higgsfield kicks (Kick_Front, Kick_Round, Kick_Spin, Kick_Flying, Knee_Strike) and 51
Mixamo clips (strikes, goon moves, reactions, falls; `MIXAMO_CLIPS` in scripts/mixamo-fetch.mjs,
plus the `_M` mirrors). Animation events for them (warpStart, contact, cancel, recover, end, foot
plants) live in the additive `src/config/clipEvents.js` (`node scripts/clip-events.mjs --existing`);
mocapData.js itself is never edited by that step.

The five kicks: export the unskinned `SuperHero_Male` body from `assets-src/` in its bind pose,
upload it to Higgsfield; the `3d_rigging` action auto-rigs it (Meshy, 24-joint Mixamo-style
skeleton) and applies a clip. Motion ids used: 206 Spartan Kick (front), 207 Roundhouse Kick, 216
Lunge Spin Kick, 422 Rising Flying Kick, 211 Boxing Guard Step Knee Strike. Download each result
as GLB into `assets-src/mocap/` (`spartan.glb`, `roundhouse.glb`, `spin.glb`, `flying.glb`,
`knee.glb`) and retarget with `--map meshy` (`:calf_r` names the knee's striking limb):

```
node scripts/retarget-mocap.mjs Kick_Round=assets-src/mocap/roundhouse.glb Kick_Front=assets-src/mocap/spartan.glb Kick_Spin=assets-src/mocap/spin.glb Kick_Flying=assets-src/mocap/flying.glb Knee_Strike=assets-src/mocap/knee.glb:calf_r
```

The Mixamo ones: `node scripts/mixamo-fetch.mjs` (see below), `node scripts/fbx2glb.mjs`, then
`retarget-mocap.mjs --map mixamo --append Name=assets-src/mixamo/Name.glb[flags] ...`.
`node scripts/optimize-assets.mjs` resamples the pack with the others.

## Lazy animation packs (Long Night 2)

Five more packs are **not** preloaded; `src/actors/animPacks.js` loads them on demand:
`anims_combat2.glb` (hero melee, evades, blocks, counters, travel strikes, finishers, the shared
directional reaction/knockdown/get-up table), `anims_enemies.glb` (shield, baton, brute, knife,
pistol, rifle, sniper, ninja/sword, medic, thug, fear, boss), `anims_heroes.glb` (staff, acrobatics,
flight, brawler, agile kicks), `anims_civ.glb` and `anims_story.glb`. Data per clip (duration,
contact, root motion, `kind`, `loop`, `events`, `pair`) is in `src/config/mocapData.<pack>.js`.
Every clip, its Mixamo source and its intended use: `docs/design/anim-manifest.md`.

One table drives everything: `scripts/anim-packs.mjs` (`PACK_CLIPS`, `DROPPED`).

1. Mixamo login: a Chrome the owner is logged into, started with `--remote-debugging-port=9555`
   and its own `--user-data-dir`, with a mixamo.com tab open. The token never leaves that page.
2. Fetch (sequential, backs off on HTTP 429), into the main checkout's git-ignored folder:
   `MIXAMO_DIR=<main checkout>/assets-src/mixamo node scripts/mixamo-fetch.mjs --packs`
   (`node scripts/mixamo-catalog.mjs` dumps the whole Motion catalogue to `catalog.json` there,
   for choosing clips offline.)
3. Bake (needs a vite dev server for the FBX conversion):
   `MIXAMO_DIR=... DEV_URL=http://localhost:<port> node scripts/bake-packs.mjs [pack ...]`
   = fbx2glb, `retarget-mocap.mjs --map mixamo --no-ease --pack <pack>`, `optimize-assets`
   (resample + 16-bit rotations), `clip-events.mjs --pack <pack>` (kind, loop, events, pair offsets).
4. Check: `node scripts/anim-check.mjs` (NaN, duration, feet, wrong-way knees/elbows, twisted
   forearms/wrists/neck; calibrated on anims_mocap.glb) and look at contact sheets:
   `DEV_URL=... node tools/pack-sheets.mjs <outDir> [--packs=..] [--cats=..]`. Put bad clips in
   `DROPPED` with the reason and bake again; `node scripts/anim-manifest.mjs` regenerates the manifest.

Check any clip in `tools/pose-viewer.html` (`?packs=combat2&clip=Dodge_Roll`), contact sheets of
the preloaded kicks via `node tools/kick-sheets.mjs`, or loop one live in `tools/kick-live.html`;
`node tools/contact-shots.mjs` screenshots every move on its contact frame in the fight sandbox.

## Character textures

`public/assets/tex/*.webp` are painted by `node scripts/paint-suits.mjs` (all jobs; `--only
bat_m_mask,nightwing,...` for some, `--preview <dir>` for software previews). Region maps live in
`src/heroes/models/costumes.js` (roster heroes) and in the painter itself (Batman mask, Nightwing,
line and face sheets). `bat_m_mask.webp` is stored lossless because it is data, not colour.
Check every character under the game's pipeline in `tools/roster.html`; contact sheets with
`node scripts/model-shots.mjs --roster http://localhost:<port> <outDir> [id|group ...]`.
