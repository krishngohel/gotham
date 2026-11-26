# Lighting: no scene too dark to read

Branch `ln2/light`. The owner's instruction was "make sure no scenes are too dark". This file is
the record of what was measured, what the limits are, what was changed and how to check it again.

## 1. The measurement

`scripts/darkness-audit.mjs` boots the game headless, goes to every scene it can find, captures the
frame with the HUD hidden and with the HUD shown, and measures:

| number | what it is |
|---|---|
| mean, median | luma of the frame, sRGB-encoded, 0..100 (Rec. 709 weights) |
| near-black | share of the frame's pixels under 8 % luma |
| hero | separation of the hero from the ring of background around them, in luma points: the larger of the difference between the figure's mean and the ring's mean, and half the figure's own p95 - p10 range (a rim-lit dark suit on a dark wall). The figure is the middle of the hero's projected bounding box. |
| enemy | the same for every goon or boss in view within 30 m. In a real fight or boss the worst one counts (the second worst when three or more are in view); for the three goons the audit itself stands in front of the hero, the best lit one does (the question there is whether a goon reads in that light). Figures behind a wall from the camera are left out. |

Scenes come from the game's own data, so a new mission's places are checked without editing the
script:

- every district: the street node nearest its centre, the nearest rooftop, a glide high above it;
- every covered volume (`world.covers`: the Lower Gotham deck, the pier undercroft);
- every named site: `SITES`, each region's `sites`, each night's `sites`, the middle of each
  night's fights (with three goons), each predator room with its squad on its marks;
- every interior room and every room and area of every pocket (Manor, Batcave, Wayne Tower);
- every boss the director has registered (campaign and open world), each of its phases;
- the four screen grades of `src/story/viewFx.js` at full strength, detective vision, a cinematic
  orbit, driving, the title screen, split screen (each half measured on its own);
- the campaign itself: every step of every night that has a place, entered through the flow's
  own `jump` (so the beat's pinned hour and weather, its enemies, its boss and whatever a step type
  puts on screen are what the player gets). Full audit only.

Conditions: every district under a night storm, a clear night and a foggy night; a spread of
streets, roofs and a deck under every weather at night and under clear, storm, fog and snow at
23:00, 05:00, 05:30, 06:30, 12:00, 18:30, 19:00 and 20:00. Before each condition the weather is run
for four minutes so the street is in its steady state (wet, dry, snowed in).

A site on a door sill or against a wall is stepped 3 m out into the open first. A frame whose
follow camera still cannot see the hero (it is inside a wall or behind a pillar) is listed as
"not measured" rather than as dark. Lightning is switched off while measuring.

What the audit does not do: it stands still. It does not measure motion blur of rain against a
dark wall, a fight in progress, or a cutscene comic page (those are drawn panels, not the lit
scene). The hero is the default Batman suit.

## 2. Limits

Calibrated by looking at the frames of the first runs, not chosen in advance:

| | clearly too dark (before) | clearly fine | limit |
|---|---|---|---|
| median | Robinson Park street, High, night storm: 6.7; Loop street: 7.8-8.6 | Docks street, High: 18; the Narrows on Low: 11.4 | **>= 9.5** |
| near-black | same frame: 0.61; Loop street: 0.51 | Docks: 0.16; the Narrows on Low: 0.27 | **<= 0.35** |
| mean | 10.7 | 17.3 | **>= 12** |
| hero | Loop rooftop against a dark window: 0.5-1.0 | 7-20 on open streets; 5.9 under the deck, plainly readable | **>= 5** |
| enemy | | 8-25 | **>= 5** |

In the "too dark" frames the road, the far wall and the hero's cape are one black shape; in the
"fine" ones the road has a tone and the hero is a dark figure on it. A deliberately dark beat (a
boss arena, a fear-gas or heat grade) may go down to mean 8, median 5, near-black 0.6, but its hero
and enemy limits are the same as everywhere else.

The median limit is 9.5 rather than 10 because one wide dark asphalt road (Robinson Park) measures
9.8-11.8 at every hour including noon in a storm: that is the road's own tone, not a lighting fault.

The limits live in `LIMITS` at the top of the script.

## 3. What was too dark, and why

