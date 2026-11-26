# Credits

Gotham: The Long Night is an unofficial, non-commercial fan game. Batman, Batwoman, Batgirl,
Nightwing, Robin, Red Robin, Red Hood, Superman, Alfred, Commissioner Gordon, Harley Quinn, the
Riddler, the Joker, the other villains and Gotham City belong to DC. This project is not affiliated
with or endorsed by DC or Warner Bros. Discovery. All level design, writing, costume and emblem
designs, vehicles and UI are original to this game; character names live in data files.

Dates: "downloaded" is the date recorded when the asset was fetched; where none was recorded, the
date the file first entered this repository (from git history) is given as "added".

## Code libraries shipped in the game

| Library | Version | Licence | Source | Added |
|---|---|---|---|---|
| three.js | 0.186.1 | MIT | https://github.com/mrdoob/three.js | 2026-11-06 |
| Trystero (online co-op signalling and WebRTC, lazy-loaded) | 0.26.0 | MIT | https://github.com/dmotz/trystero | 2026-11-24 |
| @trystero-p2p/core, @trystero-p2p/nostr (Trystero's own packages) | 0.26.0 | MIT | https://github.com/dmotz/trystero | 2026-11-24 |
| @noble/secp256k1 (Paul Miller; used by Trystero's Nostr strategy) | 3.2.0 | MIT | https://github.com/paulmillr/noble-secp256k1 | 2026-11-24 |

Build and test tools (vite, vitest, Playwright, glTF-Transform, sharp) are development
dependencies only and are not shipped in `dist/`; see `package.json` for versions.

Online services used at run time, not shipped: room codes are exchanged over public Nostr relays
through Trystero, and WebRTC uses the public STUN servers `stun.cloudflare.com` and
`stun.l.google.com` (`src/net/transport/webrtc.js`). The "Paste codes" and "Same PC" modes use
no relay.

## Fonts

Loaded at run time from Google Fonts (`index.html`), not stored in the repository. All under the
SIL Open Font License 1.1 (https://openfontlicense.org). Added 2026-11-06.

- Bangers by Vernon Adams: https://fonts.google.com/specimen/Bangers
- Barlow Condensed by Jeremy Tribby: https://fonts.google.com/specimen/Barlow+Condensed
- Patrick Hand SC by Patrick Wagesreiter: https://fonts.google.com/specimen/Patrick+Hand+SC

## Characters and animation

- **Quaternius**: Universal Base Characters, Universal Animation Library and Universal Animation
  Library 2 (https://quaternius.com; downloads at https://quaternius.itch.io/universal-base-characters,
  https://quaternius.itch.io/universal-animation-library,
  https://quaternius.itch.io/universal-animation-library-2). Obtained under CC0 1.0
  (https://creativecommons.org/publicdomain/zero/1.0/) as stated on the pack pages; added
  2026-11-06 (download date not recorded). Shipped as `public/assets/hero_m.glb`, `hero_f.glb`,
  `hair_long.glb`, `outfits.glb`, `anims1.glb`, `anims2.glb`, rebuilt by `scripts/build-assets.mjs`
  (see `scripts/ASSETS.md`). Note: Quaternius's site licence page has, since 2026-08-28, been the
  Quaternius Asset License v1.0 (https://quaternius.com/license.html), which allows use in games but
  not redistribution as a standalone asset pack. Any future download must record its date and the
  licence file inside its zip.
- **Adobe Mixamo** (https://www.mixamo.com): animations downloaded on the X Bot / Y Bot characters,
  retargeted onto the Quaternius skeleton and baked into this game's own packs by
  `scripts/retarget-mocap.mjs`: `anims_mocap.glb` (added 2026-11-06) and the lazy-loaded
  `anims_combat2.glb`, `anims_enemies.glb`, `anims_heroes.glb`, `anims_civ.glb`,
  `anims_story.glb` (added 2026-11-24). The per-clip Mixamo source names are listed in
  `docs/design/anim-manifest.md`. Used under Adobe's Mixamo terms for use in this game only: the raw
  Mixamo files are not distributed with this project, and the baked clips are not licensed for
  reuse outside it. The project's licence (if any) does not cover these animations.
- **Kick motion capture** (roundhouse, Spartan kick, lunge spin kick, rising flying kick, step knee
  strike): the game's own body auto-rigged with Meshy through Higgsfield
  (https://higgsfield.ai), motion ids 206, 207, 211, 216, 422, then retargeted onto the Quaternius
  skeleton by `scripts/retarget-mocap.mjs`. Baked into `anims_mocap.glb`; added 2026-11-06.
- **Character textures** (Batman's recolourable suit mask, Nightwing, the roster heroes, the line
  and face sheets for civilians, the original suits) are painted procedurally in code by
  `scripts/paint-suits.mjs` from the Quaternius bodies; all costume and emblem designs are original.
  No third-party textures were downloaded for the character work (2026-11-24).
- **Suit-select card art** (`public/assets/art/card_m.webp`, `card_f.webp`) was generated with
  Higgsfield (Seedream 4.5) from prompts written by the developer; added 2026-11-06.

## Sound

- The score, the city ambience, the voice blips and most sound effects are synthesised live in the
  browser, in code (`src/audio/`).
- Sampled layers mixed over the synthesised impacts, footsteps, glass, doors and props
  (`public/assets/audio/combat`, `steps` and `world`, built by `scripts/build-audio-samples.mjs`:
  trimmed, normalised, re-encoded as Opus in WebM with an MP3 fallback):
  - "Impact Sounds" 1.0 by Kenney (https://www.kenney.nl). CC0 1.0
    (https://creativecommons.org/publicdomain/zero/1.0/). Source: https://kenney.nl/assets/impact-sounds.
    Licence checked on the asset page and in the pack's License.txt; downloaded 2026-11-24. Used:
    impactPunch_heavy/medium, impactSoft_heavy/medium, impactMetal_heavy/medium/light,
    impactPlate_medium, impactWood_medium, impactGlass_heavy/medium/light, impactTin_medium,
    impactPlank_medium, impactMining, impactBell_heavy, footstep_concrete/wood/carpet/snow/grass.
  - "RPG Audio" by Kenney (https://www.kenney.nl). CC0 1.0. Source: https://kenney.nl/assets/rpg-audio.
    Licence checked on the asset page and in the pack's License.txt; downloaded 2026-11-24. Used:
    knifeSlice, knifeSlice2, drawKnife1-3, cloth1-4, doorOpen_1-2, doorClose_1-3, metalLatch,
    metalClick, creak1-3.
- The Joker's voice lines (`public/assets/voice/*.mp3`) were generated with Seed Audio 1.0 on
  Higgsfield (https://higgsfield.ai) from lines written for this game; added 2026-11-06.

## Built in code

- Every vehicle (the Batmobile, Batcycle, Batwing, the street fleet, police cars, taxis, the El
  train cars, boats and aircraft) is modelled procedurally in code (`src/vehicles/models/`); no
  third-party vehicle models, textures or packs are used. The Batmobile is an original design for
  this game.
- The city, its districts, the props, the comic panels, the HUD and the city map are built in
  code; no third-party models or photo textures.
