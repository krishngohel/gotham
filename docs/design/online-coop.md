# Online co-op (workstreams D2, D3)

D2 built the online layer for Night One; D3 (`[net2]`, wave 3) brought every system merged after it
to parity: the campaign's nights, every boss, vehicles (the guest drives and guns), paired moves,
the world clock and weather, predator-room HUD, crimes and challenges through a generic content
seam. Sections marked **(D3)** are new.

Two people on two PCs play Night One together through a room code. The site stays static (GitHub
Pages): no server of ours. Authoritative research: `docs/design/research/coop-netcode.md`; local
co-op seams: `docs/design/coop-seams.md`.

## How to play

- **Host:** title → *Host online game* (or, mid-run, pause → *Invite a friend online*). Tell your
  friend the six-character room code. Both pick a hero and press Ready.
- **Guest:** title → *Join with code*, type the code, pick a hero, Ready.
- Tabs on both panels: **Room code** (matchmaking over public Nostr relays through Trystero),
  **Paste codes** (manual: the host sends a long offer code, the guest pastes it and sends back an
  answer code at once; the answer is good for ~15 s, the guest's panel counts down, and the host's
  panel makes a fresh offer when one lapses), **Same PC (two tabs)** (BroadcastChannel).
- In game: the badge top-right shows the link (`ONLINE · 42 ms`; click it to hide the ms;
  `RECONNECTING…`, `P2 AWAY`). Pause → *End / Leave the online game*.
- URL: `?net=broadcast|trystero|manual` preselects the tab (tests use `?net=broadcast`).

## Architecture

```
src/net/
  mode.js                 'off' | 'host' | 'guest'; isReplica() gates (tiny; in the main bundle)
  netSave.js              the `online` save field and the guest save rule (main bundle)
  protocol.js             PROTO, BUILD, channels, binary ids, limits, rates, the control-message
                          catalogue with validators, role whitelists, room codes, text cleaning
  transport/link.js       the one link interface
  transport/loopback.js   in-process pair + link conditioner (seeded latency/jitter/loss/dup/reorder,
                          loss only on `state`), manual clock, loopback matchmaker
  transport/broadcast.js  BroadcastChannel (two tabs)
  transport/webrtc.js     RTCPeerConnection, negotiated channels ctl=100 / state=101, back-pressure,
                          offer/answer helpers, STUN pre-check, selected-pair stats
  signal/signallers.js    signaller interface: broadcast, Trystero (lazy, pinned), manual codes
  codec/binary.js         bounds-checked DataView writer/reader, angle/position quantisation, clip hashes
  codec/snapshot.js       snapshot / hero-state / ping binary formats
  clock.js                NTP-style clock sync, adaptive interpolation delay, sample buffers
  session.js              handshake, welcome (chunked), heartbeat/away, reconnect, host away, bye/kick
  replication/host.js     snapshots at 20 Hz, events, claims, defence timeouts, locks (game-free)
  replication/guest.js    interpolation, hero state at 30 Hz, claims, defender-side resolution (game-free)
  game/netGame.js         lobby + session lifecycle + wiring into a run (lazy-loaded)
  game/hostAdapter.js     reads the host's world, applies the guest's claims via its own fighter
  game/guestAdapter.js    puppets, local defence, host events, riding, pings/chat
  game/puppets.js         animation-state replication (clip, time, speed), hero/enemy puppets
  ui/netUi.js             host/join panels, badge, host-away overlay, failure messages
  share.js                (D3) the content seams: shareEvent / registerClaim / registerState (main bundle)
  game/contentNet.js      (D3) the seams on the wire ('sev', 'claim', 'st'), payload (de)serialising
  game/vehicleNet.js      (D3) Batmobile / Batwing props, the guest at the wheel, seats, eject
  game/glueNet.js         (D3) dual takedowns and team moves: the host times the guest's part
  game/worldNet.js        (D3) clock, weather pins, lightning
  game/bossNet.js         (D3) every framework boss: body, bar, speech
```

Single-player never loads `src/net/game/**` or Trystero: game.js imports them only when someone
goes online (`openNet`). `mode.js` and `netSave.js` are a few hundred bytes.

### Roles

- **Host** owns the world: story, encounters, enemy AI, the boss, crimes, vehicles, revive and the
  tether, as in single-player. The guest's hero is a *remote player*
  (`coopRuntime.addRemotePlayer`): the same player record, fighter, stealth watcher and glue
  membership as a split-screen partner, without a view, posed from the wire (never `hero.update`).
