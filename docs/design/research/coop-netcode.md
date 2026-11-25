# Co-op netcode research — pressure test of long-night-2 §3 / §4.1 / §4.4

Researched 2026-11-24 for workstream D (net) and workstream B (players / split screen).
Scope: online 2-player co-op over WebRTC from a static GitHub Pages site, plus same-PC split screen.
Source dates are given inline as (YYYY-MM-DD) or (YYYY). **[unverified]** marks claims that I could not
confirm against a primary source and that come from memory or a single secondary source; test them
before relying on them.

---

## Decisions and why (read this page, act on it)

**Signalling and connection**

1. **Do not make PeerJS cloud (0.peerjs.com) the primary broker. Use Trystero (Nostr strategy) as
   the primary, keep the manual code as the last-resort fallback.** PeerJS cloud is one
   donation-funded server with no SLA, no stated limits and no uptime promise. Issue #1350
   ("6+ minute WebSocket delay on 0.peerjs.com") was opened 2025-10-14, has reports up to
   2025-10-25 of ~10-minute connects, and is still open while the status page shows green.
   Trystero's Nostr strategy talks to 5 public relays in parallel, backs off failing ones,
   and encrypts the SDP with the room password. It is actively released (0.27.0, 2026-11-11).
   *This contradicts design doc §3, which names PeerJS.*
2. **Pin Trystero to an exact version and vendor it.** It is pre-1.0 and ships breaking changes
   (0.25 → 0.26 → 0.27 between June and November 2026). Wrap it behind our own `signaller`
   interface so it can be swapped, or a second strategy (`@trystero-p2p/torrent` or `/mqtt`) can
   be raced alongside Nostr, without touching `session`.
3. **Use Trystero only to get the `RTCPeerConnection`, then open our own two channels.**
   `room.getPeers()[id].connection` exposes the `RTCPeerConnection` for direct peers. On both sides,
   create negotiated channels (`negotiated: true`, fixed `id`s) so no renegotiation is needed:
   - `ctl` — reliable, ordered: handshake, events (hits, KOs, story, pickups, crimes), the welcome
     state, reconnect.
   - `state` — `ordered: false, maxRetransmits: 0`: snapshots (host→guest), hero state
     (guest→host), and clock pings.
   Use ids 100/101. **[unverified]** that this cannot collide with Trystero's own channel id, so
   assert `readyState === 'open'` on both channels in the Playwright WebRTC test.
