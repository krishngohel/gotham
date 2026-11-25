# Brief: more missions per night (content round, 2026-11-24)

Owner request: "add 3-4 more missions per night to hit the length target". Target: each of Nights
2-9 plays 60-90 minutes for an average player (currently ~15-21 by `scripts/night-length.mjs`;
see `docs/design/balance.md` section 5, which also says what a night needs). Night One is the
original game and is not touched.

Each agent owns two nights and adds **4 new main-path missions to each** (3 if the fourth would be
padding), each 8-10 minutes for an average player, plus whatever connective scenes make them flow.

## Read first
`docs/design/long-night-2.md` (hard rules 1-10 bind you), `docs/design/story-format.md`,
`docs/design/balance.md` (5, 6, 8), `docs/design/briefs/wave3-common.md`, your two night files in
`src/story/nights/`, and one other night for house style. Skim `docs/design/openworld.md`,
`wanted.md`, `vehicles.md` for systems you can use.

## What a good mission is here
- Real content with a reason in that night's plot: it advances the villain's plan, a relationship,
  or the double-life strain (a Bruce obligation colliding with the night). Not "beat N goons" with
  new dialogue. At most one plain brawl per night among your additions.
- Variety across the four: pick from predator/stealth room, detective case with a case board,
  vehicle pursuit or Batmobile battle-mode set piece, rescue or escort under a timer, traversal
  challenge (grapple, wingsuit, El train roof), infiltration as Bruce, a wanted-level escape,
  hacking/gadget puzzle, a mid-night boss beat or rematch using the `src/bosses/` framework.
- Use the expanded city: send the player to districts that night under-uses (district table in
  the design doc). Travel between missions should pass something worth seeing.
- Tone: original writing in the house voice; dry jokes that land; no quotes or scenes lifted from
  any film, show, comic or game. Original designs only.
- Flow (owner playtest feedback): no abrupt popups on reaching a marker. Lead in with radio or a
  short beat, go through the HUD director (`src/ui/hudDirector.js`), and do not add hard stops that
  freeze the player more than the existing nights do.
- Teaching: abilities and gadgets arrive in the order the story already gives them. Do not unlock
  anything earlier; do not change the reward schedule (`tests/unit/gadgetRewards.test.js`). A new
  mission may *require* something already taught, and should give a recently taught tool a real use.
- Works in co-op and online: every step must complete in split screen and for a networked guest
  (host-authoritative; story steps replicate by night + step id). No step may depend on player 0 only.
- Saves: existing step ids keep their meaning and order; add new ids, never rename or reuse. An old
  save parked on an existing step must still resume.
- Difficulty: fights use the tier rules already in place; do not retune global balance values or
  boss windows. Per-encounter composition is yours.
- Performance: stay inside `docs/perf3/perf-budget.json`. Potato at the Narrows has one skinned
  mesh of headroom: keep crowds there small. Mission props go through chunk groups, merged or instanced.
- XP: missions pay through the existing `missionComplete` path; do not add new XP sources.

## Scope fences
Own: your two night files, new modules under `src/story/missions/n<N>/` if a mission needs code,
new tests, and the lines for your nights in `scripts/playthrough.mjs` / `scripts/night-length.mjs`
/ `scripts/night-sim.mjs`. Do not edit other nights, `n1.js`, `src/wanted/**`, balance tables,
render code, or the README. If you need a change in a shared system, make it minimal, additive and
tested, and list it in your report. Three other agents are doing the same for other nights: expect
them to touch the same scripts; keep your edits to those files small and night-keyed so they merge.

## Working rules
- Worktree: `git -C ~/Documents/Projects/gotham worktree add ../gotham-ln2-<name> -b ln2/<name> long-night-2`
  (name and vite port given in your prompt). node_modules: junction to the main repo's, or `npm ci`.
- Commit small, prefix `[<name>]`, each message ending
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Never push; never touch `main` or
  `long-night-2`.
- Load: up to 3 browsers at once, BelowNormal priority (`scripts/lowprio.sh`), no helper sub-agents.
- Do not write local machine paths (user folder names) into any committed file.

## Done means
1. `NIGHT=n<N> node scripts/playthrough.mjs` completes each of your nights with no console errors,
   solo, with `P2=bot`, and with `NET=broadcast` (guest ends on the same night and step). Extend the
   playthrough driver so it really plays your missions; do not special-case it to skip them.
2. A full `CAMPAIGN=1` run still goes n1 -> n9 and prints `ABILITIES: story order OK`.
3. `npm test` passes (2,666 now) with new tests for your missions' step graphs; `npm run build` passes.
4. `node scripts/night-length.mjs` updated for your nights: report minutes before and after, and say
   which parts are measured and which modelled. If you fall short of 60, say so; do not pad.
5. You played each new mission in a browser and looked at screenshots (a few per mission under
   `docs/design/shots/missions/n<N>/`, small JPEGs).
6. Report: per mission one line (what it is, where, minutes), the checks' real output, shared-file
   edits, anything broken you found outside scope, and what a human should judge by hand.