Compared on 1432 frames that both runs captured (same place, tier, hour and weather; frames whose camera was inside geometry left out). Before = `long-night-2` at ce3e870; after = this branch.

| tier | frames compared | under the frame limits before | after | median of the darkest tenth, before | after |
|---|---|---|---|---|---|
| high | 760 | 96 | 2 | 8.0 | 12.7 |
| low | 583 | 19 | 2 | 9.4 | 13.2 |
| potato | 89 | 1 | 0 | 10.5 | 13.8 |

The 91 scenes that were under the frame limits before (each with its darkest hour and weather; the last column counts how many of its measured conditions were under):

| scene | tier | hour-weather | mean | median | near-black | hero | conditions under |
|---|---|---|---|---|---|---|---|
| fx-heat-gothamMile | high | 2-storm | 10.5 -> 22.4 | 1.6 -> 16.5 | 0.585 -> 0.091 | 8.8 -> 9.6 | 1 |
| fx-heat-clock | high | 2-storm | 9.3 -> 22.1 | 3.5 -> 18 | 0.647 -> 0.075 | 8.2 -> 9.6 | 1 |
| fx-fear-gothamMile | high | 2-storm | 10.9 -> 20.2 | 3.5 -> 14.9 | 0.58 -> 0.11 | 7.5 -> 8.6 | 1 |
| fx-heat-clock | low | 2-storm | 10.3 -> 21.7 | 3.9 -> 16.9 | 0.637 -> 0.1 | 7.5 -> 11.9 | 1 |
| fx-heat-narrows | high | 2-storm | 10.2 -> 22.7 | 4.3 -> 18.8 | 0.619 -> 0.072 | 10.2 -> 9.6 | 1 |
| fx-fear-clock | low | 2-storm | 10.5 -> 19.4 | 4.7 -> 15.3 | 0.635 -> 0.119 | 12.9 -> 10.3 | 1 |
| fx-fear-clock | high | 2-storm | 9.6 -> 19.8 | 4.7 -> 16.1 | 0.644 -> 0.085 | 7.3 -> 8.8 | 1 |
| fx-fear-narrows | high | 2-storm | 10.3 -> 20.4 | 5.1 -> 16.9 | 0.612 -> 0.086 | 8.6 -> 8.8 | 1 |
| cover-0-20 | high | 18h5-storm | 10.1 -> 14.4 | 6.7 -> 12.2 | 0.569 -> 0.158 | 7.6 -> 6.3 | 15 |
| site-batcaveDowntown | high | 2-storm | 9.4 -> 13.7 | 6.7 -> 11.4 | 0.731 -> 0.115 | - -> - | 1 |
| n3-site-n3BankS | high | 2-storm | 11.7 -> 14.9 | 6.7 -> 10.6 | 0.618 -> 0.181 | 8.8 -> 8.4 | 1 |
| boss-scarecrow-p2-rounds | high | story | 9.6 -> 37.7 | 6.7 -> 40 | 0.604 -> 0.02 | 9.8 -> 13.9 | 1 |
| n3-fight-n3Couriers | high | 2-storm | 11.1 -> 14.9 | 6.7 -> 10.6 | 0.665 -> 0.185 | 9.2 -> 9.6 | 1 |
| district-robinsonPark-street | high | 2-storm | 11.3 -> 14 | 7.1 -> 10.6 | 0.567 -> 0.176 | 8 -> 7.6 | 2 |
| site-loadingDock | high | 2-storm | 10.8 -> 15.7 | 7.1 -> 11.8 | 0.561 -> 0.067 | - -> 6.5 | 1 |
| n2-site-n2Board | high | 2-storm | 10.3 -> 13.6 | 7.1 -> 10.6 | 0.57 -> 0.133 | 9.6 -> 11 | 1 |
| n3-fight-bank | high | 2-storm | 10.9 -> 14.6 | 7.1 -> 11 | 0.651 -> 0.188 | 5.5 -> 7.8 | 1 |
| n4-fight-n4Carriers | high | 2-storm | 11.9 -> 15.4 | 7.1 -> 11.4 | 0.567 -> 0.136 | 9.4 -> 8.6 | 1 |
| site-canyonBank | high | 2-storm | 13.1 -> 16.2 | 7.5 -> 11.4 | 0.529 -> 0.281 | 8 -> 9.8 | 1 |
| n3-site-n3Bank | high | 2-storm | 11.4 -> 14.5 | 7.5 -> 11.4 | 0.606 -> 0.181 | 7.8 -> 7.5 | 1 |
| n3-site-n3BombA | high | 2-storm | 12.4 -> 15.2 | 7.5 -> 11 | 0.55 -> 0.195 | 8.8 -> 9.4 | 1 |
| n4-site-n4Car | high | 2-storm | 12.2 -> 15.2 | 7.5 -> 11 | 0.539 -> 0.136 | 13.9 -> 13.7 | 1 |
| n4-site-n4Canister | high | 2-storm | 14.3 -> 17.4 | 7.5 -> 11.4 | 0.518 -> 0.298 | 8.6 -> 7.6 | 1 |
| n2-fight-n2Valet | high | 2-storm | 13.1 -> 16.2 | 7.5 -> 11 | 0.521 -> 0.155 | 7.1 -> 8 | 1 |
| n3-site-n3PlateW | high | 2-storm | 14 -> 17.3 | 7.8 -> 11.8 | 0.523 -> 0.186 | 8 -> 8.6 | 1 |
| n3-site-n3GalaNorth | high | 2-storm | 14.2 -> 17.9 | 7.8 -> 12.2 | 0.5 -> 0.16 | 8 -> 7.6 | 1 |
| n3-fight-bombCrew | high | 2-storm | 14.7 -> 18.6 | 7.8 -> 12.5 | 0.506 -> 0.247 | 10.6 -> 11.6 | 1 |
| district-lowerGotham-street | low | 18h5-storm | 16.9 -> 19.3 | 8.2 -> 11.4 | 0.492 -> 0.14 | 8 -> 14.5 | 2 |
| cover-0-20 | low | 18h5-storm | 11.3 -> 15.1 | 8.2 -> 12.5 | 0.436 -> 0.066 | 8 -> 8.1 | 3 |
| site-lowerDeck | high | 2-storm | 11.5 -> 15.6 | 8.2 -> 12.9 | 0.458 -> 0.045 | 7.6 -> 7.1 | 1 |
| n3-site-n3CityHallStreet | high | 2-storm | 14.3 -> 17.8 | 8.2 -> 12.2 | 0.491 -> 0.193 | 8 -> 7.6 | 1 |
| n3-site-n3PlateC | high | 2-storm | 15.6 -> 18.8 | 8.2 -> 11.8 | 0.481 -> 0.133 | 8.2 -> 12.5 | 1 |
| n7-fight-lowerDeck | high | 2-storm | 11 -> 15.6 | 8.2 -> 12.9 | 0.492 -> 0.05 | 7.6 -> 8 | 1 |
| n4-fight-stackGuard | high | 2-storm | 12.6 -> 16.5 | 8.2 -> 13.3 | 0.482 -> 0.142 | 6.1 -> 7.6 | 1 |
| district-loop-street | high | 2-storm | 12.4 -> 14.6 | 8.6 -> 11.8 | 0.468 -> 0.163 | 8 -> 6.9 | 1 |
| cover-0-50 | high | 2-storm | 11.7 -> 15.7 | 8.6 -> 13.3 | 0.441 -> 0.057 | 8.2 -> 8.8 | 2 |
| cover-0-80 | high | 2-storm | 11.5 -> 15.5 | 8.6 -> 13.3 | 0.448 -> 0.045 | 7.5 -> 6.9 | 2 |
| n7-site-n7Tanker1 | low | 2-storm | 10.7 -> 13.6 | 8.6 -> 11.8 | 0.412 -> 0.07 | 16.9 -> 12.5 | 1 |
| site-marqueeRow | high | 2-storm | 18.3 -> 21.3 | 8.6 -> 13.3 | 0.487 -> 0.232 | 8.6 -> 9.2 | 1 |
| site-yardsCrusher | high | 2-storm | 9 -> 11.9 | 8.6 -> 14.1 | 0.486 -> 0.358 | 3.7 -> 2.2 | 1 |
| n4-site-n4ClinicBed | high | 2-storm | 11.9 -> 16.4 | 8.6 -> 13.3 | 0.445 -> 0.129 | 8.8 -> 9.8 | 1 |
| n5-fight-crusherRaid | high | 2-storm | 9 -> 11.9 | 8.6 -> 14.1 | 0.486 -> 0.357 | 3.7 -> 2.2 | 1 |
| cinematic-clock | high | 2-storm | 10.4 -> 14.4 | 8.6 -> 13.3 | 0.453 -> 0.105 | 12.5 -> 12.2 | 1 |
| n3-site-n3BankN | high | 2-storm | 12.1 -> 15 | 9 -> 13.3 | 0.419 -> 0.197 | 7.8 -> 7.5 | 1 |
| n3-site-n3Bomb | high | 2-storm | 15.3 -> 18.7 | 9 -> 12.5 | 0.463 -> 0.245 | 9.6 -> 11 | 1 |
| ... and 26 more | | | | | | | |

