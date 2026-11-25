# Pull-request hygiene (integration verify, item 3)

Branch `ln2/verify` at `337da32` (long-night-2 + the third wave), 254 commits since baseline
`5fe2c7f`. Checked 2026-11-24. Nothing was deleted: every finding below is listed for its owner.

## 1. Leftovers

### Untracked files in this worktree

| Path | Verdict |
|---|---|
| `docs/verification/` | the verifier's own run logs (this file lives here); to be committed by the verifier |
| `scripts/verify/` | verifier scripts; **committed** (`d3c6998`, `2bf1c99`) |
| `src/wanted/netCodec.js`, `tests/unit/a11yCssCoverage.test.js`, `tests/unit/wantedNet.test.js` | work in progress by concurrent fix agents, not leftovers |

### Committed generated output

- **At HEAD: none.** No `story-walk/`, `playthrough/`, `test-results/` or scratch folders are tracked.
- **In history: `story-walk/`, 146 PNGs, 122.3 MB**, added by `8a7efb8` ("[net] Final touches", branch
  ln2/net) and removed by `1c2ce17` ("Drop story-walk output that was committed by mistake"). Both
  are ancestors of HEAD, so the 122 MB is in long-night-2's history for good unless that history is
  rewritten before it reaches `main` (see section 5). Owner decision.
- `docs/baseline/02-playthrough.txt`, `03-story-walk.txt`, `docs/perf2/*.log`: logs kept on purpose as
  evidence (listed as archive candidates in `docs/README.md`).

### Script defaults that write into the repo

- `scripts/playthrough.mjs:7` default `OUT` is `playthrough` and `scripts/story-walk.mjs:12` default
  out dir is `story-walk`, both relative to the cwd (the repo root in practice); neither folder is
  in `.gitignore`. This is how `8a7efb8` happened. **Done (`80ae70a`): `playthrough/`, `story-walk/`
  and `contact-shots/` are in `.gitignore`.**
- `scripts/story-walk.mjs:11` default base URL is `http://localhost:5202/` (an old agent port);
  harmless, always passed explicitly.
- `tools/contact-shots.mjs:10` default output is a personal absolute path
  (`C:/Users/<user>/AppData/Local/Temp/mocap/contact`). **Done (`80ae70a`): relative `contact-shots`, ignored.**

### Probe and one-off scripts (kept; candidates for a `scripts/dev/` folder or removal by their owners)

Probe scripts: `scripts/dev-probe.mjs`, `drive-probe.mjs`, `move-probe.mjs`, `netProbe.mjs`,
`sim-probe.mjs`, `site-probe.mjs`, `wanted-probe.mjs`, `tools/pose-probe.mjs`.

Not referenced by any other file, doc or npm script (31): `scripts/anim-film.mjs`, `audio-measure.mjs`,
`bench-compare.mjs`, `dev-action.mjs`, `dev-play.mjs`, `dev-probe.mjs`, `dev-shot.mjs`,
`drop-clips.mjs`, `dynres-check.mjs`, `env-shots.mjs`, `foot-audit.mjs`, `gpu-check.mjs`,
`handoff-strip.mjs`, `img-diff.mjs`, `ladder-film.mjs`, `load-time.mjs`, `map-shots.mjs`,
`net-pair.mjs`, `netProbe.mjs`, `onboard-facts.mjs`, `onboard-sim.mjs`, `perf-ablate.mjs`,
`perf-profile.mjs`, `sim-probe.mjs`, `stealth-check.mjs`, `stealth-timing.mjs`, `wanted-shots.mjs`,
`webkit-check.mjs`, `wing-check.mjs`, `tools/glb-inspect.mjs`, `tools/pose-probe.mjs`. Many date
from the initial import (2026-11-06) and may target retired code paths; untested here (no browser).
`scripts/runs/*.json` are input recipes for `dev-play.mjs`, not output.

### Stale worktree references in docs

No `*-base` worktree names or other agents' worktree paths in docs. The only absolute paths are the
worktree recipe in `docs/design/briefs/*.md` (intentional) and the one in `tools/contact-shots.mjs`
above.

