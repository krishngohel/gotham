# Combat: why it is not smooth today

Findings from a read of the code before the overhaul (not yet verified by running). Workstream I
owns fixing these; verify each with `scripts/anim-audit.mjs` and the combat harness test before and
after. Line numbers are as of commit c92c65c.

1. **Reach table drops mocap data for Punch_Jab, Punch_Cross, Melee_Hook.** The `PUNCHES` loop in
   `src/combat/reach.js:23-49` has no `if (table[name]) continue` (the STRIKE_BEATS loop at 54
   does). These three get a re-sampled contact time and `root: null`, while `MOCAP_START` /
   `MOCAP_SPEED` still apply and chain timelines use the MOCAP_DATA contact
   (`chainTimeline.js:98`). Two contact frames for one clip; the in-clip step is never applied, so
   the body slides. `clipImpact` may clamp to 0.03 s (`combatSystem.js:252`) → hit before swing.
2. **Instant facing snaps.** `hero.bat.face(ap.yaw)` at strike start (`combatSystem.js:375`) and
   again at impactAt+0.06 (394); also counter 447, special 576, airKick 612, dodge 547, batarang
   513, throw 693/713. `ch.face` has no smoothing (`characters.js:91`).
3. **Early cancels cut follow-through.** Next strike can start 40 ms after contact (384) with a
   0.08 s fade into a clip that begins mid-wind-up (`startAt`, 378). Strikes end at impactAt +
   0.22–0.45 while the clip is still recovering.
4. **Large `MOCAP_START` skips** (`src/config/mocap.js:24-32`), e.g. RunUppercut 0.62, Smash_Leap
   0.85, Elbow_Strike 0.38, Kick_Round 0.5, blended in 0.08–0.1 s → pops.
5. **Lunges do not match the animation.** Quick lunge peaks at twice average speed (284); long
   lunge 20 m/s (30 for counters, 443) under `Sprint_Loop` at 1.3× (379) → foot slide. Root-motion
   scale `k < 1` and drift tracking (286-298) add slide. Delayed swing starts up to a frame late.
6. **Hit timing is a timer, not an animation event.** Air kicks clamp clip speed 0.7–2.5 (618);
   flight is a straight lerp with no arc (626).
7. **Enemy reactions cut short and not directional.** Reactions are 1.2–1.63 s clips; the goon
   leaves 'hit' after 0.5 s (`enemy.js:550`). Reaction/KO clips ignore hit direction; the goon is
   never turned toward the attacker. A launched goon plays a standing flinch in the air (351-354).
8. **Enemy attacks.** Wind-up walks at 2.2 m/s under a strike clip (490); the attack lunge closes
   1.5–4 m in 0.16 s (538-540); `strikeFire` clamps speed-up to 3× so contact can arrive after the
   0.17 s damage tick; damage uses pre-lunge distance (420, 543). Harley and the brute fallback
   reuse sword clips at 0.22× (268, 292-296).
9. **Hero reactions.** `stagger('Hit_Chest'|'Hit_Head', 0.38)` (796) cuts a 1.2–1.6 s clip; hero is
   not turned to the attacker.
10. **Clips that do not fit the action.** Cape stun plays `Sword_Regular_B` (485); grab/throw plays
    `Sword_Heavy_Combo` (697-710); ground hammer falls back to `Sword_Attack` (357); dodge plays
    `Roll` at 1.5× while code moves the root 4.5 m in 0.42 s (548-563).
11. **Velocity carry-over.** Strikes do not zero `hero.vel` (`hero.js:182-183`).
12. **Nightwing timing.** His hit lands at a fixed 0.22 s (`src/allies/nightwing.js:216`) while his
    clips reach contact at ~0.25/0.31/0.40 s; no reach or lunge logic.

Structural causes: there is no animation state machine or event track (callers pick clips
imperatively and time hits on control timers); no upper/lower body layering; no foot IK in fights;
no turn smoothing.

## How to fix (from research)

`docs/design/research/combat-animation-assets.md` is authoritative for workstream I. In order:
fix finding 1 first (one missing `continue`); bake per-clip event tracks (`warpStart`, `contact`,
`cancel`, `recover`, `end`, `foot*`) and fire hits from the clip reaching `contact`; directional
reactions held until `recover`; motion warping instead of `face()` snaps plus a separate lunge;
dead-blending (inertialization) as a post-pass after `mixer.update`; per-actor hit-stop.

Correction to finding 3: early cancels are essential to freeflow and must stay. The fault is the
blend and the missing cancel event, not the cancel itself — do not fix it by making strikes play
out longer. Add to the structural causes: hit-stop is global (`time.hitStop` freezes the world).
