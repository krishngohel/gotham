# Workstream I (combat and enemies): proof shots and measurements

Branch `ln2/combat`. Images in this folder were made with `scripts/combat-shots.mjs` against the
dev server (`node scripts/combat-shots.mjs http://localhost:5420/ docs/design/shots/combat <scratch>`).

| file | what it shows |
|---|---|
| `freeflow-10hit-film.jpg` | a freeflow chain against a ring of goons, two frames per blow (~110 ms apart), fixed side camera |
| `contact-strikes-and-reactions.jpg` | strikes on their contact frame (hit-stop stretched to 0.5 s) and the goon's directional reaction 0.65 s later: front heavy kick, left hook, right kick, back strike, shield block, brute armour flinch, KO, counter tell and contact, cape swirl stun |
| `roles-lineup-and-fight.jpg` | the eight new roles (shield, baton, knife, heavy, ninja, medic, pistol, lieutenant) in gang colours, then eight frames of them fighting (god mode) |

## anim-audit (`node scripts/anim-audit.mjs <url> <out> all`)

Same machine, same script, bone events only (WORLD teleports excluded). "Before" is commit
1508005 (the branch base) served from a detached copy; "after" is this branch's head.

| | events > 0.25 m | > 0.5 m | > 1 m |
|---|---|---|---|
| before (1508005) | 73 | 20 | 8 |
| after reach.js fix only (stage 1) | 69 | 19 | 10 |
| after (head) | 77 | 28 | 14 |

By scenario group (> 0.25 m, before -> after): scripted moves 32 -> 17 (hero 20 -> 4, goons 12 -> 13);
random fight 9 -> 27 (hero 9 -> 24: travel strikes, the new ground pound and dash transitions);
traversal 18 -> 19; extras 14 -> 14. The largest single entry in both runs is
`trav: sprint + stop | Sprint_Loop > Interact` (5.97 m): the Batsignal comic page posing the hero
for its panel, not a gameplay transition. The target (> 0.25 m down 80 % from 76) was **not** met.