### Console output in production

- `src/render/tierDetect.js:144` `console.info('[quality] auto: ...')` runs in production, once, on a
  first boot with Quality = Auto (the benchmark). Low noise and useful for support; optional to gate
  behind `import.meta.env.DEV`.
- `src/dev/perfBench.js:106`, `:196` (`console.log`) and `src/dev/perfProbe.js:181` (`console.info`):
  dev only, dynamically imported behind `?bench=` / `?prof=1` / `?off=` (`src/game/game.js:2003-2005`).
- 22 `console.warn` calls in `src/` were not audited one by one (warnings for real fault paths).

### TODO / FIXME / skipped tests

None: no `TODO`, `FIXME`, `XXX` or `HACK` in `src/`, `tests/`, `scripts/`, `tools/`; no
`.only(`, `.skip(`, `test.fixme` or `debugger;`.

### Bug found while documenting (fixed by the verifier in `80ae70a`: `&q=` in playthrough, night-sim, sim-probe, site-probe; every long run since is on real Potato)

- `scripts/playthrough.mjs:36` appends `&quality=${QUALITY}` but the game reads `?q=`
  (`src/game/game.js:201`, `chooseTier({ param: params.get('q') })`). So `QUALITY=potato` is ignored
  and every playthrough mode in `scripts/verify/run-checks.sh` (pt-camp, pt-camp-p2, pt-net,
  pt-camp-net) runs on the GPU-seed tier instead of Potato. The stated goal ("no auto-tier reload
  under load") is met anyway because automated browsers never benchmark or reload
  (`src/render/tierDetect.js:78-80`), but the low-tier coverage it implies is not happening.
  One-word fix: `&q=`.

### Screenshot budget

The common brief caps each workstream's `docs/design/shots/<tag>/` at 4 MB. Over: `city/` 9.1 MB
(105 files), `audio/` 4.1 MB (21 files). The whole `docs/design/shots/` is 42 MB of the 72 MB tracked
tree (389 files).

## 2. CREDITS.md

Rewritten against what ships: three.js 0.186.1 (MIT), Trystero 0.26.0 and its packages
`@trystero-p2p/core`/`nostr` 0.26.0 (MIT) and `@noble/secp256k1` 3.2.0 (MIT) with source URLs and
the date each entered `package.json`; the run-time services (public Nostr relays, Cloudflare and
Google STUN); the three Google Fonts (OFL 1.1, loaded at run time, not shipped); Quaternius packs,
Mixamo-derived packs (each GLB named, with dates), the Meshy/Higgsfield kicks, procedural textures,
Higgsfield card art and Joker voice; Kenney Impact Sounds and RPG Audio (CC0, downloaded
2026-11-24); procedural vehicles and city. Dates without a recorded download date use the git
"added" date.

Open (owner to decide or confirm):

- **Quaternius download date unknown.** The packs came in with the initial import on 2026-11-06,
  after Quaternius moved its site licence to the Quaternius Asset License v1.0 (2026-08-28). The
  pack pages still said CC0 (research doc, section 4.1). If the zips were downloaded after
  2026-08-28 and their bundled licence file says QAL, the raw GLBs in a public repo are the same grey
  area as Mixamo (no redistribution as a standalone pack). The zip's License.txt should be checked.
- **No LICENSE file** in the repo. The research doc (section 7.1) advises never putting a licence
  on `public/assets/**` or the `mocapData*.js` files.
- Unverified, carried from the research doc: whether the Seed Audio Joker lines imitate a real
  actor's voice, and the terms of the Meshy/Higgsfield motion source.

## 3. CI decision (`.github/workflows/pages.yml`)

- Node 24 (vite 8 needs `^20.19 || >=22.12`; vitest 5 needs `^22.12 || ^24 || >=26`; the previous
  `22` also satisfied both, 24 is the current LTS).
- Steps: `npm ci`, `npm test` (unit), `npm run build`, then a size step that writes the 15 largest
  `dist/` files to the job summary and **fails above 40 MB** (contract rule 7). Local `dist/` from
  the "before" build is 23.4 MB (24,535,280 bytes).
- Also runs on pull requests (test, build, size guard; no upload, no deploy). Deploy only on `main`.
- **No e2e, playthrough, story-walk or perf-gate in CI.** They need a real GPU (WebGL2 with the ink
  pipeline; software rendering crawls and times out), run for tens of minutes per mode, and are
  load-sensitive even on the dev machine. They stay local, in `scripts/verify/run-checks.sh` and the
  README "Checks" section. perf-gate is GPU-independent in what it measures but still needs a WebGL
  context and Edge; it could move to a self-hosted GPU runner later.

## 4. Line endings

- `git ls-files --eol`: 1,027 text files `i/lf w/lf`, 408 binaries `-text`; **no file has a CRLF or
  mixed index or working-tree eol**, and no untracked file contains CR. Nothing to renormalise.
- The machine has `core.autocrlf=true` globally. `.gitattributes` (`* text=auto eol=lf`) overrides
  it, so the churn agents reported is the transient case: a tool writes CRLF, `git status` shows the
  file modified until it is added (git normalises it to LF on add). `git add --renormalize <file>`
  clears it.
- `.gitattributes` extended: explicit `binary` for jpg/jpeg/gif/ico/bin/fbx/mp3/webm/ogg/opus/wav/
  woff/woff2/zip (previously only png/glb/webp; jpg, mp3, webm were already detected as binary by
  content, now declared). No file's attributes changed state.

## 5. Size

- **No file over GitHub's 100 MB limit**, at HEAD or anywhere in history (all refs): the largest
  blob ever is `public/assets/anims_mocap.glb`, 3.09 MB. Nothing over 50 MB (GitHub's warning).
- Tracked tree: **11.9 MB / 424 files at `5fe2c7f` -> 72.0 MB / 1,435 files at HEAD.** Biggest
  areas at HEAD: `docs/design` 42.2 MB (shots), `public/assets` 19.6 MB, `docs/perf2` 1.7 MB,
  `tests` 1.6 MB, `src/world` 1.1 MB.
- Largest files added since baseline: `anims_civ.glb` 2.7 MB, `anims_enemies.glb` 2.0 MB,
  `anims_combat2.glb` 2.0 MB, `anims_story.glb` 1.3 MB, `anims_heroes.glb` 0.8 MB, then
  screenshots of 0.4-0.6 MB (`docs/design/shots/net/brawl-*.png`, `story2/*Boss.png`) and
  `docs/perf2/hitch-*-high.json` (0.45 MB each).
- History: 83 MB of blob data up to the baseline; **+231 MB (2,276 blobs) in `5fe2c7f..HEAD`**, of
  which 122 MB is the accidentally committed `story-walk/` PNGs, 70 MB every version of
  `docs/design/shots`, 23 MB every version of `src/`, 11 MB `public/assets`. PNG and GLB do not
  compress, so a push of long-night-2 to GitHub is roughly 200+ MB.
- The shared `.git` holds 5,393 loose objects (302 MiB), no packs; `git count-objects` also reports
  `.git/worktrees/gotham-ln2-verify/refs` as garbage (harmless). A `git gc` when no agent is running
  would pack it; not done here (shared by every worktree).

Owner decision: dropping the 122 MB `story-walk/` blobs needs a history rewrite of long-night-2
(`git filter-repo --path story-walk --invert-paths`, or squash-merging long-night-2 into `main`).
Squash-merging also drops old screenshot versions; it loses per-commit history.

## 6. Files changed by this pass

`README.md` (rewritten), `CREDITS.md` (rewritten), `package.json` scripts (`perf:gate`, `verify`
added; dependencies untouched), `.github/workflows/pages.yml`, `.gitattributes`, `docs/README.md`
(new index), this file.

## 7. Recommendation for the merge to `main` (verifier)

Squash-merge the pull request. long-night-2's history carries 122 MB of accidentally committed
story-walk PNGs (added `8a7efb8`, removed `1c2ce17`) plus ~70 MB of superseded screenshot versions;
a squash keeps them out of `main` without rewriting long-night-2 itself. Do not push long-night-2's
own history to the public repository.
