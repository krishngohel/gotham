# Baseline before the overhaul (branch long-night-2, 2026-11-24)

Machine: Windows 11, RTX 4060 Laptop GPU (ANGLE D3D11), headless Edge/Chromium, dev server on :5200.
Pre-existing working-tree change at capture time: `package-lock.json` modified (2 lines, not touched by us).
No file under src/, tests/, scripts/, public/ or config was changed; nothing committed.

## Headline numbers

| Check | Result | File |
|---|---|---|
| `npm run test:e2e` | 16 passed, 1 failed (17 specs), 1m39s | 01-e2e.txt, 01b-e2e-gadgets-rerun.txt |
| Playthrough (title to credits) | ended at `credits`, 13 comic pages, no console errors, 62 story steps (step count from story-walk; playthrough does not print it), 2m25s | 02-playthrough.txt |
| Gadget unlock order | claw, gel, smoke, remote, launcher, freeze, flashbang (XP 2965, level 3) | 02-playthrough.txt |
| Story walk | 62 steps, 146 shots, ended at credits, 0 errors, 0 deaths recorded, 0 stray combo hits, 1 camera cut | 03-story-walk.txt, 03-walk.json |
| perf.mjs fps High / Low | gcpd roof 332 / 358; docks 514 / 516; neon street 513 / 469; ace chemicals 353 / 342; clock plaza 601 / 623 | 04-perf.txt |
| fps-sweep High (median ms / p95 / draw calls / tris) | gcpd roof 3.4/4.8/654/795k; docks 2.1/3.7/267/331k; neon 2.3/3.0/419/578k; ace yard 2.2/3.0/366/389k; clock plaza 2.1/3.3/340/397k; fight 4.1/5.7/668/1.09M; boss 3.3/4.4/443/679k; worst: g:swarm 4.7/7.4/769/1.24M | 05-fps-sweep-high.txt/.json |
| fps-sweep Low | gcpd roof 2.8/4.6/576/589k; docks 1.6/2.4/218/229k; neon 1.9/3.5/361/431k; ace yard 1.7/2.9/310/270k; clock plaza 1.6/2.5/285/284k; fight 3.9/8.3/551/800k | 05-fps-sweep-low.txt/.json |
| Hitches > 25 ms (after warmup) | High: 4 (fight 236 ms, chain 35 ms, g:swarm 75 and 218 ms). Low: 4 (chain 38/142/58 ms, g:swarm 162 ms) | same |
| anim-audit `all` | 8661 frames sampled, 830 events > 0.08 m (510 at clip transitions); 824 bone events, 6 WORLD events; 76 > 0.25 m, 20 > 0.5 m, 10 > 1 m; no page errors | 06-anim-audit.txt, 06-audit.json |
| browsers.mjs | chromium OK (60 fps), edge OK (180 fps), no errors; firefox FAILED (not installed) | 07-browsers.txt |
| Console errors | none in playthrough, story-walk, fps-sweep (all pages), anim-audit, browsers | |

Worst anim offenders (error in metres): `trav: sprint + stop` hero Sprint_Loop > Interact (foot_r 5.97, foot_l 3.18, hand_l 2.39, hand_r 2.28, pelvis 1.66; x6);
`extra: out of the Batmobile` Jump_Start (1.78, x8); `fight: yard` Punch_Jab (0.64, x38); `trav: crouch walk` ClimbUp_1m (0.63);
`move: spin backfist` goon Punch_Cross (0.44, x12). Many of the big WORLD-labelled or 5-290 m entries in the text report
(dodge roll 288.7 m, glide 45 m, long drop 30 m, running jump 7.5 m) are the audit script's own teleports between scenarios, not real pops;
treat only bone-relative entries as animation pops.

## Pre-existing failures and flakiness (before the overhaul)

1. e2e `tests/e2e/gadgets.spec.js:67` "a WayneTech purchase shows on the page and survives a reload" FAILS, deterministically (2 of 2 runs).
   `.hud-card.show` shows "WAYNETECH DELIVERY! Lucius sent new toys..." where the test expects "LEVEL 2" (a delivery card appears at level-up in place of the level card).
   Likely a stale test expectation, not a game crash. Unit tests were reported passing by the owner.
2. browsers.mjs: Firefox cannot launch (`firefox-1543` not installed under ms-playwright). Environmental.
3. story-walk logged one camera cut: step `finale`, 175 m hero jump from [-62,58,-154] to [0,42,9] (not made by the script).
4. fps-sweep hitches (see above), especially the gadget swarm (218 ms High, 162 ms Low) and fight start (236 ms High).
5. Playthrough and story-walk use teleports and winFight(), so they prove story progression, not real traversal or combat.

## Exact commands (cwd = repo root, Git Bash; dev server started with `npm run dev`, port 5200)

```
npx playwright test --reporter=list                       # = npm run test:e2e with list reporter; reuses the dev server
npx playwright test gadgets.spec.js --reporter=list       # rerun of the failing spec
OUT=<scratch>/pt BASE=http://localhost:5200/ node scripts/playthrough.mjs
node scripts/story-walk.mjs http://localhost:5200/ <scratch>/sw        # walk.json copied to 03-walk.json
node scripts/perf.mjs                                      # default BASE and CHANNEL=msedge
OUT=docs/baseline/05-fps-sweep-high.json node scripts/fps-sweep.mjs http://localhost:5200/ high
OUT=docs/baseline/05-fps-sweep-low.json  node scripts/fps-sweep.mjs http://localhost:5200/ low
node scripts/anim-audit.mjs http://localhost:5200/ <scratch>/aa all    # audit.json copied to 06-audit.json
npx vite build --outDir <scratch>/dist --emptyOutDir        # build kept out of repo dist/
npx vite preview --port 5201 --strictPort --outDir <scratch>/dist
OUT=<scratch>/br node scripts/browsers.mjs                  # BASE defaults to http://localhost:5201/
```

Screenshots were written to a scratch dir and not kept. Both servers were stopped; ports 5200 and 5201 verified free (no listeners).
Numbers are from a single run each on a laptop and are noisy at the few-percent level; compare A/B on the same machine.