After, 16 of 2,330 frames are still under a limit (final limits). Every one was looked at; none is a
lighting fault:

| frame (tier) | flagged for | what the frame shows |
|---|---|---|
| `site-yardsCrusher`, `n5-fight-crusherRaid` (High, Low) | near-black 0.35-0.36, hero 2.2 | the follow camera is behind a shipping container that fills the frame |
| `site-pumpingTowerTop`, `n2-site-n2Gate3` (High, Low) | hero 2.4-3.8 | the tower's spire (no collision box) stands between the camera and the hero; the frame is bright |
| `n4-step-n4Canister` (High, story walk) | median 9, near-black 0.47 | the camera is pressed against the hero's back under an awning |
| `n8-step-n8Market` (High, story walk) | near-black 0.38, enemy 0.7 | a market stall's wall fills the top two thirds of the frame |
| `n3-step-toAlley`, `n3-step-deliveryAlley` (High, story walk) | near-black 0.42 | the left third is the wall the camera stands beside; the alley, the hero and the goon are lit and clear |
| `n1-step-a2`, `n1-step-toFactory` (High, story walk) | enemy 3.5-4.9 | a goon 25 m away against a lit skyline; the near ones read |
| `boss-firefly-p1-torchlight` (High) | hero 4.6 | the hero on open lit grass; the cape (at its light cap) and the grass have the same luma, the ink outline separates them |
| `split-cover-0-20` (High, right-hand view) | hero 2.4 | the number is the other player's cape at the edge of the view; that view's own hero is plain |


