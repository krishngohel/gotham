# Co-op seams (workstream D1 → D2)

Local co-op (split screen) is built so online play (workstream D2, `src/net/**`) can reuse it
unchanged. This page lists the seam: what a remote player needs, the player-scoped events, and the
world-changing functions that must become host-only. "Owner" says which side runs it online
(design 4.4: the host owns the world, every peer owns its own hero).

## 1. A player, local or remote

`createPlayer` (`src/players/players.js`) is the same record for both. A remote player differs only in:

| field | local (D1) | remote (D2) |
|---|---|---|
| `input` | a merged device input (`src/core/input.js`), or a scripted one for the bot | `createRemoteInput()` fed from the wire (`apply(msg)`) |
| `ctx.input` | `createInputFilter(input)` (`src/coop/glue.js`): the glue masks a press it used | the same filter over the remote input |
| `rig` / `view` | its own camera, follow rig, HUD panel (`src/coop/coopRuntime.js makeRig`) | **none**: a remote hero is drawn in the host's views; it gets a partner panel via `hud.addSlot(1)` |
| `local` | `true` | `false` |
| `away` | always `false` | set by the session after 1 s of silence (ignored by aggro) |

Everything below the input is shared code: `createHero` (any kit), `combat.addPlayer(p)` (a fighter),
`stealth.addHero(hero, fighter.api)`, its own gadget system (`createGadgetSystem({ secondary: true, player })`),
the glue (signature moves, team moves, dual takedowns, comms) through the player's filter.
`coopRuntime.addLocalPlayer({ kit, inputSrc })` is the one entry point; D2 wants a sibling
`addRemotePlayer({ kit, input })` that skips `makeRig` and `split.add` and nothing else.

Kit choice travels as one string: a kit id (`src/heroes/roster.js`, `isKitId`). `prepareKit(kit, assets)`
(`src/heroes/kitModels.js`) must run on every machine before the hero is built (model builder,
costume texture, animation packs).

## 2. Player-scoped events

Events carry the player as a non-enumerable `data.player` (`withPlayer`, `src/core/events.js`), so
payloads serialise unchanged. D1 added or scoped:

| event | payload | emitted by | online |
|---|---|---|---|
| `playerJoined` / `playerLeft` | `{ slot, kit }` / `{ slot }` | coopRuntime | host broadcasts |
| `playerDown` / `playerRevived` | `{}` / `{ by }` | combat `killHero` / coopRuntime revive | host decides (revive rule runs on host) |
| `heroHurt` | `{ kind, damage }` (+player) | combat, boss (buzzer, gas) | defender reports (netcode decision 13) |
| `hint`, `gadgetEquip`, `gadgetUse`, `wheelOpen/Close/Pick/Seen` | as before (+player) | gadget system | local only (UI) |
| `footstep`, `land`, `airFlip`, `flyStart`, `flyEnd` | as before (+player) | hero | peer owns; host needs `footstep`/`land` for stealth noise |
| `trophy`, `pickup` | `{ index, count }` / `{ item }` (+player who touched it) | flow | host only |
| `signatureStart`, `signatureMove` | `{ id }` / `{ id, hits }` | glue | peer plays; hits are hit claims |
| `teamMove`, `dualTakedown` | `{ id, hits, with }` / `{ target, with }` | glue | needs a host lock on the targets |
| `ping`, `quickChat` | `{ id }` / `{ id, text }` | glue | reliable event, both directions |
| `passengerIn` / `passengerOut` | `{ kind }` | seats | host broadcasts |
| `regroup` | `{}` (+the player moved) | coopRuntime tether | host decides |

## 3. World-changing functions (host-only online)

| function | file | what it changes |
|---|---|---|
| `spawn(type, pos)` / `despawn(e)` | `src/game/game.js` | enemies exist |
| `encounters.begin/trigger/update` | `src/game/encounters.js` | fights start, waves (scaled by `getPlayerCount`) |
| `flow.update` (reach/collect/trophy), `advance`, `enterStep`, `jumpTo`, `respawn`, `bringAlong` | `src/game/flow.js` | story progress, checkpoints, placing heroes |
| `collectTrophy`, `pickups.take` | `src/game/flow.js` | collectibles (credit: `data.player`) |
| `fighter.landHit / areaBlast / takedown / killHero` | `src/combat/combatSystem.js` | damage, KOs, downs |
| `boss.update` buzzers and gas (`killFor`) | `src/game/boss.js` | boss damage on each hero |
| `revive.update` (`createReviveRules({ hold: true })`) | `src/players/coopRules.js` | downed → revived / expired → checkpoint |
| `coopRuntime.regroup` (tether) | `src/coop/coopRuntime.js` | moves a hero |
| `seats.vehicleKey / batwingKey / update` | `src/coop/passenger.js` | who drives, who rides |
| `vehicles.setDriver/useKey/fireCannon`, `batwing.setPilot` | `src/vehicles/*.js` | the vehicle and the battle |
| `stealth.update` (alarm, squad) and `stealth.startFor(hero, action)` | `src/stealth/stealthSystem.js` | goon awareness; a takedown needs a host lock |
| `glue.startTeamMove / startDual` | `src/coop/glue.js` | multi-target KOs (host lock on targets) |
| `gadgets.unlockCheck` (player 0's system only) | `src/gadgets/gadgetSystem.js` | unlock announcements |

## 4. Local-only (never replicated)

Split screen and its views (`src/coop/splitScreen.js`, `viewLayout.js`), the HUD group
(`hudGroup.js`), device assignment and join/drop (`joinFlow.js`, `deviceWatch.js`), the hero select
(`src/ui/heroSelect.js`, `heroPreview.js`), per-view detective vision and impact frames (ink view
overrides), hit-stop and player-local time holds (`src/core/time.js`, per player), the comms wheel UI.

## 5. Rules D2 inherits

- Single-player is co-op with one player: every co-op path is a loop over `players.list` or a
  no-op when `players.count === 1`.
- The save rule: player 0's save gets the story; a partner's XP is tallied on `p.xp`
  (`xpRecipients`); picks persist per slot in `progress.coop.picks` (registered field `coop`).
- A kit never special-cases in gameplay code: traversal is the kit's profile
  (`TRAVERSAL_PROFILES`, `src/heroes/traversal.js`), signature moves are data (`kit.signature`).

## 6. Online parity (D3, `[net2]`)

Everything above is wired online (docs/design/online-coop.md "What D3 added"). For new content:
keep world changes behind the host-only functions in section 3, and connect the guest through
`src/net/share.js` (`net.shareEvent`, `net.registerClaim`, `net.registerState`, `net.hostOnly`)
instead of touching `src/net/**`. A step type or system that must not run on a guest checks
`isReplica()` (`src/net/mode.js`) as `src/story/storyRuntime.js` does. A networked partner's input
on the host now has press edges (its hero records carry the presses), so seat keys, the gunner's
trigger, glue moves and a Bruce scene's assist work for it like for a local partner; a hero control
the host gives that partner must be ticked by the net layer (`hostAdapter HOST_RUN`, glue moves).