4. **Manual code fallback: host offers, guest answers, and the answer must reach the host within
   ~10–15 s.** Late answers fail at the ICE/DTLS layer, with no API to extend the window (juberti
   and fippo on w3c/webrtc-pc#2945, 2024-02-27). Wait for ICE gathering to complete (cap 3 s)
   before showing a code. Deflate the SDP (`CompressionStream('deflate-raw')`) and encode it as
   base64url. Show a countdown on the host's paste box, and regenerate the offer automatically
   when it fails. A QR code adds nothing for two PCs; skip it.
5. **STUN: `stun:stun.cloudflare.com:3478` plus `stun:stun.l.google.com:19302`, no more than two.**
   Cloudflare publicly states its STUN is free and unlimited. Google's is the de-facto standard
   but has no published terms. Firefox warns that more than two servers slows gathering
   **[unverified]**.
6. **Expect roughly 80–90% of pairs to connect without TURN.** The data is old (callstats
   2015–16: ~78–85% connected without relay), and Trystero's 2026 docs say ~10–15% of pairs are
   affected. Strict NAT, mobile CGNAT, corporate or university networks and VPNs are where it fails.
   Ship STUN-only first, with good failure messages. Add **optional TURN through a free Metered
   Open Relay account** (20 GB/month; the API key is fetched in the browser, which is their own
   documented pattern). At ~150 MB per relayed hour, 20 GB covers ~130 relayed hours a month. The
   worst case of a leaked key is a used-up quota. Cloudflare TURN (1,000 GB free) needs credentials
   minted server-side with a secret token, so it needs a free Cloudflare Worker. That counts as a
   server, so treat it as a later option only.
7. **Detect each failure separately and name it to the player.** Broker unreachable (Trystero
   `relay-failed`, or no relay socket open after 10 s) → "Can't reach matchmaking — use *Join with
   code*". ICE failed (`peer-connect-failed` or `connectionState === 'failed'` after ~20 s) →
   "Your networks block a direct link. Try: swap who hosts; turn off VPN; use home Wi-Fi, not a
   phone hotspot or work/school network." Version mismatch → "You're on different versions —
   both press Ctrl+F5." In the lobby, run a STUN pre-check: no `srflx` candidate within 3 s means
   UDP is blocked, so warn before the code is shared. Log the selected candidate pair type from
   `getStats()` for bug reports.

**Wire format**

8. **Snapshots are hand-rolled `DataView` binary, under ~1,100 bytes per message. Reliable events
   are versioned JSON.** At 40 entities × ~18 B, plus two heroes and a header, a snapshot is
   ~800 B. At 20 Hz that is ≈16 KB/s (≈130 kbit/s) host→guest. Guest→host is ≈2–4 KB/s. JSON
   snapshots would be 4–5× larger and allocate every tick. msgpack buys nothing over a fixed
   schema. Each WebRTC SCTP packet carries ≈1,130–1,190 bytes of payload, so a bigger
   unreliable message is fragmented. If a snapshot outgrows that, split it into self-contained
   per-entity-group messages. Do not let SCTP fragment it.
9. **Back-pressure:** on `state`, if `bufferedAmount` is more than ~2 snapshots, drop this
   snapshot rather than queue it. On `ctl`, chunk the welcome state into ≤16 KiB pieces and pace
   them with `bufferedAmountLowThreshold`/`bufferedamountlow`.

**Replication**

10. **Interpolation delay: start at 2.5 send intervals (125 ms at 20 Hz), and adapt between 100
    and 250 ms from measured jitter.** Extrapolate at most 100 ms, then hold the pose. This is
    Valve's 2×-interval rule (`cl_interp 0.1` at 20 Hz) with Gaffer's loss margin. Use Hermite
    position interpolation with velocity in the snapshot.
11. **Clock sync:** NTP-style ping/pong on the `state` channel every 1 s (every 250 ms for the first
    2 s). Keep the minimum-RTT sample of the last 8 and slew the offset smoothly, never stepping
    it. Everything uses `performance.now()` mapped to host time.
12. **Global time scaling has to go in multiplayer — this is the biggest risk in the design
    doc.** `src/core/time.js` scales one world clock. It handles hit-stop on every hit
    (`combatSystem.js`), slow-motion, the gadget-wheel hold (0.2× while open) and the impact freeze
    (0.01×). In split screen, P1 opening the wheel slows P2's fight. Online, the host's hit-stops
    would stutter the guest's world, and the guest's would desync the host. Replace it with:
    - **Hit-stop** applied per entity: freeze the attacker's and victim's animation and
      locomotion only.
    - **Holds** (wheel, remote-batarang steering) that do not scale world time in co-op.
    - **World slow-motion** only as a rare, host-broadcast cinematic event (for example, the boss
      finisher) with a host-time start.

    Neither §4.1 nor §4.4 mentions this. It belongs in workstream B's contract.
13. **Defence is resolved on the defender's machine; offence is validated by the host with
    rewind.**
    - The host starts an enemy attack as a reliable event: enemy, target player, attack id and
      host start time. The target's machine plays it and resolves counter, dodge or hit against
      its own view, then reports the result.
    - The host applies damage to a remote hero only on that report, or on a timeout (attack end
      + RTT + 150 ms).
    - This makes counter windows latency-proof for the guest. For the host's own hero, nothing
      changes.
    - For guest hit claims, the host rewinds enemy state to `claimTime − guestInterpDelay` from a
      1 s history and checks reach, liveness and cooldown.
    - Exclusive actions (grabs, takedowns, finishers, counter-throws) need a host lock grant
      first. The guest plays the wind-up while it waits.
14. **Aggro and attack tokens per player.** `pickTarget` picks a target at wind-up start and only
    re-targets between attacks. The attack director limits simultaneous attackers *per player*.
    The target id goes in the attack event, so the puppet faces the right hero on both machines.
15. **Enemy puppets replicate animation state, not bones.** Send the state id, a state sequence
    counter, and the host time the state started. The guest plays the same clip at
    `hostNow − interpDelay − stateStart`. State changes also go as reliable events, so short
    states (flinch, counter-stun) are never missed between snapshots.
16. **A hidden host tab stops the world, so handle it explicitly.**
    - Hidden pages get no `requestAnimationFrame`.
    - Timers drop to 1 Hz (an open `RTCDataChannel` only prevents the 1-per-minute "intensive"
      mode).
    - On Windows, Chrome also marks a fully covered window hidden **[unverified in current
      Chrome; reported in Mozilla bugs]**.

    **v1:** after 1 s hidden, the host sends `hostAway`, and both sides pause with an overlay.
    **v2:** while hidden, step the host simulation from the guest's incoming `state` messages
    (message events are not timer-throttled), capped at 50 ms steps.
    If the guest is hidden or silent for 1 s, its hero becomes "away": invulnerable and ignored by
    aggro.
17. **No host migration.** If the host leaves, the guest gets "Host left" and returns to its own
    save at its last checkpoint. Reconnect: the guest keeps a session token in `sessionStorage`,
    and the host holds the slot for 60 s. On `disconnected`, wait 5 s. On `failed`, rejoin through
    the broker and receive a fresh welcome snapshot. A late join gets the same welcome. Player-count
    scaling applies from the next spawn wave, never mid-fight.

**Split screen**

18. **Give each view its own RT pair (colour+depth and normal) at view size, and its own
    ink-quad uniforms.** Then composite to the canvas with `setViewport` + `setScissor` +
    `setScissorTest(true)` per view.
    - In r186, `setViewport`/`setScissor` affect only the canvas. A render target uses its own
      `rt.viewport`/`rt.scissor` in physical pixels; checked in `WebGLRenderer.js`.
    - Sharing one full-size RT makes the edge filter sample across the seam.
    - Render the shadow map once per frame, unless the two heroes are far apart. Cost is ~2× CPU
      and draw calls, so drop one quality tier in split screen.
19. **Input:** "press a button to join" claims a slot by `gamepad.index` (two identical pads share
    `id`). Poll `navigator.getGamepads()` every frame. At most **one** keyboard+mouse player — the
    browser can't tell keyboards or mice apart. That player owns pointer lock. If a pad disconnects,
    pause and ask the player to press a button again; the index can change.

**Testing and security**

20. Playwright tests:
    - **BroadcastChannel transport:** two pages in **one** context. Separate contexts don't share
      it.
    - **Real WebRTC:** two contexts in one headless Chromium. The test passes the SDP between
      them, so no broker is involved. Launch with `--disable-background-timer-throttling
      --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`.
    - **Link conditioner:** a seeded transport wrapper that adds delay, jitter and loss (loss
      only on `state`).
    - **Invariants after quiesce:** same enemy ids, health, alive flags, story step, crimes and
      pickups on both sides, and zero guest-originated spawns.
21. **Security:**
    - Handshake first: protocol version, build hash and a content hash. Mismatch is refused.
    - The guest may send only hero state, input-level claims, defence reports and lobby/chat.
      Every other type from the guest is dropped.
    - Validate everything: finite numbers, clamped ranges, speed checks, claim rate limits and a
      64 KiB message cap. Decode inside `try`.
    - Allow one guest; the host can kick.
    - Tell players that P2P shows their IP to the other player.

---

## 1. Signalling with no server of our own

### PeerJS cloud (0.peerjs.com) — status today

| Fact | Source |
|---|---|
| Free shared broker. No stated limits, no terms, no uptime promise. Asks for donations. Recommends running your own PeerServer for high traffic. IDs can collide if you choose them yourself. | [peerjs.com/server/cloud](https://peerjs.com/server/cloud) (fetched 2026-11-24, undated page) |
| Library is maintained but slowly: v1.5.5 2025-06-07, v1.5.4 2024-05-14, v1.5.2 2023-12-05. | [github.com/peers/peerjs/releases](https://github.com/peers/peerjs/releases) |
| Issue #1350 "Extreme WebSocket connection delay (6+ minutes) on 0.peerjs.com". Opened 2025-10-14, closed, reopened 2025-10-16. Further reports 10-18, 10-23 (~10 min average) and 10-25. Open, labelled unconfirmed. The status page showed green during it. | [peers/peerjs#1350](https://github.com/peers/peerjs/issues/1350) |
| Status page exists and was green on 2026-11-24. No uptime history shown. | [status.peerjs.com](https://status.peerjs.com/) |
| Historic outage threads in 2020, 2021 and 2022. | [dev.to PeerJS alternatives](https://dev.to/alakkadshaw/peerjs-alternatives-in-2026-free-turn-auto-reconnect-and-which-webrtc-library-to-actually-pick-14ad) (2026-06; **vendor-authored by Metered staff**), [peers/peerjs#671](https://www.github.com/peers/peerjs/issues/671) |

**Verdict:** PeerJS cloud is usable but a single point of failure with a recent, unresolved
multi-minute delay. That is fine as one of two raced brokers, not as the only one.

### Trystero

- Strategies (from the repo's `docs/signaling.md`, 2026):

  | Strategy | Package | Setup | Relays used at once | Bundle (Brotli) |
  |---|---|---|---|---|
  | Nostr (default) | `trystero` | none | 5 | ~46 KB |
  | MQTT | `@trystero-p2p/mqtt` | none | 4 | ~122 KB |
  | BitTorrent trackers | `@trystero-p2p/torrent` | none | 3 | ~43 KB |
  | Supabase | | project URL + anon key | | |
  | Firebase | | RTDB URL + security rules | | |
  | Self-hosted WS relay | `ws-relay` | your own server | | |

  Nostr only emits `relay-failed` when *every* relay fails. Torrent heartbeats are
  tracker-controlled (≥10 s), so discovery is slower.
  [docs/signaling.md](https://github.com/dmotz/trystero/blob/main/docs/signaling.md)
- The SDP is encrypted with AES-256-GCM. A room `password` derives the key with PBKDF2 (600k
  iterations), so relay operators and strangers who guess the room name can't join. Game data
  goes peer to peer. [README](https://github.com/dmotz/trystero)
- `getPeers()` returns `{connection: RTCPeerConnection | null}` per peer (null only for multi-hop
  peers). Options include `rtcConfig`, `turnConfig`, `maxUsers` (send `room-full`), `trickleIce`
  and `relayConfig`. Error codes include `relay-failed`, `peer-connect-failed`, `decrypt-failed`
  and `handshake-failed`. The defaults are Google and Cloudflare STUN.
  [docs/api.md](https://github.com/dmotz/trystero/blob/main/docs/api.md)
- Releases from the npm registry: 0.25.2 2026-06-11, 0.25.3 07-13, 0.25.4 08-30, 0.26.0 10-04,
  0.27.0 2026-11-11. The repo has ~2.9k stars and 2 open issues (2026-11-24).
- **Room code design.** Use `appId = 'gotham-long-night/<protocolVersion>'`, so mismatched builds
  don't even meet. Use room = the code and password = the code. Make the code 6–8 characters from
  an unambiguous alphabet. Set `maxUsers: 2`.
- **[unverified]** How reliable public Nostr relays are for this traffic in practice. Some relays
  rate-limit or reject ephemeral events, and Trystero evicts those. Measure the connect time in a
  real two-network test before launch.

### simple-peer

The last release is 9.11.1, published 2022-02-17; the registry was last modified 2023-01-26. It
pulls Node shims. It is stale, so don't adopt it. The raw browser API plus Trystero covers
everything it did.

### Manual copy-paste code

- A minimal datachannel SDP can be ~100 characters: ufrag, pwd, fingerprint as base64, candidates
  ([webrtcHacks "Minimum viable SDP"](https://webrtchacks.com/the-minimum-viable-sdp/), 2015-03-31).
  Custom SDP munging is brittle, though. Deflate the full SDP instead: a few hundred base64url
  characters, which Discord or WhatsApp handle fine. Libraries `sdp-compact`, `sdpmin` and
  `sdp-minimizer` exist on npm if shorter codes matter **[not evaluated]**.
- **The timing trap.** Once the guest applies the offer and creates the answer, ICE checks and
  the DTLS handshake start on the guest's side. If the host takes longer than ~10–15 s to paste
  the answer, the connection fails, and there's no knob for it.
  [w3c/webrtc-pc#2945](https://github.com/w3c/webrtc-pc/issues/2945) (2024-02-27, juberti and
  fippo). The 2015 webrtcHacks article puts it at ~30 s. The UX should therefore:
  1. Have the host make the offer, which has no time pressure.
  2. Have the guest paste it and get an answer code.
  3. Tell both players to be on voice chat and paste the answer immediately; show a 15 s countdown.
  4. When it fails, create a fresh offer automatically.
- Use non-trickle: wait for `icegatheringstatechange → complete`, with a cap of ~3 s, before
  printing a code.

### Failure modes and how to surface them

| Failure | Detect | Tell the player |
|---|---|---|
| Broker unreachable or slow | Trystero `relay-failed`; no relay socket after 10 s; PeerJS `open` not fired after 10 s | "Can't reach matchmaking right now. Use *Join with code* instead." (open the manual tab) |
| Room code wrong or host gone | No peer within 30 s | "No game found for that code. Check it with your friend." |
| Wrong password or old build | `decrypt-failed`; different `appId` means they never meet; handshake mismatch | "You're on different versions — both press Ctrl+F5." GitHub Pages caches for ~10 min **[unverified: max-age=600]**. |
| ICE failure (NAT) | `peer-connect-failed`; `pc.connectionState === 'failed'`; STUN pre-check found no `srflx` | Show the network advice from decision 7. Offer "Try relay mode" when TURN is configured. |
| Room full | `room-full` | "That game already has two players." |

---

## 2. NAT traversal without TURN

- **Success rate.**
  - The often-quoted 20% "needs TURN" figure and the 78–85% STUN-only success figure come from
    callstats data published on webrtcHacks (2015–16) and vendor blogs. They are stale but
    consistent ([discuss-webrtc thread](https://groups.google.com/g/discuss-webrtc/c/5d_EJwM6iJM);
    [fippo, "So I read that 20% of WebRTC calls fail"](https://medium.com/@fippo/67b185e49765)).
    fippo warns not to read relay share as failure rate.
  - Trystero's 2026 troubleshooting doc says ~10–15% of connections are affected: corporate and
    university networks, CGNAT, some VPNs
    ([docs/troubleshooting.md](https://github.com/dmotz/trystero/blob/main/docs/troubleshooting.md)).
  - For two home-broadband gamers, expect most pairs to connect. Expect failures for mobile
    hotspots, CGNAT ISPs (Starlink is widely reported as CGNAT **[unverified]**), and both sides
    behind symmetric NAT.
- **STUN servers.**
  - `stun.cloudflare.com` is "free and unlimited"
    ([Cloudflare TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/), fetched
    2026-11-24). It is the only public STUN with an explicit permission statement.
  - `stun.l.google.com:19302` is used by Trystero's defaults and by most tutorials. It has no
    published terms, so it is acceptable in practice.
  - Use two servers only.
- **Free TURN options.**
  - **Cloudflare Realtime TURN.**
    - Free: 1,000 GB/month egress, shared with the SFU; then $0.05/GB.
    - Credentials are minted by `POST rtc.live.cloudflare.com/v1/turn/keys/{id}/credentials/generate-ice-servers`
      with a secret bearer token, and live at most 48 h. The docs show this done in a backend or
      Worker.
    - There is no TCP relaying (RFC 6062), and relay addresses are IPv4 only.

    Sources: [FAQ](https://developers.cloudflare.com/realtime/turn/faq/),
    [generate credentials](https://developers.cloudflare.com/calls/turn/generate-credentials).

    **It cannot be used from a pure static site without leaking a token that can mint unlimited
    credentials.** A free Cloudflare Worker would solve that, but that is a server.
  - **Metered Open Relay.**
    - 20 GB/month free with an account. The API key is called from browser JS in their own
      examples.
    - Also a published "static auth" shared secret (`openrelayprojectsecret`) with no signup.
    - Ports 80 and 443, plus TURNS. No SLA.

    Source: [metered.ca/tools/openrelay](https://www.metered.ca/tools/openrelay/) (fetched
    2026-11-24).

    Acceptable for a friends game as **opt-in relay mode**. Put the key in a config file and
    rotate it if it's abused. Only use relay after a direct attempt fails, either with a new
    `RTCPeerConnection` that has TURN, or with `iceTransportPolicy: 'relay'` for players who want
    to hide their IP. **[unverified]** Whether the free plan hard-stops at 20 GB or bills; check
    the account settings before shipping a key.
- **What to tell the player** is in the failure table above. Keep it short, give concrete
  actions, and never say "NAT". Example: "Your networks won't let the game link directly. Try
  swapping who hosts, turning off any VPN, or using home Wi-Fi instead of a phone hotspot or a
  work/school network."

---

## 3. DataChannel configuration for games

- **Reliability options** (`RTCDataChannelInit`):
  - `ordered` (default true).
  - `maxRetransmits` or `maxPacketLifeTime`, not both.
  - `negotiated: true` with an `id`, so both sides create the channel with no in-band open
    message.

  Unordered plus `maxRetransmits: 0` is the UDP-like mode for snapshots: a lost snapshot is
  superseded by the next one (Gaffer, below).
  [MDN Using data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
  (modified 2026-06-22).
- **Message size.**
  - Max size is negotiated by SDP `max-message-size` (RFC 8841). The default is 64 KiB when it's
    absent. "Most modern browsers support at least 256 KB." Without RFC 8260 interleaving, a large
    message blocks other channels (head of line). (MDN, same page)
  - The ≤16 KiB chunk size is the historic cross-browser safe size **[from memory, not
    re-verified]**.
  - Chrome closes the channel and throws `OperationError` if the send buffer passes ~16 MiB
    **[unverified]**. Irrelevant at our rates, but don't queue without limit.
- **MTU and fragmentation.**
  - The initial path MTU is ≤1,200 bytes (IPv4) / 1,280 bytes (IPv6), which leaves roughly
    1,130–1,190 bytes of SCTP payload ([RFC 8831](https://www.rfc-editor.org/rfc/rfc8831.html),
    2021).
  - Chrome hard-codes an MTU of about 1,191 bytes
    ([Mozilla bug 1699230](https://bugzilla.mozilla.org/show_bug.cgi?id=1699230)).
  - Larger messages are fragmented by SCTP. For a partially reliable message, losing a fragment
    loses the message **[not confirmed in a primary source; the dcSCTP commit history implies
    it]** ([dcSCTP commit](https://webrtc.googlesource.com/src/+/8beccd5c4784b5db8757336eb5be45ccf172b5ee)).

  **Keep each snapshot message ≤ ~1,100 bytes.**
- **Back-pressure.** `bufferedAmount` counts the bytes queued. `bufferedAmountLowThreshold`
  defaults to 0, and the `bufferedamountlow` event fires at or below it
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold),
  modified 2025-06-24). Policy:
  - `state`: if `bufferedAmount > 2 × lastSnapshotBytes`, skip this tick.
  - `ctl`: send chunks while `bufferedAmount < 64 KiB`, and resume on `bufferedamountlow`.
- **Encoding.**
  - **Snapshots and hero state:** a fixed-schema `DataView` writer into one reused `ArrayBuffer`.
    Field layout and size per field:

    | Field | Bytes |
    |---|---|
    | Header: `u8 msgType`, `u8 proto`, `u16 seq`, `f64 hostTimeMs`, `u8 count` | 13 |
    | Entity id (`u16`) | 2 |
    | Position x, y, z (`i16` at 2 cm, relative to the region origin; `f32` where needed) | 6 |
    | Velocity x, z (`i16`) | 4 |
    | Yaw (`u16`) | 2 |
    | Anim state (`u8`) | 1 |
    | State seq (`u8`) | 1 |
    | State age (`u16` ms) | 2 |
    | Health (`u8`, in % of max) | 1 |
    | Flags (`u8`) | 1 |

    That is ≈20 B per enemy and ≈30 B per hero (more anim and flags).
  - **Events:** JSON, `{t:'hit', v:1, ...}`. They are low rate, easy to validate and easy to
    read in tests.
  - **msgpack:** adds a dependency and allocation, and is still ~2× a fixed schema.
- **Bandwidth budget at 20 Hz.**

  | Direction | Payload | Rate |
  |---|---|---|
  | Host → guest | 13 + 40×20 + 2×30 ≈ 870 B | ≈ 17.4 KB/s ≈ 140 kbit/s, plus ~60–80 B/packet UDP/DTLS/SCTP overhead ≈ 150 kbit/s |
  | Guest → host | hero state 30 B at 30 Hz, plus claims | ≈ 1–3 KB/s |

  Events are negligible except for the welcome state, a one-off 10–50 KB. **Budget: 200 kbit/s
  down for the guest, 50 kbit/s up.** Relayed through TURN that is ~150 MB/hour, both directions
  counted once.

**Recommended channel layout**

| Channel | Options | Direction | Carries |
|---|---|---|---|
| `ctl` (id 100) | negotiated, ordered, reliable | both | hello/version, welcome state (chunked), events, hit claims, defence reports, lock requests and grants, pause/away, bye |
| `state` (id 101) | negotiated, `ordered:false, maxRetransmits:0` | both | snapshots H→G, hero state G→H, ping/pong (clock sync) |

Pings go on `state` so that reliable-channel retransmits don't inflate the RTT.

---

## 4. Host-authoritative co-op replication for a melee game

### Interpolation and clocks

- **Valve:** `cl_interp 0.1` = 2 × (1/20 Hz), "even if one snapshot is lost, there are always two
  valid snapshots to interpolate between". The effective delay is
  `min(max(cl_interp, ratio/updaterate), 0.25)`
  ([Valve Dev Wiki: Source Multiplayer Networking / Interpolation](https://developer.valvesoftware.com/wiki/Interpolation);
  the page returned 403 to the fetcher and was confirmed via search excerpts).
- **Gaffer:** buffer ≈ 3 packets (10 Hz → 350 ms, 30 Hz → 150 ms, 60 Hz → 85 ms), so that two
  packets in a row can be lost. Add a small jitter margin. Hermite interpolation with velocity
  removes jitter at low rates.
  ([Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/), 2014-11-30)
- **Gambetta:** render others one update interval in the past, and keep the local player in the
  present ([Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html),
  undated; ©2026).
- **Our choice:** start at 125 ms at 20 Hz. Adapt to `2 × interval + p95 jitter`, clamped to
  [100, 250] ms. Extrapolate ≤100 ms. Clock: offset = `((t1−t0)+(t2−t3))/2` from the minimum-RTT
  sample of the last 8. Slew at most 1 ms per frame.

### Ownership

- **Host-authoritative world, client-authoritative own hero.** This is the right call, and it is
  the same split Halo: Reach used. Reach had host adjudication for gameplay, a prioritised
  semi-reliable state stream plus events, and the talk "I Shot You First" (Aldridge, GDC 2011)
  ([Edgegap summary](https://edgegap.com/blog/game-backend-deep-dive-halo-reach-netcode-host-migration),
  2026, dates on the page conflict). The guest owns its hero transform and its animation state.
  The host checks speed and teleport limits and corrects with a reliable `heroCorrect` only on
  gross violations.
- **Offence (guest hits an enemy).**
  1. The guest picks targets from puppets.
  2. It plays the hit locally: flinch, spark, its own combo continues.
  3. It sends `hitClaim {enemyId, moveId, claimHostTime, comboIdx}`.
  4. The host rewinds the enemy from its 1 s ring buffer to `claimHostTime − guestInterpDelay`.
  5. It checks alive, reach (move range + 0.5 m slack), cooldown and not-lock-held-by-other.
  6. It applies the hit and broadcasts `hit {enemyId, by, dmg, newHp, reaction}`.

  A reject is rare. The guest's puppet then simply snaps to the host state. Overwatch's "favour
  the shooter" is the same philosophy
  ([GDC 2017 Overwatch Gameplay Architecture and Netcode](https://gdcvault.com/play/1024001)).
- **Defence (enemy attacks the guest).**
  - The host emits `attackStart {enemyId, targetPlayer, attackId, hostStart}` on `ctl`.
  - The guest's puppet starts the wind-up on receipt, already `RTT/2 + interp` late. The guest's
    *own* counter and dodge logic resolves against that local timeline, with the full designed
    window.
  - The guest reports `defence {attackId, result: countered|dodged|hit|blocked}`.
  - The host applies the result, or on timeout treats it as a hit for an ordinary attack. For a
    counter, the host makes the enemy react from now. Visual offset is ≤ RTT/2.
  - Without this, every counter window shrinks by the full RTT for the guest.
  - For contrast, For Honor (all-peer simulation) added 33 ms input delay to offence only and
    left defence alone, to protect parries
    ([Ubisoft, 2018-04-12](https://www.ubisoft.com/en-us/game/for-honor/news-updates/4qgcoZf3m61lpWD8GlN4JO/input-delay-in-for-honor)).
    The 2020 attack-change post designs around a 100 ms buffer
    ([Ubisoft, 2020-02-27](https://www.ubisoft.com/en-au/game/for-honor/news-updates/9OPowoU28h2YRO8zSvw5z/testing-grounds-how-attacks-are-changing)).
    Players complain about parries that "succeeded on my screen" in server-decides models, which
    is exactly what defender-side resolution avoids.
- **Exclusive actions** (grab, ground takedown, finisher, counter-throw, paired animations):
  `lockReq {enemyId, action}` → host `lockGrant`/`lockDeny` within 1 RTT. The guest plays the
  wind-up while it waits and on deny falls back to a whiff. The host's own exclusive actions take
  the same lock locally, so the two players never both finish the same thug.
- **Who the enemy faces and attacks.**
  - `pickTarget` (§4.1) runs on the host only, at wind-up start.
  - The target stays fixed until recovery.
  - Attack tokens are per player (e.g. max 2 active attackers per player).
  - The facing comes from the target id in `attackStart`, not from a replicated yaw, so the
    puppet turns to the right hero even before the next snapshot.
- **Puppet animation.**
  - Snapshot: `animState`, `stateSeq`, `stateAgeMs`.
  - Reliable `enemyState` events on every transition that matters for gameplay (attack, stagger,
    knockdown, get-up, KO).
  - The guest drives the shared skeleton with `clip(animState)` at time `stateAge + elapsed`. On
    a seq change it cross-fades over ~80 ms.
  - Never replicate bones.
  - Ragdoll and knockback impulses: send the impulse vector once in the `hit` event and simulate
    locally. The snapshot position wins after landing.

### Time scaling (hit-stop, slow-mo, holds) — needs a contract change

Today `time.scale(dt)` slows the **whole world** for:

- hit-stop on every connecting hit (0.04–0.14 s)
- slow-motion (counters 0.18 s at 0.35×, finisher 0.8 s at 0.28×, boss 1.4 s at 0.25×)
- the gadget wheel (0.2× while open)
- remote batarang steering (0.3×)
- the impact freeze (0.01×)

(`src/core/time.js`, `combatSystem.js`, `gadgetSystem.js`, `remote.js`, `game.js:702`.)

This is incompatible with two players sharing a world, both online and in split screen.
Recommended rules for when `players.length > 1`:

- **Hit-stop becomes per entity.** Attacker and victim get `localFreeze` timers that pause their
  animator and locomotion. The world clock keeps running. Fighting games do this, and it reads the
  same to the player who landed the hit. It is cosmetic, so it is not replicated; each machine
  freezes the entities involved in the hits it sees.
- **Holds don't scale world time in co-op.** The wheel opens without slow-mo, or slows only the
  local hero's input or camera. Remote steering is the same.
- **World slow-mo** is kept only for host-broadcast cinematic beats: the boss finisher, the story.
  `slowMo {scale, durationMs, hostStart}` is applied identically on both machines. This also
  scales the guest's own hero, which is acceptable for a cinematic.
- **Snapshot timestamps** use host *wall* time (`performance.now` mapped). Do not use scaled game
  time, or interpolation breaks during slow-mo.

### Late join, reconnect, background tabs, host leaving

- **Welcome state** (reliable, chunked ≤16 KiB): protocol and build, story step and flags, world
  clock and weather, region, all live enemies (full records), crimes, pickups, the host hero, and
  the guest's spawn point. After it, deltas and snapshots continue from the `stateSeq` it states.
  Reconnect reuses the same path.
- **Reconnect.**
  - The guest stores `{roomCode, sessionToken}` in `sessionStorage`. The host holds the slot and
    hero for 60 s.
  - `iceconnectionstate 'disconnected'`: wait up to 5 s, since it usually recovers.
  - `'failed'`: close it and rejoin through the broker. A fresh peer connection is simpler than
    `restartIce()`, which needs live signalling anyway.
- **Hidden host tab.**
  - rAF stops in hidden tabs ([MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
  - Chrome throttles timers to 1/s once hidden. After 5 min hidden it goes to 1 per minute,
    unless the page was audible in the last 30 s or has an `RTCPeerConnection` with an open
    `RTCDataChannel`. ([Chrome: timer throttling in Chrome 88](https://developer.chrome.com/blog/timer-throttling-in-chrome-88))
  - So an open data channel only prevents the per-minute mode; the host still drops to ~1 Hz.
  - Firefox budgets background timers too ([bug 1377766](https://bugzilla.mozilla.org/show_bug.cgi?id=1377766)).
  - Dedicated workers are also throttled in background tabs, per a Chromium intent and Firefox
    bugs, so "run the loop in a worker" is **not** a safe fix **[current Chrome behaviour
    unverified]** ([blink-dev intent](https://groups.google.com/a/chromium.org/d/topic/blink-dev/8xpEA-iNHwg)).
  - Chrome on Windows reportedly also marks a *fully covered* window as hidden and stops rAF
    (Native Window Occlusion, Chrome 86+, [Mozilla bug 1712854](https://bugzilla.mozilla.org/show_bug.cgi?id=1712854))
    **[verify in current Chrome]**. A host who covers the browser with Discord could freeze the
    game.

  Plan:
  - **v1:** after 1 s of `document.hidden`, the host broadcasts `hostAway`. The guest pauses
    under an overlay ("Waiting for host — their game window is minimised"). Resume on visible.
  - **v2:** while hidden, the host runs `step(min(dt, 0.05))` in the `state` channel's
    `onmessage` (driven by the guest's 30 Hz hero-state stream) and sends a snapshot every second
    step. DataChannel message events are tasks, not timers, so they aren't timer-throttled
    **[reasoned, verify in Chrome and Firefox]**.
- **Hidden guest.** It stops sending. After 1 s of silence the host marks the guest hero `away`:
  invulnerable, not targeted.
- **Host leaves.** No host migration: all world state lives on the host, and Reach-style
  migration is a big project. The guest sees "Host ended the session" and returns to its own
  save. **Design question for workstream B:** "shared story progress" — should the *guest's*
  save advance story steps done in someone else's world? The recommendation is no. The guest keeps
  XP and unlocks and gets a "completed in co-op" marker. This avoids skipping story in the
  guest's own run.

---

## 5. Split screen with the ink pipeline (three r186, WebGL2)

**Facts from `node_modules/three/src/renderers/WebGLRenderer.js` (r186):**

- `setRenderTarget(rt)` copies `rt.viewport`, `rt.scissor` and `rt.scissorTest`. These are in the
  RT's own pixels.
- `setRenderTarget(null)` uses `renderer.setViewport`/`setScissor` × `pixelRatio`, floored. Those
  are CSS pixels.
- So `renderer.setViewport` does **nothing** for the colour and normal passes. Only the final
  quad to the canvas obeys it.

Community threads agree: re-set viewport and scissor every frame, and EffectComposer buffers
break continuity across viewports, so render each view to its own target
([three.js forum, 2024](https://discourse.threejs.org/t/problem-of-continuity-in-the-rendering-in-multiple-views-viewport-scissor-with-the-composer/70176)).

**Recommended structure for `inkPipeline.js`:**

- **`createInkView()` per view**, owning `colorRT` (+ `DepthTexture`) and `normalRT`, sized to
  the view's pixel rect, plus a per-view uniform block:
  - `tColor`, `tDepth`, `tNormal`
  - `uTexel`, `uNear`, `uFar`
  - `uImpact`, `uImpactSoft`, `uImpactCenter`
  - `uFlash`, `uDetective`

  Shared uniforms stay global: palette, comic settings, filter, time. Either one material per
  view (same shader source, so three reuses the program and there's no recompile), or swap the
  uniform values before each quad draw.
- **Per frame:**
  1. Shadow map: set `renderer.shadowMap.needsUpdate = true` only before the **first** view's
     colour pass; today it's set every `render()` call, which would render shadows twice.
     **[check]** If the shadow frustum follows P1's hero, P2 gets no shadows when the players
     separate. Either fit the frustum to both heroes, or update it per view on high and ultra
     only.
  2. For each view:
     - Set `camera.aspect = w/h` and `updateProjectionMatrix()`.
     - Render the colour pass to `view.colorRT`, then the normal pass to `view.normalRT`.
     - Then `setRenderTarget(null)`, `setViewport(rect)`, `setScissor(rect)`,
       `setScissorTest(true)` and render the quad with that view's uniforms.
     - The X-ray overlay pass (`uDetective`) renders straight to the canvas. It runs inside the
       same viewport and scissor, and `clearDepth()` respects the scissor (WebGL clears are
       scissored).
  3. `setScissorTest(false)` at the end.
- **Layout:** side-by-side (vertical split) on 16:9 and wider, top/bottom as an option. A
  side-by-side view is 8:9, so widen the FOV a little or pull the camera back. DOM HUD per
  `hudSlot` rect.
- **Cost:**
  - Total pixels are about the same: two half-size views.
  - Scene traversal, culling and draw calls double: two colour passes and two normal passes. The
    game is draw-call heavy (see the normal-pass sorting comments), so expect ~1.6–2× CPU render
    time.
  - Rule: split screen drops one quality tier, and the crowd and draw distance read the per-view
    camera.
  - Measure with `?bench=1` and `?gputime=1` per view.

**Input assignment:**

- **Gamepads.**
  - `gamepadconnected` only fires after a button press if the pad was already connected.
    Firefox hides pads until one is used.
  - `index` is unique per connected device and indexes into `navigator.getGamepads()`, but can be
    reused after a disconnect.
  - `id` is just a name string, identical for two identical pads.
  - Poll `getGamepads()` every frame; don't hold the objects.

  Source: [MDN Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
  (modified 2026-04-13). So: "Press **A** / Enter to join". The first input from a source claims
  the next free slot, bound by `index`. On disconnect, pause with "P2: press a button on your
  controller".
- **Keyboard+mouse.** Only one KB+M player: browsers expose no per-device ids for keyboards or
  mice. That player gets pointer lock (needs a user gesture; Esc exits). A gamepad player never
  needs pointer lock. Two-pad play has no pointer lock at all, so make sure the cursor auto-hides.
- **Focus.** Gamepad and keyboard input stop when the page loses focus. Pause both players on
  `blur` in split screen.

---

## 6. Testing

- **BroadcastChannel transport.** Use two `page`s from **one** `browser.newContext()`; they share
  origin and storage, so BroadcastChannel delivers between them. Separate contexts are isolated
  profiles, so it won't cross them. Fast and deterministic; use it for most co-op tests.
- **Real WebRTC.**
  - Use `chromium.launch({ args: [...] })` with:
    - `--disable-background-timer-throttling`
    - `--disable-renderer-backgrounding`
    - `--disable-backgrounding-occluded-windows`
  - Create two contexts. The test harness does the signalling: `pageA.evaluate(makeOffer)` →
    `pageB.evaluate(acceptOffer, offer)` → `pageA.evaluate(acceptAnswer, answer)`. No broker and
    no network.
  - No media flags are needed for data channels. `--use-fake-ui-for-media-stream` is only for
    getUserMedia ([webrtc.org testing](https://webrtc.github.io/webrtc-org/testing)).
  - Host candidates are mDNS-obfuscated (`*.local`). Within one browser instance they should
    resolve. If ICE fails in CI, add `--disable-features=WebRtcHideLocalIpsWithMdns`
    **[unverified flag name]**.
  - Keep one real-WebRTC smoke test (connect; both channels open; one snapshot round-trip; channel
    ids don't collide with Trystero's). Run everything else over the conditioned BroadcastChannel
    or loopback transport.
- **Link conditioner** (`src/net/transport/conditioned.js`): wraps any transport, per direction
  and per channel, with:
  - `latencyMs`, `jitterMs` (normal, clamped ≥0)
  - `loss`, `duplicate`, `reorder` — **only** on the unreliable `state` channel; `ctl` gets
    delay and jitter but stays ordered, holding later messages behind earlier ones
  - a seeded RNG and an injectable clock

  Presets: `lan (5±1, 0%)`, `good (40±10, 0.5%)`, `bad (150±50, 5%)`, `awful (300±120, 15%)`.
- **Invariants to assert:**
  - **After quiesce** (no messages in flight for 1 s): equal enemy id sets; equal `hp`, `alive`
    and `state` for each; equal story step and flags, mission id, crime states and pickup sets;
    enemy positions within 0.25 m; each hero's position on the other machine within 0.3 m.
  - **Always:** zero enemies spawned by the guest; zero story transitions originated by the
    guest; each `hitClaim` accepted exactly once (no double KO under `duplicate`); damage sum on
    the host equals the accepted claims.
  - **Robustness:**
    - A defence report arriving after the timeout is ignored.
    - Version mismatch: the connection is refused with the right message.
    - Disconnect then reconnect within 60 s: the guest resumes the same slot, and the invariants
      hold.
    - Host `hostAway` (stub `document.visibilityState`): the guest pauses.
    - Fuzz: 10k random byte buffers fed to the decoders produce no exceptions escaping the
      handler and no state change.
  - **Split screen:** both views render (no black view). P1 opening the gadget wheel does not
    change P2's hero speed. Pixel checks per view rect.

---

## 7. Security and abuse (friends-only P2P)

- **Handshake.** The first `ctl` message carries `{proto, build, contentHash, sessionToken?}`.
  `contentHash` covers the roster, regions and enemy tables. The host refuses on any mismatch.
  Until the handshake passes, every other message is dropped.
- **Role whitelist.** The guest may send only `heroState`, `hitClaim`, `defence`, `lockReq`,
  `pickupReq`, `ping` and lobby/chat. Any spawn, story, crime, clock or weather message from the
  guest is dropped and counted.
- **Validation.**
  - Every number must be finite and in range.
  - Ids must exist.
  - Hero speed ≤ kit max × 1.5, or the host sends `heroCorrect`.
  - `hitClaim` is rate-limited to the move set's max attack rate × 1.5.
  - Messages over 64 KiB are dropped.
  - Decode inside `try` and drop malformed input.
  - Chat is rendered with `textContent` only.
- **Story state** comes only from the host. The guest never writes story steps to its own save
  from replicated state (see the save-design question in §4).
- **Room access.** Trystero `password` = room code, so strangers on the public relays can't
  decrypt the offer. `maxUsers: 2`. The host can kick, which closes the peer connection. Room codes
  expire when the host leaves the lobby.
- **Privacy.** Direct WebRTC reveals each player's public IP to the other. Say so in the co-op
  menu ("only play with people you trust"). TURN relay mode, when configured, hides it.

---

## Things in the design doc I would change (summary)

1. §3 and §4.4 say "public PeerJS broker". Use Trystero (Nostr) instead, optionally racing a
   second strategy. PeerJS cloud has a recent, open multi-minute-delay issue and no SLA.
2. §4.4 says nothing about channel types. Specify two negotiated channels, one reliable ordered
   and one unordered with zero retransmits. Without that, snapshots on a reliable channel
   head-of-line block events and every lost packet stalls everything.
3. §4.1 and §4.4 miss **global time scaling** (hit-stop, slow-mo, wheel hold). It breaks both
   split screen and online and needs a contract change before workstream B builds `fighter`.
4. "Sends hit claims the host validates" covers offence only. Defence (counters and dodges) must
   be resolved by the defender with host acceptance, or the guest's counter windows shrink by the
   RTT.
5. §4.4 needs a hidden-host policy. A minimised or covered host tab stops rAF and freezes the
   world for the guest.
6. "Shared story progress" needs a save rule for the guest's own save.
7. The manual copy-paste fallback has a hard ~10–15 s window for the answer, which must be
   designed into the UX.