Before (left) and after (right), `docs/design/shots/light/`:

- `cinematic-clock-high-2-storm.jpg`
- `cover-0-20-high-2-storm.jpg`
- `district-chinatown-street-high-6h5-storm.jpg`
- `district-gothamMile-street-high-2-storm.jpg`
- `district-loop-street-high-2-storm.jpg`
- `district-neon-street-high-2-storm.jpg`
- `district-robinsonPark-street-high-2-storm.jpg`
- `fx-fear-clock-high-2-storm.jpg`
- `fx-heat-gothamMile-high-2-storm.jpg`
- `interior-aceHall-corner-high-2-storm.jpg`
- `n3-fight-n3Couriers-high-2-storm.jpg`
- `n3-site-n3Bank-high-2-storm.jpg`
- `n7-fight-lowerDeck-high-2-storm.jpg`
- `site-lowerDeck-high-2-storm.jpg`

The Brightness row and its calibration tile: `brightness-setting-100.jpg`, `brightness-setting-140.jpg`.

Causes, in the order they mattered:

1. **Shadow-map tiers lose the moon in the streets.** On Medium and up a street between towers is
   in the buildings' shadow, so it is lit by the hemisphere fill alone: 0.75, with a ground colour
   of `0x14171f`. A dark asphalt under that renders at 3-4 % luma. Potato and Low have no shadow
   maps, the moon reaches every street, and they were the brighter tiers.
