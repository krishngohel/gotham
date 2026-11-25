# Combat smoothness, second pass (workstream I2, `[anim2]`)

Contact sheets filmed on the virtual clock (`scripts/anim-film2.mjs`): `before/` is long-night-2
at f84225a, `after/` is ln2/anim2. Same scene, same seed, same frames in both.

| sheet | what to look at |
|---|---|
| `launch-fall-getup` | Before: the launched goon flips, lands face down, starts KD_Launch's own crawl up, then snaps to sitting (GetUp_Back from the wrong side). After: blown back (KD_FlyBack, timed to the flight), lands on his back, lies, gets up from that same pose. |
| `throw-paired` | Before: goon held at arm's length on a stand-in clip, no contact. After: Throw_Shoulder + Thrown_Shoulder on one clock, the goon goes over the shoulder, then flies where the stick aimed. |
| `beating` | Four quick punches on one goon: after, the 2nd and 3rd land as flinches on the reaction already playing (one beating), the 4th a fresh reaction blended from where he is. |
| `chain10` | Ten presses in rhythm (each as soon as the move can chain): 10 of 10 land before and after. Pressed on a fixed 0.3 s beat instead, both builds land 9: a travel strike outlasts the beat and two presses merge. |
| `seeded-fight` | Wave 1 of the audit's seeded fight. |
| `shield-bash-blocked`, `baton-cape-disarm`, `brute-charge-dodge`, `ninja-counter-counter`, `medic-revive-interrupted` | Each role's signature exchange (baton: weapon dropped; medic: revive interrupted). The brute sheet is framed wide; the charge is in the last third. |

`audit-before.txt` / `audit-after.txt`: `scripts/anim-audit.mjs` (all scenarios) on the same two
builds. Bone pops > 0.25 / 0.5 / 1 m: **347 / 99 / 24 before, 45 / 0 / 0 after** (-87%, none over
0.5 m). Staged frames (comics, cinematics) and teleports are excluded; the metric is world
offsets from the root (a facing snap counts).