- **Guest** runs the same game in replica mode (`isReplica()`): flow never advances (it follows the
  host's `step` events with `flow.follow`), encounters/side content/boss/Nightwing/vehicles never
  run, every enemy is a puppet. Its own hero is player 0: movement, animation, traversal, its own
  strikes, camera, HUD, gadgets, detective vision and grapple are all local.

Net slots: host hero = 0, guest hero = 1 (on the guest's machine its hero is still player 0 and the
host's is player 1; `p.netSlot` says which is which).

### Channels

| channel | options | carries |
|---|---|---|
| `ctl` (id 100) | negotiated, reliable, ordered | JSON control messages below |
| `state` (id 101) | negotiated, `ordered:false`, `maxRetransmits:0` | snapshots H→G, hero state G→H, clock ping/pong |

Back-pressure: a `state` send is skipped while > ~2 snapshots are queued; the welcome is chunked
into ≤16 KiB `chunk` messages.

### Binary formats (`codec/snapshot.js`)

- **Snapshot** (H→G, 20 Hz, each part ≤ 1,100 bytes, self-contained): header 29 B
  (`u8 type, u8 proto, u16 seq, f64 hostTime, u8 part, u8 parts, f32×3 origin, u8 heroes, u8
  enemies, u8 props`); hero 49 B (slot, f32 position, i16 velocity, u16 yaw, u32 clip hash, u16 clip
  ms, u8 speed, u16 health, u16 max, flags, movement state, seat, u32 held-action mask, **(D3)** u32
  tap mask = presses since the last record, i8×2 move stick, u16 camera yaw, i16 camera pitch);
  enemy 23 B (u16 id, i16 position at 2 cm from the packet origin, yaw, clip hash, clip ms, speed,
  AI state, health×10, flags, glyph (low 3 bits) + **(D3)** role bits (top 5: weapon kind, charged
  baton, fear phantom, stripped shield), target slot); prop 22 B (vehicles). A 40-goon brawl fits
  one packet (998 B); bigger or spread-out worlds split into parts.
- **Wire ids** (D3): goons `e<n>` → n; the Joker 65000; any other named enemy (every framework
  boss, the AI Nightwing as an ally) → 65001 + FNV-1a(id) mod 500, so a boss a later night adds needs
  no table (`snapshot.js isBossId`).
- **Hero state** (G→H, 30 Hz): 13-byte header + one hero record.
- **Ping/pong** for clock sync on `state`.

Decoders never throw and return `null` for anything malformed (10,000-buffer fuzz tests).

### Control messages (`protocol.js`)

| type | from | meaning |
|---|---|---|
| `hello` | guest | proto, build, content hash, kit, name, reconnect token |
| `welcome` + `chunk`s | host | token, then the state: lobby (`phase:'lobby'`) or the whole world (`phase:'run'`: step, every enemy, items taken, spawn point, world clock) |
| `refuse` | host | `version` / `room-full` |
| `lobby` | both | `{kit, ready}` in the hero select |
| `start` | host | both kits and the step: the guest builds its run, then sends `resync` |
| `resync` | guest | send me the world again (after building the run, after an unknown enemy) |
| `spawn` / `despawn` | host | an enemy exists / is gone (id, type, pose, health) |
| `step` | host | the story moved to step `index` |
| `pickup` | host | a story item was taken |
| `hit` | guest | a hit claim: enemy, move, claim time, options; deduped by `seq`, rate-limited |
| `hitAck` | host | the host's verdict (`out`, new hp) |
| `atk` | host | an enemy's wind-up aimed at the guest: attack id, host start and contact times |
| `defence` | guest | `countered` / `dodged` / `hit` / `blocked` / `miss` for an `atk` |
| `hurt` | host | a blow the host resolved (shots, charges, boss tiles/gas, a defence timeout) |
| `lock` / `grant` / `deny` / `unlock` | guest/host | exclusive actions (silent takedowns, perch drops, grabs) |
| `fx` | guest | a status effect the guest put on an enemy (freeze, dazzle, yank, tie, chain hold/release, smoke) |
| `req` | guest | `ride` (a seat in the host's car), `regroup` |
| `place` | host | stand the guest's hero here (story placement, regroup, respawn: `heal`) |
| `down` / `revived` | host | revive results (the revive rule runs on the host) |
| `boss` | host | boss bar on/off, phase, fill |
| `ping` / `chat` | both | comms-wheel marks and quick-chat lines |
| `hostAway` | host | host tab hidden ≥ 1 s or its pause menu open |
| `sceneDone` | guest | finished reading the comic of step `index` (the host waits, ≤ 90 s) |
| `ev` | both | cosmetic events (impact, word, ko, barks, shots…), `heal`, `ride`, `clock`, `timing`, `atkCancel`; **(D3)** `ride {on, kind, drive, ej}`, `glueMove {name, clip, pos, yaw, at}`, `env {v, h, p, seed, ws, at}`, `strike {d, b}`, `bossSay {text}`, `hint {text}` |
| `step` (D3) | host | now `{index, id, night}`: the campaign position is (night, step id) |
| `boss` (D3) | host | also `{on, id, name, phases, phase, inPhase, colors}` for framework bosses (`gen:true` off) |
| `sev` (D3) | host | a shared content event `{n, d}` (net.shareEvent) |
| `st` (D3) | host | a content state blob `{k, v}` (net.registerState), also in the welcome (`states`) |
| `claim` (D3) | guest | a content claim `{n, d}` (net.registerClaim), 10/s |
| `fx` (D3) | guest | + `pull` (arg 1 = disarm), `strip`, `chip` (grapple pulls), `jam` (arg = seconds) |
| `bye` / `kick` | both | leaving / removed |

A guest may only send `hello, ready, lobby, bye, hit, defence, lock, unlock, fx, req, chat, ping,
sceneDone, ev, resync, claim`; anything else is dropped and counted before it is parsed further.
PROTO is 2 since D3 (a D2 build refuses a D3 one with the version message). The content hash
covers every registered night's step ids, so builds with different nights refuse each other too.

## What is replicated how

| thing | how |
|---|---|
| enemies | spawn/despawn events + snapshot records; puppets play the host's clip at the host's clip time (never bones); position smoothed |
| host hero | snapshot record → puppet |
| guest hero | hero state → puppet on the host (health, death, blocking, crouch, held actions) |
| guest blows | played locally at once (prediction); `hit` claim; the host lands it through the guest's own fighter (`landHit`), so combos, KO credit, XP and audio match split screen |
| enemy blows on the guest | defender-side: `atk` starts the wind-up on the guest's own render clock; counters, dodges and blocks are judged there with the full designed window; the host accepts the report or times out (contact + RTT + interp + 300 ms) |
| ranged shots, charges, boss tiles/gas | host-resolved, forwarded as `hurt`; the guest's own fighter applies them (its block/dodge still count) |
| locks | the host's own exclusive actions take the lock locally; a guest's silent takedown freezes the goon on the host (`chainHold`) |
| story | `step` events (D3: with the night and step id); cutscenes/comics/radio/cinematics play on each machine; the host waits for the guest's comic (capped) |
| pickups | `pickup` events; reach/collect checks run only on the host (they see the guest's puppet) |
| trophies (Riddler) | personal: each player collects its own, kept in its own save |
| boss | the Joker as a puppet (wire id 65000), the boss bar as events; D3: every framework boss (below) |
| vehicles | D3: host-simulated, the guest drives, rides and guns (below) |
| traffic, El trains, bridges, sky | El and bascule bridges are pure functions of the world clock: the guest's clock follows the host's (`ev clock`); ambient traffic is local and cosmetic |
| revive, tether, regroup | host decides; `down`/`revived`/`place` |
| pings, quick chat | comms wheel marks and balloons on both machines |
| time scaling | hit-stop per actor (unchanged); world slow-motion only via a host `slowMo` event |

### What D3 added (wave 3)

| thing | how |
|---|---|
| campaign position | every `step` event carries `(night, step id)`; `flow.follow(index, {night, id, force})` loads the host's night on the guest (`story.followNight`), resolves the step by id, and re-enters a re-entered step (a mission retry). The welcome and `start` carry the night too, so a guest joining mid-Night Three starts there. A guest's story never fails, rewards a day, loads a night, spawns phantoms or calls a puzzle's penalty squad (`isReplica` guards in `src/story/storyRuntime.js`); it reads the night's last comic and the host waits for it (`waitScene`). The credits page closes on the guest when the host moves on. |
| missions | branches, optional objectives and fail/retry run on the host; the guest's step types draw their markers and meters locally and follow the host's step events. |
| Bruce days | host-driven (the double life is the host's save; `bruce` is a guest story field, never written from the host's world). The guest is placed with the host (the ward / the partner at the table; the pocket is built on the guest when it is placed there), gets a hint, and can press ping to assist in a scene (the host sees the press). |
| bosses | every framework boss is an enemy on the wire (hashed wire id): the guest's director builds the def's body without its phase logic (`bosses.puppet(id)`), the net layer makes it a puppet. Bar, phase pips and colours as `boss` events from `bosses.barState`; speech as `bossSay`; the def's outro comic plays on the guest (the host waits). Blows, counters and gadgets on him are claims, so his vulnerability windows decide on the host. |
| vehicles | host-simulated from the guest's input (stick, presses, camera aim in its hero record). The vehicle key on the guest is a press edge on the host: the split-screen seat rules make it the driver (the host runs its leap into the seat), a passenger, or put it out. The guest at the wheel steers pursuit and battle mode, strafes, boosts, dodges, ejects (into a glide on its own machine); as a passenger in battle mode its punch fires the turret along its own camera (`p.netFollow`). Props: Batmobile (pose, speed, battle/firing/boost flags, turret aim), its moving parts (transform, canopy, strafe), the Batwing. |
| paired moves | dual takedowns and team moves start on the host (it sees the guest's grab/special edges; the guest's glue only masks its own grab). The host ticks the guest hero's move control, so the strike lands on the host's clock through the guest's fighter; `glueMove` tells the guest to stand there and play its clip (one timeline). The shoulder throw locks its goon (`throw` is an exclusive action). |
| clock and weather | `env` every second and at once on a skip/set/pin change: the guest's clock adopts the host's value and shows the host's pinned hour; its weather is reseeded and pinned to the host's state; its own lightning is off and the host's strikes play (`strike`). |
| predator rooms | the host's stealth minds as a state blob (`net.stealth`: goon ids, glyph codes, armed count, 8 Hz); the guest draws the rings over its puppets. |
| AI Nightwing | an ally record on the wire; the guest spawns its own figure (same look) and poses it; never on its fight list. |
| enemy roles | role bits (weapon in hand, charged baton, phantom, stripped shield) pose the puppet and feed the guest's local hit rules; surrender, flee, medic revive and pickup are AI states; zip-ties, disarms, shields and batons are host rules applied through the guest's own fighter. Grapple pulls (yank/disarm/strip/resist) and gadget jams are claims (`fx`). |
| crimes, van chases, challenges | through the content seams (below): shared events, the side HUD mirrored, the crime marker; challenges are host only ("host only" hint, the host is told). |
| fast travel, waypoints | waypoint and `ftBring` pings carry their position (`pingExtra`); fast travel brings the partner on the other machine both ways (tested). |
| civilians | simulated locally from their own seed; they hear the stimuli that matter as events: impacts and shots (forwarded), crime spawns/ends (shared events: police on foot, siren cars). |
| photo mode, pause | per player: an online partner counts as a second player, so photo mode never freezes the world; the host's pause menu shows the guest "host away". |
| interiors | each machine's own hero decides its own indoor state (rain, music); the Wayne pockets sit far from the city, so a partner in another pocket is simply elsewhere. |

### Content seams (D3): `src/net/share.js`

Content code (crimes, side missions, new step types, anything another workstream adds) never
imports `src/net/game/**`. It registers once at load time:

```js
import { net } from '../net/share.js';
net.shareEvent('crimeSpawn', (d) => typeof d.kind === 'string');   // host -> guest event bus
net.registerState('side.hud', { hz: 6, snapshot: () => hud, apply: (v) => draw(v) }); // ≤ 4 KiB JSON
net.registerClaim('side.pillar', (d, { player }) => ask(d.id, player), (d) => typeof d.id === 'string');
if (net.claim('side.pillar', { id })) return;   // on a guest: sent to the host (true); else act locally
net.hostOnly(hud, 'Challenges are host only for now.');   // a guest-side hint helper
```

- **Shared events**: the host's `events.emit(name, data)` is re-emitted on the guest's bus as
  `{...data, remote: true}`; enemies travel by id and come back as the guest's puppets, players by
  net slot, vectors as `{x,y,z}`; functions, meshes and cycles are dropped (depth ≤ 4, lists ≤ 64,
  strings ≤ 200). Listeners that must not act twice check `d.remote`.
- **States** are sent when their JSON changes (and in every welcome, so a late joiner starts with
  the same HUD); over 4 KiB they are refused with a console warning.
- **Claims** run `hostHandler(data, { player })` on the host after the validator; 10/s per guest.
- **Expected state blobs** (not on this branch yet, connect at integration): `abilities` — the
  story's ability gates (which moves, traversal abilities and gadgets the story has unlocked;
  `abilities.snapshot()/apply()` from branch `ln2/onboard`). A guest online plays under the
  host's gates: `net.registerState('abilities', { snapshot: () => abilities.snapshot(), apply: (v)
  => abilities.apply(v) })` where the abilities layer is created (one line; the welcome carries
  it to a late joiner). The guest's apply must not write the guest's own save (`abilities` would
  then join `STORY_FIELDS` in `src/net/netSave.js` if it is a saved field).
- **The worked example** is `src/game/sideContent.js` `[net2]`: crimes (crime system v2 and the
  open world, J3: every event in docs/design/openworld.md 4 except `caseStage`, `caseConfront` and
  `stealthEncounterStart`, which drive host logic in `src/openworld/index.js` and must not run on a
  guest; `crimeUpdate` fills the guest's side panel), van chases and challenges share their events; radio calls, toasts and hints are one shared event (`sideHudLine`); the
  challenge panel and the crime marker are a state (`side.hud`); a guest at a challenge pillar
  claims `side.pillar` and gets the "host only" hint. The net layer uses the same seam for its own
  predator-room rings (`net.stealth`).

### Timing

- Clock: NTP-style pings, min-RTT of the last 8, slewed ≤ 1 ms per tick.
- Guests draw the world at `hostNow − (median one-way lag + buffer)`, buffer adaptive 100–250 ms
  (start 125 ms), extrapolation ≤ 100 ms then hold.

### Session life

- Handshake refuses another protocol, build (hashed chunk name) or content hash (`version`).
- Silent 1 s → away (the guest's hero is invulnerable and ignored by aggro); link closed or silent
  6 s → the guest reconnects on the same code with its token; the host holds the slot 60 s and
  sends a fresh welcome.
- Host leaving ends the session: the guest gets *The host ended the session* and is returned to the
  title on its own save (the page reloads; nothing of the host's world is kept).
- Host tab hidden ≥ 1 s or the host's pause menu open → the guest pauses under an overlay.

### Save rule

A guest keeps XP, upgrades, unlocks and trophies earned in the host's world; its own story fields
(`step`, `stepId`, `finished`, `seenIntro`, `milestone`) are put back before every write
(`netSave.js guestStorage`). The registered `online` field records sessions and the furthest step
seen in someone else's world. In *Same PC* mode the second tab shares one browser save, so it
writes nothing at all.

## Security

Every inbound message: size cap (64 KiB), JSON parsed in `try`, type whitelist by role, per-type
shape and range checks, per-kind token-bucket rate limits (hit claims 14/s), hit claims deduped and
reach-checked against where the host sees the guest, no `eval`, peer text cleaned and shown with
`textContent` only. The guest cannot spawn, despawn, advance the story, take items, or touch any
enemy beyond claims the host validates. Room codes are random (crypto RNG) and are the Trystero
password, so relay operators can't read the offer. The panels say plainly that a direct link shows
each player's internet address to the other.

## Bandwidth (D3 measurements)

Payload over BroadcastChannel in the e2e specs (before UDP/DTLS/SCTP overhead, ≈ +10–15%), target
≈ 150 kbit/s host→guest in a heavy scene:

| scene | host→guest | guest→host |
|---|---|---|
| brawl, 5–6 goons (`netCoop.spec` "online brawl"; two runs) | 22–40 kbit/s | 8–18 kbit/s |
| Batmobile chase, the guest at the wheel, 48 traffic cars around (`netCoop2` "drives"; two runs) | 17–25 kbit/s | 9–15 kbit/s |
| the Penguin with 8 adds (`netCoop2` "Penguin") | 63 kbit/s | — |

A chase costs little: the car is two 22-byte props and the traffic is not sent (it is local per
machine). The hero record grew from 39 to 49 bytes (presses, stick, camera aim): +3.2 kbit/s for
two heroes at 20 Hz down and +2.4 kbit/s up at 30 Hz. A 40-goon snapshot is still one 998-byte packet.

## Known limits

- **No TURN relay.** Some pairs cannot link directly (strict NAT, mobile CGNAT, some VPNs,
  corporate/school networks). The research estimates 80–90% of home pairs connect; that is an
  estimate, not a measurement. The failure message says what to try. A Metered or Cloudflare relay
  is a later option (it needs an account key or a Worker).
- Trystero's public Nostr relays are third-party infrastructure with no SLA; the manual code path
  is the fallback when they are down.
- (D3) Driving and gunning are host-simulated from the guest's input: the guest's steering
  reaches the car a round trip plus the interpolation delay late (≈150–300 ms on a home link). It
  feels heavy at speed; a client-predicted car is the next step if players notice.
- (D3) Host only for now, with a hint on the guest: flying the Batwing (the guest rides it), a
  guest's own bike (it rides in the Batmobile), challenges (time trials, the arena: they time the
  host's hero; the host is told the guest wants one).
- (D3) Local per machine (cosmetic, not synchronised): ambient traffic (positions differ; the
  host's Batmobile shoves the host's traffic only; crime siren cars are dispatched on both from the
  shared crime events), civilians' positions (their reactions to fights, shots and crimes are
  synchronised as events), weather wetness/snow build-up (the state itself is synced).
- (D3) Not sent yet: a framework boss's own hazard visuals (Freeze's ice, Scarecrow's gas, the
  Penguin's umbrella fire, the Riddler's plates) — their damage on the guest is; the crime props (the
  van, loot bags, the victim); the guest puppet's wingsuit roll (it plays the clip); a boss's swings
  at the guest are timed on the host (no defender-side window as goons have).
- (D3) Bruce days: the host plays Bruce; the guest is placed with it and can assist (ping) in a
  scene, but its own screen does not dress it as the ward and the scene's choices are the host's.
- (D3) A guest joining while the host's credits are up lands in free roam until the host's next step.

## Manual test checklist (two real PCs)

Automated tests cannot cover real NATs. Before a release, with two PCs on **different** networks:

1. Both load the same build (Ctrl+F5). PC A: *Host online game* → note the code and the time.
2. PC B: *Join with code* → measure time to the hero select (target < 15 s). Both Ready.
3. Badge on both shows `ONLINE · N ms`. Note N and the selected path (`__game.net.session.link.pathInfo()` in the console: host/srflx).
4. Fight a brawl together: both land hits; counter a goon attacking PC B (the counter window must feel the same as single-player); dodge; get knocked down and revived by the other.
5. Ping wheel and quick chat both ways.
6. Walk to the next objective on PC B only: the story advances on both.
7. Read a comic on PC A fast and on PC B slowly: PC A waits for B.
8. PC A minimises the window: PC B shows "Waiting for the host"; restore: play resumes.
9. Unplug PC B's network for 10 s: both show reconnecting; plug back: PC B resumes in the same place, enemies agree.
10. Batmobile chase: PC B is seated as passenger and sees the chase; exits with the vehicle key.
11. The boss: both fight the waves and the Joker; buzzer tiles and gas hurt PC B.
12. PC A ends the online game: PC B returns to its title with its own save (story step unchanged, XP kept).
13. Repeat 1–3 with *Paste codes*, and with a phone hotspot on one side (expect the "networks won't link" message without TURN).
14. Version mismatch: deploy a new build to one PC only: the join is refused with the version message.

Added by D3 (wave 3):

15. Drive: PC B walks up to the parked Batmobile at a `board` step and presses the vehicle key: PC B
    drives the chase (steer, boost, handbrake; note how the steering latency feels at speed), PC A
    rides along; PC B ejects at speed and glides; the other way round too.
16. Gunner: PC A drives the drone battle, PC B is seated and fires the turret where its own camera
    looks (mouse/right stick), the drones take hits on both screens.
17. Dual takedown: stun a goon (cape), both stand on either side, PC B presses grab: both play
    their part together and the goon goes down on both. Team move: both press special within half a
    second next to goons.
18. A later night: PC A continues a save in Night Two (or plays through Night One's credits): PC B
    joins and is on the same night and step (check the objective text); the night ends, the Bruce
    day plays on PC A (PC B is placed with it and sees the hint), Night Three starts on both.
19. A campaign boss (Penguin, Riddler, Scarecrow, Freeze): both fight; PC B sees him, his bar and
    his lines; PC B's blows count in his windows; the outro comic plays on both.
20. Predator room: PC B sees every goon's awareness ring (detective vision shows the armed count).
21. Time and weather: a Bruce day's time skip and the next night's pinned hour and weather look the
    same on both; lightning flashes on both at the same moment (within the link's latency).
22. Free roam: a street crime's police-radio call, the marker and the "crime stopped" toast show on
    PC B; PC B at a challenge pillar gets "host only for now" and PC A is told.
23. Fast travel from either PC brings the other along; a waypoint set "for partner" shows on the other.
24. PC B in photo mode: PC A's world keeps running; PC A in its pause menu: PC B waits under "host away".