2. **The darkest hour was not midnight.** The 19:00 key frame has a key light of 1.0 and the 05:30
   one 1.4 (the night's moon is 2.4), and rain dims the key by a further 30 % while there is still
   daylight. Dusk and dawn in a storm were darker than 02:00.
3. **Weather stacked on the night.** Wet streets darken up-facing surfaces by 30 %
   (`src/env/surfacePatch.js`), at night as much as by day.
4. **Under a deck and indoors** only the fill arrives (and on Potato there are no pool lights at
   all), so the Lower Gotham deck and the darker rooms sat at the bottom of every list.
5. **The vignette** took the corners to 64 % of the centre: the bottom corners of a night street,
   already its darkest part, went to black.
6. **The tone patterns.** The ink pass draws cross-hatching and halftone dots in full ink wherever
   a surface is under 20 % luma, which at night is every road and wall near the camera. More fill
   alone did not move the near-black share: the pattern was what read as black.
7. **The fear and heat screen grades** (`viewFx.js`) used CSS `contrast(1.15)` / `contrast(1.2)`,
   which pivots at mid grey: on a night frame it pushes everything under 50 % toward black.

## 4. What changed

All of it is uniform and light-property writes. No light was added, none casts a new shadow, no
shader gained a per-pixel light, and the only new shader work is one multiply that was already
there (the vignette, now a uniform), one more multiply by a uniform on the two tone-pattern lines,
and one `pow` that runs only when Brightness is not 100 %.

| change | where |
|---|---|
| **Readability floor** `applyReadability`: how dark the hour is comes from the frame's own fill (`dark` = 1 at a fill of 1.15 or less, 18:00 to 06:30; 0 from 1.5 up, 08:00 to 16:00). In the dark: the fill's ground colour lifts from near-black to a navy (`0x2b3550`) and its sky colour toward `0xa3b4da`; the fill has a floor in received light (intensity x sky luminance never under the lifted night's: 0.75 x 1.5, and x1.7 again on tiers with shadow maps); the key light never drops under 1.7; the wet-street darkening fades to a fifth. Channels and intensities are only ever raised. The key frames themselves (`NIGHT` and the rest) are unchanged. | `src/env/look.js`, `src/env/envSystem.js` |
| **Tone patterns print lighter in the dark**: hatching and shadow dots at 55 % strength at night (a uniform, `uToneInk`); outlines stay full ink. | `src/render/inkPipeline.js`, `src/env/look.js` |
| **Indoor and under-deck fill**: `world.update` knows whether the player is in an interior room or a pocket (x1.7 fill, warm neutral bounce) or under a covered deck (x1.7, cool bounce), eased over a third of a second. | `src/game/world.js`, `src/env/look.js` |
| **Vignette** 0.72 -> 0.5 (a uniform now). | `src/render/inkPipeline.js` |
| **Fear and heat grades**: `contrast()` replaced by a small `brightness()`; the hue and saturation carry the effect. | `src/story/viewFx.js` |
| **Brightness setting** (section 5). | `src/render/brightness.js`, `src/ui/brightnessControl.js`, settings, menus |

Cost, by the perf gate's structural counts (`node scripts/perf-gate.mjs`; the machine was shared, so
frame times are not quoted): on Potato, at all seven sites, the unchanged build and this branch
gave the same draw calls (within 2), the same lit point lights (0), the same shader programs (120),
the same visible skinned meshes and the same matrix walk. High and Low are within the recorded
budget. (One cell of the budget, Potato / narrows / visible skinned meshes, sits at 69-70 against
a ceiling of 69 on the unchanged build as well: crowd variance, not lighting.)

What was deliberately left alone: the sky, the fog, the moon and the rim light; the ink outlines
and the shape of the hatching and dots; the toon bands; every character material (Batwoman's included);
the cape's light cap (`src/actors/cape.js`); the comic palette.

## 5. The Brightness setting

Settings > Video > Brightness (also under Accessibility > Screen). 60 %..160 %, default 100 %,
saved in `gotham-settings-v1` with the other settings (an older save loads with 100 %).

It is a gamma on the finished frame, the ink pass's last step: `out = in ^ (1 / brightness)` in
linear light. A gamma keeps black and white where they are, so ink stays ink and paper stays
paper, and moves the dark mid-tones. It is one uniform shared by every view, so split screen and
every tier follow it; at 100 % the shader skips it. The HUD is DOM and is not affected.

The calibration tile under the slider shows two bats on black, tinted by the same curve: "move the
slider until the left bat is barely visible and the right one is easy to see". Their linear values
(0.0028 and 0.02) sit where the night city's shadow tones do.

`?brightness=1.3` overrides the setting for a session (the audit's `BRIGHT=` uses it).

Measured on Potato at the GCPD (night storm), frame mean / median / near-black: 70 % 15.0 / 12.5 /
0.34; 100 % 25.7 / 25.1 / 0.13; 140 % 37.4 / 38.0 / 0.00, and the same in both halves of a split
screen (14.1, 24.7, 36.4). At 140 % even the ink (`0x0b0b12`, not a pure black) is above 8 %.

## 6. Checking it again

```
npm run test:darkness      # builds, then the fast set on High, Low and Potato (279 frames, about
                           # 12 minutes); exit 1 when a frame is under a limit or a page errors
npm run audit:darkness     # builds, then the full audit (about 45 minutes a tier)
```

Both use one headless browser and one page at a time, the tiers one after another (a game page
costs about 2 GB of memory). Both serve the build from disk through the browser's request interception: no server and no port.
Useful variations (environment variables, see the script's header):

```
DIST=dist Q=high GROUP=city,sites node scripts/darkness-audit.mjs      # one tier, some groups
DIST=dist ONLY=n4 GROUP=story node scripts/darkness-audit.mjs         # one night's steps
BASE=http://localhost:5960/ SET=fast node scripts/darkness-audit.mjs  # against a running vite
```

Output goes to `tmp/darkness/`: `audit.md` (the table, darkest first, with the frames under the
limits on top), `audit.json`, and a JPEG of every frame under `frames/<tier>/`. Read the flagged
frames; a number is a reason to look, not a verdict.

The game must run with dev tools (`?god=1`, which the script passes): it reads the campaign's
registry from `window.__game.campaign` and everything else from the running game.

Unit tests: `tests/unit/lightReadability.test.js` (the floor never darkens any hour in any
weather, has no jump across the clock, adds no light) and `tests/unit/brightness.test.js`.

## 7. Known gaps

- **The hero number is fooled by props without collision boxes.** The audit knows a figure is
  hidden when a collision box is in the way; an awning, a sign or a spire with no box hides the
  hero and the number drops to 2-4 on a perfectly lit frame (`site-pumpingTowerTop`,
  `site-yardsCrusher` on High). A hero or enemy flag needs a look at the frame before it is
  believed. A better measure would render the frame twice, with and without the figure, and
  compare; it would also double the audit's time.
- **Door sites.** A handful of sites are door sills inside a wall's thickness; where stepping 3 m
  out does not find open ground the follow camera ends up inside the wall and the frame is listed as
  not measured (`arkhamMainHallDoor`, `blackgateCellBlockB`, `wayneManorTerrace`,
  `chinatownMahjongDoor`). Their surroundings are covered by the neighbouring sites.
- **Boss frames depend on the moment.** The audit starts each boss, steps it through its phases
  with the director's `debugPhase()` and shoots 2.6 s into each; a searchlight sweep or a blackout
  round may or may not be in that frame. The bosses' own screen effects were not changed, except
  through `viewFx.js` (fear, heat).
- **Comic cutscene pages** are drawn panels, not the lit scene, and are not measured. In-engine
  cinematics are (an orbit at a spread of streets, and each story step's own camera moment when
  the story walk lands on it).
- **Only the default Batman suit** is measured as the hero; the roster's other heroes use the same
  rim and floor (`addRim`, `HERO_LIFT`) but were not audited one by one.
- **Medium and Ultra** were not run (Medium shares High's lighting model with smaller shadow maps;
  Ultra adds screen-space AO and contact shadows drawn as hatching, which the lighter tone
  patterns also soften). `Q=medium,ultra` runs them.
- **The cape.** In wind the hero's cape renders at its light cap (about 20 % grey, the open polish
  item "cape renders pale from behind in play"). It does so on the unchanged build as well; this
  branch does not touch `src/actors/cape.js`. The cap is what keeps the stronger fill from lighting
  it further.
- **Rain shows inside the Batcave** in the audit's cave frames (the pocket is entered with a
  storm pinned). Not a lighting matter; noted for whoever owns the pockets.
