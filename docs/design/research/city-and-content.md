# City and content research: Chicago bones, Gotham skin

Research reference for workstreams **H** (the city), **J** (story, villains, crimes), **K** (double life),
**L** (skill tree, minimap/GPS) and **M** (street life). Read with `docs/design/long-night-2.md`
(sections 4.2, 6 and 7). Axes as in `src/world/mapData.js`: **x east, z south (north is −z), y up,
metres**. The core city (`region core`) spans x ±236, z −236..205, with the harbour south of z 205.

Factual claims about Chicago and about published Batman material carry source links (section 10).
Everything marked *game value* is a recommendation, not a fact. Every name, landmark design, line
of dialogue and scenario here is original to this project unless it is a DC character name.

---

## 0. One-page summary

**Scale rule: compress the plan, keep the people at 1:1.** A real Chicago block is 660 × 330 ft
(201 × 101 m) and the elevated Loop is 2.88 km around. At real scale, four times the core city holds
about five Chicago blocks. So shrink *distances* by about 0.3 (the El circuit becomes 840 m),
shrink *heights* by about 0.45 (the 442 m Willis Tower becomes a 190 m Wayne Tower), and keep
*human-scale things* at real size: 4.9 m alleys, 4–5 m deck clearances, El bents every 12 m, 1.1 m
railings, doors, stairs. That keeps traversal and combat readable while the skyline still feels
huge.

**Blocks.** The core uses a 60 m pitch (46 m blocks, 14 m streets). New regions keep that **60 m
phase on the x and z lines that come out of the core**, so streets carry straight on across the
bridges. Residential and industrial districts use Chicago's **2:1 block (120 × 60 m pitch) with
a 5 m alley along the long axis**. The Loop keeps near-square 60 m blocks with no alleys, served by
the lower level instead, which is how the real Loop works too.

**Layout** (table below, section 3). The river runs east–west along the core's north edge and forks
at a T on its west side, with a Wolf Point analogue on the west bank. North of the river: Lower
Gotham (a double-deck riverside drive) and the Loop with its El rectangle and Wayne Tower in the
middle. Then Gotham Mile, with Bristol and Wayne Manor in wooded hills to the north-west. East is
the Lakefront strip: Robinson Park, Lakeshore Drive, the Amusement Mile pier with its Ferris
wheel, and the Museum Campus where the harbour meets the lake. Arkham Island sits out in the lake
at the end of a causeway. West, across the river branches: the Narrows (an island, modelled on
Goose Island), Park Row and Crime Alley, Chinatown and Little Odessa, and the Yards
(stockyards, rail, grain elevators, steelworks) running down to the harbour. Total land is about
0.92 km², about 4.2 × a 470 m square, of which Bristol is low-density woodland.

**The El is the spine.** It runs a Loop rectangle plus one West Line out through the Narrows, Park
Row, Chinatown and the Yards. That is one rideable moving platform through five districts.

**Crimes.** Replace "three kinds, always beat everyone" with a **crime grammar**: objective ×
twist × place × escalation (section 5). There are 26 crime types, district gangs, a per-district
heat level, and ambient non-combat events. Co-op scales by *splitting the objective*, not by
adding health.

**Campaign.** The current story stays intact as **Night One**. Acts II–V cover seven more nights
and days, with 10 villains, each fight testing a different skill: Two-Face counters, Penguin
gadgets, Scarecrow stealth, Riddler detective work, Firefly vehicles, Killer Croc endurance, the
Tweedles as a co-op dual boss, Mr. Freeze environment, Poison Ivy crowd control, and Black Mask
gang war. The Joker finale is on Arkham Island. **Pacing rule: no stop-and-listen radio step on
its own.** Dialogue plays over travel and the next marker appears with the first line.

**Double life.** Use one week calendar with **appointments**, plus three resources: **Standing**
(Wayne), **City** (per-district safety) and **Fatigue** (shared). Add **Suspicion** with
remembered excuses. Section 7 has 15 collision scenarios.

**Skill tree.** Keep the 20 existing WayneTech upgrade ids as the first nodes, so saves still load,
and grow to 56 nodes in 5 branches. One branch, Wayne, is bought with Standing rather than XP.
Hero kits swap one branch.

**Minimap.** North-up by default with rotation as an option. Altitude bands. Route drawn on roads
when driving; when gliding, a ribbon in the air plus "climb here" perches. Raised bridges and El
stations are shown live.

**Changes I would make to `long-night-2.md`:**
1. **§6 monorail spur → El West Line.** One rail system, one model set, one moving-platform
   system. That is cheaper and more Chicago.
2. **§6 Iceberg Lounge**: the core already has an `ICEBERG` neon sign in Neon Row
   (`mapData.js`, x 180, z 115). Keep that as Penguin's old dive bar and put the new Lounge on
   Gotham Mile. Story text can use the move ("he's gone uptown").
3. **§6 add three things**: river locks (the river sits about 5.4 m below the harbour and lake, so
   locks are needed and make a set piece), Blackgate on an islet in the harbour, and a downtown
   Batcave satellite. Bristol is about 800 m from the core, so the player needs a second way in.
4. **§6 add a scale rule** (above) to the brief, so every builder compresses the same way.
5. **§7 "neither bar can be maxed"**: make it a soft cap with diminishing returns, not a hard
   ceiling. Add **Fatigue** as the third resource that links the two lives. Never let the
   Wayne side block the main story; it should only bend it.
6. **§5 J**: merge stand-alone `radio` steps into the travel step that follows. The current story
   has five (`gordonRadio`, `alfredRadio`, `aceClueRadio`, `harleyRadio`, `rescueGuestsRadio`)
   and they cause most of the "choppy" feel.

### Proposed district map

Rectangles are approximate (±10 m is fine). Water is listed but not counted as land.

| # | Region id | District | x min | x max | z min | z max | Size (m) | Land (m²) |
|---|-----------|----------|------:|------:|------:|------:|----------|----------:|
| 0 | `core` | Old Gotham (unchanged) | −236 | 236 | −236 | 205 | 472 × 441 | 208,200 |
| 1 | `river` | Main stem (water) | −266 | 366 | −276 | −236 | 632 × 40 | — |
| 1 | `river` | North/South Branch (water) | −300 | −266 | −600 | 205 | 34 × 805 | — |
| 1 | `quay` | South Branch quay (rail spur, dock walk) | −266 | −236 | −236 | 205 | 30 × 441 | 13,200 |
| 2 | `lowerGotham` | Lower Gotham double deck + riverwalk | −266 | 366 | −306 | −276 | 632 × 30 | 19,000 |
| 3 | `loop` | The Loop | −266 | 236 | −600 | −306 | 502 × 294 | 147,600 |
| 4 | `mile` | Gotham Mile | −40 | 236 | −780 | −600 | 276 × 180 | 49,700 |
| 5 | `lakefront` | Robinson Park + Lakeshore Drive | 236 | 366 | −780 | 80 | 130 × 820 (less river) | 106,600 |
| 6 | `museum` | Museum Campus + Planetarium Point | 236 | 366 | 80 | 300 | 130 × 125 + point | 23,000 |
| 7 | `pier` | Amusement Mile pier | 366 | 626 | −470 | −430 | 260 × 40 | 10,400 |
| 8 | `narrows` | The Narrows (island) | −430 | −300 | −600 | −236 | 130 × 364 | 47,300 |
| — | `river` | Narrows Cut canal (water) | −450 | −430 | −600 | −236 | 20 × 364 | — |
| 9 | `parkRow` | Park Row / Crime Alley | −580 | −450 | −600 | −226 | 130 × 374 | 48,600 |
| 10 | `chinatown` | Chinatown + Little Odessa | −580 | −300 | −226 | −30 | 280 × 196 | 54,900 |
| 11 | `yards` | The Yards | −580 | −300 | −30 | 205 | 280 × 235 | 65,800 |
| 12 | `bristol` | Bristol hills, Wayne Manor | −580 | −40 | −780 | −600 | 540 × 180 | 97,200 |
| 13 | `arkham` | Arkham Island (causeway at z −80) | 560 | 740 | −160 | 0 | 180 × 160 | 28,800 |
| | | **Total land** | | | | | | **≈ 920,000** |

---

## 1. Chicago's urban form, for a procedural builder

### 1.1 Street grid and alleys

| Fact (real) | Value | Game value |
|---|---|---|
| Standard block | 660 × 330 ft = 201 × 101 m, measured street centre to street centre [S1][S2] | 120 × 60 m pitch (106 × 46 m block + 14 m street) |
| Blocks per mile | 8 one way; ordinances asked for 8 to the mile one way and 16 the other [S1] | Every 4th line (240 m) is an arterial; every 8th (480 m) is a boulevard |
| Half-mile | Every 4 blocks is a "major secondary street" [S1] | Arterials carry traffic, crime spawns and bus stops |
| Residential street right-of-way | 66 ft (20 m), the length of a surveyor's chain [S2] | 14 m (matches core) |
| Alleys | Minimum 16 ft (4.9 m) behind all lots in new subdivisions; many are 16–20 ft [S2] | **5 m, true scale**, along the long axis of every residential and industrial block |
| Lot | Typical 25 × 125 ft (7.6 × 38 m) [S9] | 7.5 m frontage × 21 m depth (half the block) |
| Address origin | State St (E/W) × Madison St (N/S) [S1] | Use the origin crossing for "Gotham's zero": the street through Wayne Tower's block |
| Diagonals | Old trails such as Lincoln, Clark, Milwaukee, Ogden and Archer cut the grid [S1] | One diagonal per outer district (see 3.3); it creates triangle blocks and flatiron buildings |

**Why alleys matter for the game.** Chicago puts garbage, garages, utility poles, back stairs and
deliveries in the alley, so streets have unbroken frontages and alleys are service canyons. That
gives two street types per block. The **street** is lit, has traffic, civilians, storefronts and
crimes in view. The **alley** is unlit except for garage lamps, has dumpsters, wooden back porches
(Chicago's stacked rear porches), wires, fences, and is good for stealth and ambushes. In the
generator: each 120 × 60 m block is two rows of 7.5 m-wide lots, with an alley 5 m wide down the
middle on the long axis, crossing open at both short ends.

### 1.2 The Loop and the elevated "L"

| Fact (real) | Value | Game value |
|---|---|---|
| Loop circuit | 1.79 mi (2.88 km), a rectangle on Lake St (N), Wabash (E), Van Buren (S), Wells (W); opened 6 Sep 1897 [S3] | Rectangle x −90..90, z −330..−570: 180 × 240 m, 840 m around |
| Tracks | 2, standard gauge, third rail 600 V DC, 90 ft (27 m) minimum curve radius [S3] | 2 tracks, 9 m-wide deck, corners as 90° turns with a 12 m radius |
| Structure | Riveted steel plates and angles; columns and bents at 30–50 ft (9–15 m) along running sections [S4] | Bents every **12 m**, columns at the curb line, cross girders over the street |
| Stations | 8 today, 12 originally [S3] | 4 on the rectangle (one per side) and 4 on the West Line |
| Height | Not stated in the sources found; deck is usually above typical truck clearance (14 ft 6 in posting threshold [S5]) | Deck underside **y 5.5**, rail top **y 7.5**; trains are 3.4 m tall, so the train roof is at y ≈ 11 |

**The look to build.** Under the El the street is striped with shadow and slits of light, rivets
and lattice bracing show, and wooden platform canopies sit up in the air. Stairs at platform ends
come straight down onto the sidewalk. When a train passes, everything rumbles. Ride the train
roof: trains are 4 cars of 15 m, run every 75–90 s, and move at 12 m/s, slowing to 6 m/s through
stations. The rider can jump off at any station roof or onto the bents.

### 1.3 The river, the fork and bascule bridges

| Fact (real) | Value | Game value |
|---|---|---|
| Main stem | Runs 1.5 mi (2.4 km) west from the lake; joins the North Branch at **Wolf Point**, the river continues as the South Branch [S6] | Main stem 632 m long; T fork at x −283 |
| Width | 1803 description: about 30 yd (27 m) wide [S6]; channel later rebuilt with walls | **30 m water + 5 m walls** each side |
| Depth downtown | 20–26 ft [S7] | Water surface y −6.0; deep enough that the Batmobile sinks (keep it out) |
| Movable bridges | 38 today, down from a peak of 52 [S6] | 5 road bascules on the main stem, 4 on the South Branch, 3 on the North Branch, 1 raised rail bascule |
| Bascule design | "Chicago-type" fixed-trunnion double-leaf bascule; Michigan Ave bridge (1920) is double-leaf and double-deck, with bridge-tender houses [S8] | Two 17 m leaves, counterweight pits, a stone **bridgehouse** at each of the 4 corners |
| Riverwalk | 1.25 mi, built out 20 ft under bridges and 25 ft between them, 50 ft at the confluence; below street level on the south bank [S7] | 6–8 m wide walk at y −4.5 on the Loop bank, widening to 15 m at the fork |
| River dye | Dyed green each March since 1961 [S6] | A seasonal event: the Riddler or Ivy dyes it, as a crime or a joke |

**Bridge placement** (game value). Main stem bridges sit on core x lines: **−210, −150, −30, 90,
210**, plus Lakeshore Drive at x 330. The x −150 bridge lines up with the Exchange canyon (3.2).
A disused **rail bascule held permanently raised** at x −90 is a perch and a story set piece. A
real one is held raised at Kinzie Street. South Branch bridges at z −150, −30, 90, 150. North
Branch bridges at z −330, −450 (road + El lift span) and −570.

**Bridge behaviour.** The leaves lift on a schedule (boat traffic, ~1 lift per 4 min per bridge,
staggered) and when the story needs it. A raised leaf is a 70° ramp: you can jump it in the
Batmobile at a dramatic, low-traffic moment, grapple from it, or perch on the tip. Chases use
"bridge going up" as a timed gate.

### 1.4 Multi-level streets (Wacker Drive)

| Fact (real) | Value | Game value |
|---|---|---|
| Levels | Upper (local streets), Lower (limited-access, service and trucks), Lower Lower (towing, impound, utilities, rail maintenance) [S10] | Upper y 0; Lower y −5.5 (4.2 m clearance); Lower-Lower y −10 (3.8 m), only x −60..60 |
| History | 1926 double-deck built on the 1909 Burnham plan; rebuilt 2001–02 with reproduction lighting and restored limestone [S10] | Upper deck: limestone balustrade, obelisk lamps on the river side |
| Use | Deliveries, waste, utility access; *The Dark Knight* chase was filmed on Lower Wacker [S10] | Loading docks under every Loop block, so it is a chase and ambush level, not a copy of any film scene |
| Lighting | City sodium fixtures (gold/green cast) being replaced by LED [S11] | Lower deck: **sodium-green** (#9fcf6a at 30%) strips on the column caps and pools every 12 m; Lower-Lower: red work lamps |

**Look.** Low concrete ceiling, square columns every 12 m in two rows, painted lane arrows,
jersey barriers, steam from grates, dock doors with yellow-black bumpers. Ramps up to the upper
deck at intervals. The river-side columns open onto the riverwalk and the water. That makes a
"wall" you can glide out of.

### 1.5 Michigan Avenue and the Magnificent Mile

About one mile (13 blocks) of Michigan Avenue from the river to Oak Street. It was joined to South
Michigan by the 1920 double-deck bridge and named "Magnificent Mile" in 1947. The trees carry
over a million holiday lights [S12]. The 1869 **Water Tower** is a 182.5 ft (56 m) castellated
limestone tower, the only public building in the 1871 burn zone to survive [S13]. The
**Tribune Tower** (1925, 463 ft/141 m, 36 floors) has a neo-Gothic crown modelled on Rouen's
"Butter Tower", with buttresses lit at night and 149 stones from world sites set into its walls
[S14].

*Game:* Gotham Mile is a **boulevard 30 m wide** (two carriageways and a planted median of lit
trees) on x 150, z −600..−780. It has hotel towers 60–110 m tall, department-store podiums with
clocks, and canopies to perch on.

### 1.6 The lakefront

| Fact (real) | Value | Game value |
|---|---|---|
| Grant Park | 319 acres; Randolph to Roosevelt, Michigan Ave to the lake [S15] | Robinson Park, x 236..366 (130 m deep, 820 m long) |
| Museum Campus | 57-acre south-east addition: Field Museum, Shedd Aquarium, Adler Planetarium [S15] | x 236..366, z 80..205 plus a point into the harbour |
| Buckingham Fountain | 1927; bottom pool 280 ft (85 m) across; centre jet 150 ft (46 m); 8 seahorses (4 pairs); Beaux-Arts/Art Deco "wedding cake" [S16] | **Founders' Fountain**: 40 m pool, 3 tiers, 25 m jet on the hour |
| Lake Shore Drive | ~15.8 mi, up to 8 lanes, S-curve smoothed in 1996 [S17] | Lakeshore Drive, 4 lanes on x 340, S-curve at the river mouth |
| Navy Pier | 3,300 ft (1,010 m) long, opened 1916; Centennial Wheel 196 ft (60 m), 42 gondolas, 46 ft taller than the 150 ft wheel it replaced [S18] | Amusement Mile pier 260 × 40 m; **wheel 52 m**, 24 gondolas, slowly turning (a moving grapple ring) |

### 1.7 Neighbourhood typologies

| Type | Real description | Builder recipe (game value) |
|---|---|---|
| **Greystone** two- and three-flat | Bedford (Indiana) limestone front, stacked flats, long narrow plan for 25 × 125 ft lots; 30,000+ in the city [S9] | 7.5 m wide, 2–3 floors (10–13 m), pale grey stone front, round or square bay, steep stoop, brick sides and back with stacked wooden porches |
| **Brick two-flat** | 1910s–20s, cheaper brick with limestone accents [S9] | As above, red/brown brick, flat roof, parapet with a limestone band |
| **Courtyard apartment** | U, L, S or M shapes, matured in the 1910s–20s [S19] | Corner lots, 3 floors, U around a 14 × 20 m garden court facing the street, entrances off the court |
| **Workers' cottage** | 1–1.5 storey frame house, often lifted on a raised basement after the street-raising era (common knowledge; no single source found) | 6 × 12 m, gable to street, high stoop, clapboard; good low cover in the Yards and Park Row |
| **Bungalow** | About 100,000 built in the 1920s boom [S19] | Bristol fringe and Chinatown back streets: brick, hipped roof, bay front |
| **Corner tavern** | Two-storey brick tavern with flat above, signage on the corner (typology, no source cited) | Every block corner with a lit sign gives one ambient barks spot |
| **Rooftop water tanks** | Wooden tanks are a stronger **New York** signature; Chicago has fewer | Use them (Gotham is NYC + Chicago) but cap at 1 in 4 roofs, more in the Narrows |
| **Fire escapes** | Both cities | Front fire escapes in the Narrows and Park Row (the Gotham read); back porches in greystone blocks (the Chicago read) |

### 1.8 Industrial south and west

- **Union Stock Yard Gate** (1879, Burnham & Root): limestone. The main arch is 16 ft wide and
  17 ft high, the whole gate 32 ft tall, with a carved steer's head ("Sherman") over the centre
  arch. The yards covered "several hundred acres" [S20]. *Game:* the **Yards Gate** has a 5 m arch,
  10 m overall, with an original carved bull with one horn broken off. It is the district entry.
- **Rail yards**: fan-shaped track throats, roundhouse, signal gantries, rows of boxcars as stealth
  cover, and a hump yard. Trains move here too, so boxcar roofs are moving cover.
- **Grain elevators**: rows of concrete silos 30–40 m tall with a headhouse above, on the river
  bank. Huge clean verticals to climb, perch on and glide from.
- **Steelworks**: blast furnace, ore bridge cranes, slag pits glowing orange. It is the warmest
  colour in a cold city.
- **Chinatown Gate**: completed 1975 over Wentworth Ave at Cermak Rd, dedicated 7 Nov 1975; the
  characters are read as "everything under heaven belongs to the people" [S21]. *Game:* an
  original paifang gate with its own inscription chosen with a native speaker, green tile roof,
  red columns, gold sign.

### 1.9 Architectural vocabulary by era

| Era | Chicago example (fact) | What to model (game) |
|---|---|---|
| Chicago School 1880s–1900s | Steel frame, terracotta cladding, base–shaft–capital; **Chicago window** = big fixed centre pane between two double-hung sashes, often in projecting bays; Reliance, Monadnock, Rookery, Carson Pirie Scott [S22] | 12–16 floors, white or buff terracotta, wide 3-part windows in vertical bays, a heavy cornice. Grapple ledge every floor at the window head |
| Art deco setbacks 1920s–30s | **Board of Trade** 1930, 604 ft (184 m), 44 floors, setbacks to light narrow streets, 31 ft Ceres statue, closes the LaSalle St "canyon" [S23]. **Carbide & Carbon** 1929, 503 ft, black granite base, dark-green terracotta, gold leaf crown [S24] | Wedding-cake setbacks every 15–20 m, floodlit from below at night, a statue or finial on top. **Palette jewel**: black + bottle-green + gold |
| Neo-Gothic | **Tribune Tower** 1925, Rouen-style crown with buttresses [S14] | Pointed arches, buttressed crown, gargoyles; it bridges the cathedral in the core and the downtown towers |
| Mid-century | **Marina City** 1963–68, two 65-storey 587 ft round towers, bottom 19 floors are an exposed spiral car park, semicircular balconies, 32 ft core [S25] | "The Corncobs": 2 round 95 m towers on the river bank; the spiral parking ramp is a chase route and the balcony scallops are perfect grapple rings |
| International Style | Black steel and glass boxes on open plazas (Mies van der Rohe era; IBM Building at 330 N Wabash was Wayne Enterprises' boardroom in *The Dark Knight* [S26]) | Black boxes with dark glass and bronze I-beam mullions. Flat roofs with no gargoyles; Gotham's coldest buildings |
| Bundled tube | **Willis Tower**: 1,451 ft (442 m), nine 75 ft square tubes in a 3 × 3, setbacks at floors 50, 66, 90; black aluminium and bronze glass; 4 ft glass "Ledge" boxes at floor 103 [S27] | Not for Wayne Tower (too recognisable). Use the stepped-tube idea on one 140 m black tower in the Loop's west side |

### 1.10 Signature street furniture and sights (for dressing)

- El stairs, wooden platform canopies, and blue station sign bands (our own design; no transit
  logos).
- Bridgehouses at each bascule bridge corner, with brass control panel windows.
- Double-globe ornamental lamp posts on bridges and the Mile; plain cobra-head lights in the
  neighbourhoods.
- Viaducts with posted clearance signs on rail embankments in the Yards and Park Row (real: posted
  where below 14 ft 6 in [S5]).
- Hot dog stands (a "no ketchup" joke, see section 7), alley garages, blue recycling carts, salt
  piles in winter, steam from grates, river tour boats, plaza sculptures (original abstract steel
  pieces in red, after the Federal Plaza tradition, not copies).

---

## 2. Gotham's visual identity and how to fuse it with Chicago

### 2.1 What makes Gotham read as Gotham

| Source | What it gives us |
|---|---|
| Comics | Dennis O'Neil: "Manhattan below 14th Street at eleven minutes past midnight on the coldest night in November" [S28]. Neal Adams cited Chicago for its alleys [S28]. Named districts (Narrows, Park Row/Crime Alley, Bowery, Burnley, Otisburg, Robinson Park, Diamond District, Amusement Mile, Bristol) come from comics and games [S29] |
| 1989 film | Anton Furst: "the worst aspects of New York City"; Tim Burton: "hell burst through the pavement and grew"; Hugh Ferriss's renderings [S28] |
| *Batman Returns* | Overbuilt 1930s World's Fair architecture that blocks the light [S28] |
| *Batman: The Animated Series* | "Dark Deco"; backgrounds painted light-on-black-paper; police blimps; red skies [S30]. Paul Dini: "what if the 1939 World's Fair had gone on another 60 years" [S28] |
| Nolan films | Shot in Chicago: Board of Trade as Wayne Enterprises (*Begins*), a Lower Wacker chase, the IBM building (*The Dark Knight*) [S10][S26]; the Narrows based on Kowloon Walled City [S28] |
| *Gotham* (TV) | 1920s plus *Blade Runner* textures; "antiquated rather than high-tech" [S28] |
| Games | Arkham and *Gotham Knights* build islands and districts with bridges; Old Gotham vs central business district [S28][S29] |

**Shared visual grammar:** gothic verticality (spires, buttresses, gargoyles on deco towers);
perpetual overcast with lit cloud bases; searchlight beams; police blimps; elevated trains; wet
streets; steam; narrow streets with tall buildings; neon in the slums and floodlit crowns in the
money districts; a cathedral; a prison on an island; one big family name on the tallest tower.

### 2.2 How earlier versions blended real cities

Every major Gotham is a composite: New York for density and street life, Chicago for the El,
alleys, multi-level streets and deco towers, and European gothic for spires and gargoyles. The
Nolan films turned plain Chicago into Gotham by *subtraction and lighting*: very little was
built, the existing grid, El and lower levels were lit coldly, and the sky was kept overcast. The
animated series went the other way, *by addition*: stylised deco silhouettes and blimps. Our ink
look sits nearer the animated approach, so we can exaggerate silhouettes.

### 2.3 Fusion rules: "Gotham built on Chicago's bones"

1. **Plan from Chicago, silhouette from Gotham.** Grid, alleys, river, El, lakefront and bridges
   follow Chicago logic exactly. Gotham shows up above the 6th floor: crowns, spires, gargoyles,
   searchlights, water tanks, blimp masts.
2. **Proportions.** Loop streets 14 m wide with 60–120 m walls give a 1:5–1:8 canyon (real
   LaSalle is roughly 1:6). Neighbourhoods stay low (10–15 m) and wide, so the towers read from
   everywhere. Every district has **one silhouette visible from 400 m** (table 3.2).
3. **Gargoyle rule.** Gargoyles go only on pre-1940 masonry: gothic, deco and Chicago School
   cornices. Never on black boxes. That way the old city is visibly watching the new one.
4. **Palette.** Each district gets one dominant hue plus ink and the shared sodium orange. The
   warm/cool split separates money (cool white, green-gold floodlight) from street (sodium and
   neon). See 3.2.
5. **Signage.** Chicago's blade signs, marquees and painted brick ads ("ghost signs") with our own
   brands. No real company names, no CTA or city logos. Puns in section 7.
6. **Landmark analogues: original designs only.** Each analogue keeps the *function and scale
   cue* of the Chicago original, not its form: a round twin-tower pair with a spiral car park,
   not Marina City's profile; a 3-tier fountain with bronze gargoyle-fish, not seahorses; a
   bull-head gate, not Sherman. Nothing is taken from any Batman film's or game's sets or maps
   (no Arkham-style map shapes, no film Wayne Tower).
7. **Sky.** Overcast, cloud bases lit from below (sodium orange over the slums, white over the
   Loop). A blimp patrol route over the Loop and Lakefront. Night-heavy clock (§4.5).

---

## 3. Proposed district map

### 3.1 Overview diagram (north up, so −z is up the page)

```
z -780 ┌──────────── BRISTOL (hills, Wayne Manor) ───────────┬── GOTHAM MILE ──┬ROBINSON┐
       │  x -580 ........................................ -40│ -40 ...... 236  │ PARK   │
z -600 ├──PARK ROW──┬cut┬─NARROWS─┬N.Br┬──────────── THE LOOP ────────────────┤ +LSD   │  lake
       │ Crime Alley│   │ (island)│    │  El rectangle x±90, z-330..-570      │        │──PIER (Amusement Mile)
       │            │   │         │    │  Wayne Tower (0,-450)                │        │   x366..626, z-450
z -306 │            │   │         │    ├──── LOWER GOTHAM (double deck) ──────┴────────┤
z -276 │            │   │  Wolf Pt│~~~~~~~~~~~~~~~ MAIN STEM (river) ~~~~~~~~~~~~~~~~~~~│ mouth+lock
z -236 ├─CHINATOWN + LITTLE ODESSA──┤S.Br│ q ├────── OLD GOTHAM (core, frozen) ────────┤        │   ARKHAM
       │                           │    │ u │  x ±236, z -236..205                    │ (park) │   ISLAND
z  -30 ├─────── THE YARDS ─────────┤    │ a │                                          │        │   x560..740
       │ stockyard gate, rail, silos│    │ y │                                          ├MUSEUM ─┤   z-160..0
z  205 └───────── steelworks ──────┴lock┴───┴──────────── HARBOUR ─────────────────────┴ CAMPUS ┘
        x -580                    -300  -236                                   236     366
```

### 3.2 District sheets

| District | Block pattern | Heights | Palette (dominant) | Landmarks you navigate by (original) | Traversal character | Gameplay purpose |
|---|---|---|---|---|---|---|
| **Old Gotham** (core) | 60 m pitch, existing | 9–64 m | existing | GCPD signal, clock tower, Ace stacks | existing | Night One story; tutorial ground |
| **The River + quay** | Channel, walls, 13 bridges | — | black water, sodium reflections | Raised rail bascule (x −90), bridgehouses, the **locks** at the harbour and lake mouths | Bridges lift (timed gates); grapple from the leaf tips; glide over water with no perches (the risk); tour boats as moving platforms | Chases, boat crimes, smuggling, Croc |
| **Lower Gotham** | Double deck along the river, 3 levels in the middle | Ceiling 4.2 m | sodium-green, concrete, yellow-black | Ramps, the impound pound on Lower-Lower | Fast flat driving with columns; on foot: lights to shoot out, dock doors, vents up into Loop lobbies | Car chases, ambushes, convoy hits, Croc's lair entrance |
| **The Loop** | 60 m square blocks, no alleys (service from Lower Gotham) | 40–120 m; Wayne Tower 190 m + 20 m mast | cool white floodlight, black glass, bottle-green + gold | **Wayne Tower** (0, −450) inside the El, deco + gothic crown and a lit "W" lantern; **Gotham Exchange** closing the x −150 canyon at z −570, 110 m with a 12 m bronze statue of Justice holding scales; **City Hall** (150, −420) with a dome; **Marquee Row** of theatres along z −570; **the Corncobs** (two round 95 m towers at x 180, z −330); a 140 m stepped black tower at (−210, −480) | **Canyon streets**, so you can grapple anywhere; the El as a moving platform; rooftop highways along setbacks; blimp mast on Wayne Tower | Main story hub, Riddler, Two-Face, sniper nests, bank jobs, hostage towers |
| **Gotham Mile** | Boulevard on x 150, 120 × 60 m blocks either side | 30–110 m | warm white, brass, holiday lights | **The Pumping Tower** (castellated 40 m stone water tower, original design) at (150, −700); **Iceberg Lounge** (a former cold-store reborn as an ice-blue club) at (60, −640); department-store clock | Canopies, lit trees, hotel flagpoles as perches; a broad avenue for glide runs | Penguin, Bruce Wayne public life (shopping, hotels, galas), robberies in progress |
| **Robinson Park + Lakeshore Drive** | Open park, diagonal paths, 4-lane drive at x 340 | Trees 10–15 m; conservatory 25 m | deep green, lamplight, lake-black | **Founders' Fountain** (295, −380); **the Mirror**, an original polished steel sculpture, a twisted ribbon not a bean (260, −560); glass **Conservatory** (300, −700) | Low cover, long sightlines, wind off the lake (glide drift) | Poison Ivy, festivals, open-ground fights, the Batmobile on LSD |
| **Amusement Mile pier** | Long pier 260 × 40 m | Wheel 52 m | carnival red/yellow, bulbs | **The Wheel**; funhouse; ballroom dome at the end | The turning wheel is a moving grapple ring; coaster track as a rail grind | Tweedles co-op boss, date scenario, carnival crimes |
| **Museum Campus + Planetarium Point** | 3 large buildings on lawns, a point into the harbour | 20–35 m | marble white, aquarium blue | Natural history hall (portico), **Aquarium** (octagonal dome), **Planetarium** on the point | Big domes for perching, colonnades | Mr. Freeze (aquarium cold plant), gala venue, heists |
| **The Narrows** | Island; irregular 40 × 30 m blocks, 3 m passages, bridges between roofs | 15–35 m, dense | sickly yellow-green, laundry colours, rust | **The Stack**, an overbuilt tenement tower with add-on shacks (−360, −420); El West Line on the bridge across the island | **Rooftop highway**: roofs within 3–6 m, planks and cables; streets nearly dark | Scarecrow, stealth, gang turf, kidnapped witnesses |
| **Park Row / Crime Alley** | 120 × 60 m blocks with alleys, a diagonal avenue (Old Trail Rd) | 10–25 m, greystones and two-flats | sodium orange, faded brick red | **Monarch Playhouse**, the shuttered theatre at the head of **Crime Alley** (−520, −330) — not the core's Monarch, a sister house; the El curve | Alleys, fire escapes, back porches; low roofs mean short grapples | Bruce's history, charity clinic, protection rackets, arson |
| **Chinatown + Little Odessa** | Chicago grid with a diagonal; Chinatown east, Little Odessa west | 10–40 m | Chinatown red + jade + gold; Odessa onion-dome teal + cream | **The Gate** (−400, −120); the **Wolf Point** tower (Black Mask's) at (−320, −250) on the fork; an onion-domed bathhouse in Odessa | Lantern lines as zip lines; tile roofs; the El on x −520 | Black Mask gang war, racket missions, festival nights |
| **The Yards** | 120 × 60 m with large merged yards | 10–40 m silos | rust, cattle-pen brown, furnace orange | **Yards Gate** (−420, −30); **grain elevator row** along the South Branch (−320, 40..140); **blast furnace** (−480, 160) | Boxcar roofs, moving trains, cranes, silo walls, hump-yard slopes | Firefly, vehicle battles, stolen-car rings, steel works boss |
| **Bristol** | Winding lanes in wooded hills; estates of 100 × 100 m | Trees 15–25 m; manor 25 m | autumn umber, slate, mist | **Wayne Manor** (−380, −700); an observatory folly on the high ridge | Gliding over trees on updrafts; cliffs; the Batcave beneath | Bruce's home, the Batcave, Ivy home-invasion night, Manor party |
| **Arkham Island** | Walled compound on a rocky island | 15–45 m | bone white, iron green, searchlight | Asylum clock-and-water tower; the causeway with a drawbridge | Causeway driving; walls, searchlights | Finale (Joker), breakouts, Arkham as a recurring threat |
| **Blackgate** (islet, later) | x 80..160, z 290..340 in the harbour | 20 m | concrete grey | Prison block lit from the core's docks | Boat or glide only | A riot side chain; a visible threat from the docks |

### 3.3 Street lines and connections (for the street graph, §4.2)

- **x lines** continue the core's −210 … 210 at 60 m pitch north into the Loop, and continue
  every 120 m in the Mile, Bristol and the west districts. Arterials sit at x −150 (the canyon)
  and x 150 (the Mile).
- **z lines** continue the core's −210 … 150 at 60 m pitch west into Chinatown and the Yards,
  and at −330, −390, … −570 in the Loop.
- **Diagonals:** Old Trail Road (Park Row, from (−580, −580) to (−450, −300)), Archer Way
  (Chinatown–Yards, (−300, −200) to (−580, 100)). Each makes flatiron corners.
- **Lower Gotham ramps:** at x −250 and x 220 (to the upper deck), and at x 340 (to Lakeshore
  Drive). Lower-Lower ramp at x 0.
- **El:** the Loop rectangle (x ±90, z −330..−570) and the **West Line** west along z −450 over
  the North Branch (lift span), across the Narrows and the Cut, then south along x −520 to the
  Yards terminal at z 150. About 1.0 km plus 840 m. Stations at the Loop midpoints, Narrows
  (−370, −450), Park Row (−520, −390), Chinatown (−520, −120) and Yards (−520, 100).
- **Water levels:** harbour and lake y −0.6 (existing). River y −6.0. **Locks** at the South
  Branch mouth (z ≈ 195) and at the lake mouth (x ≈ 350). A lock filling or draining is a timed
  traversal set piece. The real river has a lock at its lake mouth too.
- **Downtown cave:** a Batcave satellite in the old pumping works under the Pumping Tower, the
  second quick-entry point (fast travel, suit change, car swap).

### 3.4 Draw-distance and chunk notes

- Chunk at 120 m. The tall landmarks (Wayne Tower, the Exchange, the Corncobs, the Wheel, the
  silos, the Stack, the Manor ridge, the asylum tower) get **far-LOD silhouettes that never cull**,
  because navigation depends on them. Everything else culls at the tier's draw distance.
- Bristol and Robinson Park are cheap: instanced trees, few lights.
- The Loop is the stress test: keep potato-tier towers to box + crown card, and put window
  lights in a shader, not geometry.

---

## 4. Who uses what

H (city) builds from sections 1–3. J (story, crimes) uses sections 5–6 and the comedy in 8. K
(double life) uses 7. L (progression, minimap) uses 9. M (street life) uses 5.1, 5.4 and 5.5.

---

## 5. Open-world density: crimes, events, civilians

### 5.1 What makes a small city feel alive (principles)

1. **Something visible within 10 s of any rooftop.** Spawn events by sightline and sound, not
   just distance. A siren you can hear and a searchlight sweeping two blocks over count as content.
2. **Variety comes from combining, not counting.** A crime is objective × twist × place ×
   escalation. 8 objectives × 6 twists × 13 districts gives hundreds of readable combinations from
   a few systems.
3. **The city reacts.** Civilians flee, film on phones, cheer, call it in. Cops arrive late and
   cuff whoever you left. The radio reports what you did ("the Exchange is clear").
4. **Districts have owners.** Each gang has a look, a bark set, a vehicle, and a preferred crime
   list. Gang territory shifts with play (section 5.4).
5. **Short, mid and long loops.** 30 s (stop a mugging), 3 min (a chase or a robbery), 15 min (a
   side-mission chain step), a session (clear a district's heat).
6. **Payoff is visible.** A cleared district gets brighter windows, open shops, more civilians,
   fewer goons at night. Neglected districts darken.

Reference games: *Marvel's Spider-Man* (2018) has district crime lists and gang bases;
*Batman: Arkham Knight* runs "Most Wanted" side-villain chains; *Sleeping Dogs* uses
neighbourhood favours; *Watch Dogs* has crime prediction events; the *Middle-earth* Nemesis system
makes enemies remember the player. Their structure informs the patterns below. Their content is
not copied [S31].

### 5.2 Crime and event table

Co-op column: **how it changes for two players.** The rule is to split the objective so both
players matter, and add 30–50% enemies rather than health.

| # | Type | Objective | Twist (pick 1, rolls by district) | Where it fits | Two players |
|---|---|---|---|---|---|
| 1 | Mugging | Save the civilian before they're hurt (timer) | Mugger flees up a fire escape | Park Row, Narrows, Chinatown | Second mugging nearby; split up or race |
| 2 | Robbery in progress | Stop the crew before the getaway car leaves | Getaway driver waits a block away with a 60 s countdown | Mile, Loop, Chinatown | One stops the driver (car or batarang tyres), one takes the crew |
| 3 | Hostage store | Free 2–4 hostages without one being hit | Gunman with a dead-man trigger; stealth only until the shot | Mile, Park Row | Enter from two sides; synced takedown bonus |
| 4 | Foot chase | Catch the runner | Runner splits into two at a junction | Everywhere | Each takes one |
| 5 | Rooftop chase | Catch a free-runner across roofs | Zips and grapple gaps the runner uses too | Narrows, Park Row | One chases, one cuts off at a predicted roof |
| 6 | Vehicle chase | Disable the car (ram 3× or tyres) | Bridge is lifting ahead, or the car dives into Lower Gotham | River, Lower Gotham, LSD | Driver + gunner in the Batmobile, or Batmobile + glider |
| 7 | Bomb | Defuse before the timer runs out (find + puzzle) | Two bombs, one decoy; the detective scan tells which | Loop, Museum, El station | Defuse simultaneously at two sites |
| 8 | Arson | Rescue occupants and put out the fire | Firefly-crew arsonist still on the roof | Park Row, Yards, Chinatown | One evacuates, one catches the arsonist |
| 9 | Protection racket | Drive out the collectors and return the money | Shopkeeper won't testify unless the boss is shamed publicly (hang them from a sign) | Chinatown, Odessa, Mile | Two collectors work the street on opposite ends |
| 10 | Sniper nest | Take out 2–3 snipers pinning down police | Lasers show sightlines; move through cover | Loop, Exchange canyon | Draw fire and flank |
| 11 | Gang war | Break up a street battle between two gangs | Both gangs turn on you at 50%; a third party loots | Gang borders | Each player takes one side |
| 12 | Kidnapped witness | Find the van by clues, then rescue | Van moves; follow by drone sound | Narrows, Yards | One tracks, one intercepts |
| 13 | Stolen-car ring | Find the chop shop from a stolen car's route | Tail it without being seen (distance band) | Yards, Lower Gotham | One tails, one scouts the shop |
| 14 | Armoured-truck hit | Stop the ambush on a moving truck | Truck keeps moving; fight on its roof | Loop, Lower Gotham | One drives escort, one fights on the roof |
| 15 | El hijack | Stop goons on a moving train | Train speeds up past stations; decouple the cars | El | Front and back car |
| 16 | Bridge hostage | Free a car hanging off a raised bascule | Leaf keeps rising unless the bridgehouse is retaken | River | One holds the bridgehouse, one rescues |
| 17 | Toxin cloud | Seal vents and rescue the gassed | Visibility drops; fear hallucination goons | Narrows, Ace area | Each clears half the vents |
| 18 | Riddler trap | Solve a room or street puzzle under time | Fail = cage closes; redo with a new layout | Loop, Museum | Two-plate puzzles that need both |
| 19 | Smuggling boat | Board and stop a boat before the lock | Lock timer; deck crew | River, harbour | One opens or holds the lock, one boards |
| 20 | Jailbreak convoy | Stop a breakout from a prison bus | The bus is on the causeway to Arkham | Causeway, Lakeshore | Cut off front and back |
| 21 | Hostage tower | Clear a floor-by-floor tower | Hostages on different floors; elevators rigged | Loop | Top-down and bottom-up |
| 22 | Freeze-out | Free civilians frozen in ice before hypothermia | Ice spreads if the coolant tank isn't burst | Museum, Mile (snow nights) | Split tanks |
| 23 | Overgrowth | Clear vines choking a street; spore-controlled civilians | Don't hurt the civilians; non-lethal only | Robinson Park, Bristol | One clears roots, one handles civilians |
| 24 | Carnival rigged | Find the rigged ride before it fails | Ride is moving; climb it | Amusement Mile | One stops the ride, one finds the rigger |
| 25 | Street brawl (ambient) | Optional: break it up | Turns out to be a stunt for a phone video | Everywhere | Same |
| 26 | Prison riot | Retake a cell block | Inmates have looted guard gear | Blackgate, Arkham | Separate blocks |

**Ambient, non-combat events** (the cheap, high-value layer): a cat stuck on a gargoyle, a
car stalled on a raising bridge, a tour boat with a stuck engine near the lock, a power cut on a
block (all lights out, goons get bolder), a lost child at the fountain, a busker under the El, a
street preacher of a villain cult, a news crew filming the Bat, an argument that becomes a crime
if ignored for 60 s, a police stop that's actually crooked cops.

### 5.3 Escalation and heat

- **District heat 0–5.** It rises with crimes ignored or expired, villain story beats, and night
  length. It falls with crimes stopped, bases cleared, and Wayne charity (Bruce funding the clinic
  lowers Park Row heat by 1 — a double-life tie-in).
- **Heat changes the mix**: 0–1 ambient and muggings; 2–3 robberies, chases, rackets; 4 hostage
  towers, gang wars, bombs; 5 a villain lieutenant appears with a named crew (a mini-Nemesis:
  the lieutenant remembers how you beat them last time and brings counters, e.g. shields after
  batarang spam).
- **Escalation within a crime:** if ignored, a mugging becomes a hostage situation after 60 s; a
  robbery becomes a chase; an arson spreads to the next building.
- **Expiry has consequences**: a hospital report on the radio, a Gazette headline the next morning
  in Bruce's day, standing or city loss. Never a hard fail of the story.

### 5.4 District gangs

| Gang | Turf | Look | Vehicles | Preferred crimes | Barks theme |
|---|---|---|---|---|---|
| Joker crew (remnant) | Old Gotham, Amusement Mile | Clown masks, purple-green | Vans | Bombs, carnival rigs | Jokes they don't get |
| Penguin's Umbrella Men | Mile, River | Bowlers, long coats, umbrellas | Black sedans, boats | Smuggling, rackets, armoured trucks | Snobbish, money |
| Two-Face's Coin crews | Loop | Split suits, half-black/half-white | Split-paint cars | Bank jobs, hostage towers | Decisions, odds |
| Black Mask's False Faces | Chinatown, Odessa, Wolf Point | Black masks, sharp suits | Limos | Rackets, gang wars | Corporate menace |
| Scarecrow's Hollow Men | Narrows | Burlap hoods, gas tanks | On foot | Toxin, kidnapping | Paranoid whispers |
| Firefly's Burners | Yards, Park Row | Welding masks, tanks | Trucks | Arson, stolen-car ring | Heat jokes |
| Riddler's Question Marks | Loop, Museum | Green bowlers, phones | Delivery vans | Puzzles, bombs | Trivia arguments |
| Freeze's Cold Crew | Museum, Mile (snow) | Insulated gear | Refrigerated trucks | Freeze-outs, diamond heists | Complaining about the cold |
| Ivy's Thorns | Robinson Park, Bristol | Vine-wrapped | — | Overgrowth | Plant facts |
| Croc's Sewer Rats | Lower Gotham | Hip waders, lamps | — | Smuggling, convoy hits | Superstitious |

### 5.5 Civilians: behaviour and reactions

- **Schedules** from the clock (§4.5): day commuters on Loop sidewalks and El platforms; night
  crowds at Marquee Row and the Mile; the Narrows always busy at street level; Bristol empty.
- **Reactions ladder:** notice (head turn), point and film (phones up), flee (run to the nearest
  door or alley), cower (crouch behind a car), cheer (after a crime is stopped), approach
  ("thank you"; at high Suspicion: "you look familiar").
- **Weather** changes the crowd: umbrellas in rain, fewer people in snow, everyone under the El in
  a storm.
- **Memory:** civilians in a district you've kept safe greet the Batmobile. In a neglected one
  they shut the blinds.
- **Cost model:** a pooled crowd with 3 LOD levels; distant crowds are instanced 2-frame
  sprites; nearby crowds are full actors only within 30 m. Reactions are state flags, not
  animations, on low tiers.

---

## 6. A longer game: structure, villains, pacing, difficulty

### 6.1 Act structure (8–12 hours)

The current game becomes **Night One** (about 1–1.5 h), unchanged in content and step ids, with
`credits` reframed as "End of Night One". Acts II–V add seven more nights. A **day** is between
every night: a short Bruce section of 10–20 minutes with the Manor, Wayne Tower and appointments.
In co-op the second player is in Bruce's company: Dick, or a hero kit "on call".

| Act | Nights | Hours | Districts opened | Main thread | Bosses |
|---|---|---|---|---|---|
| I. The Long Night | 1 | 1–1.5 | Core | Existing story | Joker (existing) |
| II. The Gilded City | 2–3 | 2 | Loop, Lower Gotham, River, Mile | The Joker's arrest leaves a vacuum. Two-Face and Penguin carve up downtown, and a board vote on a Narrows redevelopment links them to a Wayne shareholder | Two-Face, Penguin |
| III. The Underside | 4–5 | 2.5 | Narrows, Park Row, Chinatown/Odessa, Yards | Scarecrow tests fear gas on the Narrows; Firefly burns the Yards; Black Mask funds both and moves on Wolf Point | Scarecrow, Firefly, Croc (Lower-Lower) |
| IV. The Cold Front | 6–7 | 2.5 | Lakefront, Museum, Pier, Bristol | Weather turns (snow). Freeze takes the aquarium plant; Ivy attacks the park and then the Manor; the Riddler reveals he has mapped Batman's routes and suspects Bruce | Freeze, Ivy, Tweedles (co-op), Riddler |
| V. Arkham | 8 | 1.5–2 | Arkham Island | Black Mask's war ends at Wolf Point; the Joker's breakout from Arkham; a finale on the island that remixes every skill | Black Mask, Joker (rematch) |

Side missions add 2–4 hours. Optional villain chains add 1–2.

### 6.2 Rogues gallery: one skill per boss

| Villain | Home | Skill tested | Fight shape (original design) |
|---|---|---|---|
| **Two-Face** | City Hall and the Exchange (Loop) | **Counters and reading tells** | A coin flip at each phase start decides Harvey's style: "clean" (brawler, telegraphed counters) or "scarred" (gunfire, dodge into counter). His crew follows the same coin. Mixed phases late. |
| **Penguin** | Iceberg Lounge (Mile) | **Gadgets** | Umbrella weapons each counter one gadget: shield beats batarangs, so use the claw; a gas umbrella needs smoke; a drone umbrella needs the disruptor. Ice-floor club with a shark tank, so knock goons in. |
| **Scarecrow** | The Stack (Narrows) | **Stealth** | Predator room while fear gas distorts the room every 30 s. A giant-Scarecrow hallucination searches with a "light" cone. Silent takedowns on gas-mask carriers drop the gas level. |
| **Riddler** | Loop / Museum (puzzle lair under the Exchange) | **Detective** | No direct fight until the end. Three rooms; each needs scan, reconstruct, and choose. Wrong answers spawn enemies and shrink the timer. A final mech-suit "quiz robot" needs weak points found by scan. |
| **Firefly** | Grain elevators and the steelworks (Yards) | **Vehicle (Batmobile + Batwing)** | An aerial jetpack duel. He torches the silo row; you drive the Batmobile to put out tanks while he strafes, then switch to the Batwing for the last phase. |
| **Killer Croc** | Lower-Lower Wacker analogue and sewers | **Endurance and evasion** | A long fight in the dark with water up to the knees. Croc ambushes from the water; read ripples; set tripwires; 3 phases with no checkpoint between (the endurance test). |
| **Tweedledum & Tweedledee** | Amusement Mile pier | **Co-op dual boss** | Two linked bosses who heal each other when close. Knock them apart and hit both in a 3 s window. In single player the ally AI (Nightwing) handles one. Ferris wheel and funhouse arena. |
| **Mr. Freeze** | Aquarium cold plant (Museum Campus) | **Environment and positioning** | The floor freezes in rings; burst coolant lines with gadgets to open his suit; heat sources keep the player alive. A snow-storm night ties to weather. |
| **Poison Ivy** | Conservatory (Robinson Park) then Wayne Manor grounds | **Crowd control, non-lethal** | Spore-controlled civilians attack; you must not hurt them (stun only). Cut root nodes across the arena while Ivy throws vine walls. The Manor reprise mixes it with the Bruce scenario. |
| **Black Mask** | Wolf Point tower (Chinatown/Odessa) | **Combat mastery / gang war** | Climb a tower floor by floor through both gangs fighting, then a duel with a gun-heavy boss and his lieutenant. Uses every combat move learned. |
| **Joker** (rematch) | Arkham Island | **Everything** | Finale gauntlet: each wing reuses one previous mechanic in a short remix, then the Joker himself. |

### 6.3 Side-mission chains (ideas)

- **The Coin Collector** (Two-Face): 5 split banks, each with a two-sided objective (save the
  cash *or* the hostage).
- **Umbrella Inventory** (Penguin): smuggled weapon crates hidden on boats; destroy them at the
  locks.
- **The Riddle Map**: 40 trophies and riddles; the answers reveal Riddler's route map of Batman,
  which feeds the Suspicion thread.
- **Gargoyle Census** (comic relief): Oracle catalogues gargoyles; 30 to perch on; reward is a
  suit.
- **Burned Out** (Firefly): an arson investigation chain; detective reconstructions of fires.
- **The Clinic** (Bruce): fund and protect the Park Row clinic; Bruce visits by day and Batman
  defends it by night.
- **El Phantom**: a ghost story on the West Line; a stealth chain riding moving trains.
- **Lost Bats** (Nightwing/Robin co-op): the young heroes' own chain; co-op-first puzzles.
- **Most Wanted lieutenants**: one per gang, built from the heat system (5.3).
- **Wolf Point Ledger**: Black Mask's accounts; detective plus Bruce Wayne (follow the money as
  Bruce at board meetings).

### 6.4 Pacing rules (against "walk here, radio, walk there")

1. **Talk while moving.** Radio lines play *over* travel. The next marker appears on the first
   line, never after the last. A `radio` step on its own is allowed only for a cinematic beat.
2. **Every travel step has a reason to look around**: an ambient crime in view, a landmark
   reveal, or a route through a new traversal feature (bridge lifting, El arriving). Route the
   travel marker so the player passes something interesting. Cut travel under 100 m into the
   previous step.
3. **Vary the verb between beats**: fight → traverse → detective → stealth → drive. Never two
   fights back to back without traversal between them unless it is a gauntlet.
4. **Cutscenes pay off and launch.** End every cutscene with the player already in motion (a
   placed glide, a car start), not standing still.
5. **Open the throttle.** After each act's opener, give 10–20 minutes of free choice: 2–3 main
   threads plus side chains, in any order (*Spider-Man* and *Arkham* both do this).
6. **Return trips change the place.** Revisited districts show consequences: police tape,
   repaired windows, a villain's graffiti.
7. **The Bruce day is a breather**: slower, warmer palette, choices instead of fights, and always
   ends with a hook into the night.
8. **Session-sized nights**: each night is 60–90 minutes with a save-friendly midpoint.

### 6.5 Difficulty curve principles

- **Sawtooth.** Each act rises to its boss, then drops for the new act's onboarding. Never teach
  a new mechanic during a hard fight.
- **Hard means mix, not health.** Add enemy types that demand different answers (shields, knives,
  brutes, guns, medics, armour) rather than inflating HP. A late fight is 4 types at once.
- **Mastery checks before gates.** Each boss's skill has an earlier side encounter that practises
  it (a "rehearsal").
- **Adaptive help, not adaptive difficulty.** On repeated failures, offer hints (Alfred) and an
  optional checkpoint, but keep enemy stats the same.
- **Co-op scaling:** enemies × 1.4 rather than × 2 (two players plus combo synergy is already
  stronger). Bosses get one extra mechanic, not extra HP. Revive windows are short (10 s) so
  downs matter.
- **Difficulty options:** Story, Normal, Knightmare (fewer counters shown, no hints).

---

## 7. The double life

### 7.1 How games and fiction make a dual identity felt

| Technique | Examples | What we take |
|---|---|---|
| **Calendar / time pressure** | *Persona* (day/night calendar, social links); *Majora's Mask* (3-day clock); *Dead Rising* (timed cases) [S31] | One week shown as a calendar; appointments are fixed times; nights are open but the clock runs |
| **Competing meters** | *Spider-Man 2* (2004) hero points vs Peter's life; *Sleeping Dogs* cop vs triad XP [S31] | Standing vs City, with Fatigue tying them together |
| **Consequence carry-over** | *Batman: The Telltale Series* (Bruce and Batman choices affect each other) [S31] | Injuries, headlines and broken promises carry from night to day |
| **Relationship threads** | *Persona* confidants; *Mass Effect*-style loyalty | Alfred, Gordon, Dick, a love interest, Lucius: 5 threads with 5 ranks |
| **Exposure risk** | Spider-Man films; *The Dark Knight* trilogy's public mask | Suspicion with remembered excuses |
| **The mask as performance** | *The Dark Knight* trilogy's playboy act; *Gotham*'s Alfred as guardian and investigator (tone only) | The playboy act is a dialogue mechanic: "Act" options cost little but erode the relationship threads |

### 7.2 System proposal

- **Calendar.** Each day has 0–3 appointments (gala 20:00, board 09:00, date 21:00, clinic
  visit 15:00). Nights have story beats and crimes. The clock runs in the Bruce day at ×20 speed
  and pauses in dialogue.
- **Standing (0–100, soft cap).** Kept appointments, good speeches and donations raise it. Missed
  appointments, gossip and lateness lower it. It funds R&D: a weekly WayneTech budget that
  unlocks the Wayne skill branch and gadget deliveries.
- **City (heat per district, 5.3).** Raised by ignored crimes, lowered by Batman work.
- **Fatigue (0–100).** Rises with night length and hits taken; falls with sleep (skipping
  appointments to sleep is a valid choice). High Fatigue makes Batman's stamina regen slower and
  greys out Bruce's best dialogue options.
- **Suspicion (per watcher: reporter, detective, villain).** Rises with excuses reused, injuries
  shown in public, being near crime scenes as Bruce, and Wayne Tech gear found. It falls with
  playboy acts, alibis arranged by Alfred, and time. At thresholds: a story event (an interview,
  a tail, a villain hint), never a game over.
- **Excuses** are remembered: "sailing accident" works once; twice raises the reporter's
  Suspicion; three times becomes a running joke in the Gazette.
- **Injuries** are visible on Bruce (bruise, split lip, a sling); civilians and the press comment.
- **Never block the main story.** The Wayne side changes how a night *starts* (resources,
  allies, what you know), not whether it can be finished.

### 7.3 Scenarios where the two lives collide (original)

| # | Scenario | Pressure | Choices and carry-over |
|---|---|---|---|
| 1 | **The Planetarium Gala.** Bruce hosts the Wayne Foundation's fundraiser for a new dome. Mid-toast, the signal lights over the lake | Standing vs City | Slip out via the service tunnel (Alfred stalls with a speech) or finish the toast and arrive late (the crime has escalated). If Batman returns within 15 game minutes, his pledge announcement still happens |
| 2 | **The 9 a.m. Vote.** The board votes on selling Narrows land to a front company. Last night ended at 05:10 | Fatigue | High Fatigue hides the "spot the forged survey" option. Sleep 3 hours and arrive sharp but late, or arrive on time and foggy. Lucius can cover if his thread is high |
| 3 | **Same Block, Different Coat.** Bruce opens the Park Row clinic. The man in the next bed is a goon Batman hit hard two nights ago, and his sister is the nurse | Conscience | How hard you fought (finisher count in that district) changes the conversation. A non-lethal record earns her trust and a lead |
| 4 | **Knuckles.** A Gazette reporter photographs the cuts on Bruce's knuckles at a lunch | Suspicion | Choose an excuse: polo, cooking, a cat. The game remembers which. Alfred can stage a sailing photo the next day to back it up |
| 5 | **The Wheel.** A date on the Amusement Mile Ferris wheel. Below, the Tweedles' crew rigs the funhouse | Relationship vs City | Use the "phone call" excuse (a timer; return before the gondola completes a turn) or call Nightwing (co-op partner takes it). Leaving mid-turn costs the thread a rank |
| 6 | **Benefit for the Badge.** At a police benefit Gordon criticises Batman's recent methods | Exposure | Defend Batman without knowing too much. Choices that cite details only Batman knew raise Gordon's Suspicion (a slow-burn reveal thread for the ending) |
| 7 | **R&D Hearing.** Lucius needs Bruce to argue the applied-sciences budget at the board | Standing → gadgets | The speech quality (and Standing) decides which prototype ships this week: a grapple upgrade or a car module |
| 8 | **High Stakes.** Bruce plays cards with Penguin at the Iceberg Lounge to get a ledger peek | Mask on | Can't fight. Read tells (detective skill) but lose on purpose to keep the "foolish playboy" cover; win and Penguin gets suspicious |
| 9 | **The Handshake.** After the Freeze night, Bruce's hand is frostbitten. The mayor's breakfast is a receiving line | Injury | Glove (rude, small Standing cost), bandage with a story (Suspicion), or grit through (Fatigue). The mayor remembers the glove |
| 10 | **Dick's Birthday.** Alfred has cooked; the Riddler starts a timer across town | Family | Bring Dick as Nightwing (P2 joins; Alfred's dinner goes cold, a comic beat), go alone (the family thread drops), or stay (the Riddler's lead goes cold; heat in the Loop) |
| 11 | **The Detective at the Door.** Det. Renata Ostrow (original GCPD character) visits the Manor about Wayne Tech gear found at a crime scene. The cave alarm sounds mid-interview | Exposure, comedy | A short stealth-in-your-own-house: Alfred stalls while the player silences the alarm and returns before her tea cools |
| 12 | **Buy It or Break It.** Black Mask's racket is squeezing a Chinatown block | Money vs fists | Bruce can buy the building (Standing cost from angry shareholders, instant relief) or Batman spends a night breaking the racket (City gain, keeps Standing). Both work; the next act remembers which |
| 13 | **Garden Party.** Bristol neighbours at the Manor while Ivy's vines move on the greenhouse | Stealth at home | Fight in the grounds without guests noticing: a noise meter. Excuses to leave the party (wine cellar, phone, a dog) |
| 14 | **The Officer.** A GCPD officer is in hospital after an ignored crime | Guilt carry-over | Bruce visits as a donor. It only exists if you let that crime expire. Alfred's line afterwards changes with the City score |
| 15 | **Asleep at the Wheel.** After three nights with no sleep, Bruce dozes through a board presentation | Fatigue, comedy | You lose the vote. The scene plays for laughs (Lucius nudges him), but the consequence stays: a delayed gadget |

### 7.4 Wayne Manor, the Batcave, Alfred

- **Manor**: hub by day. Rooms map to systems: the study (calendar, case files), the
  kitchen (Alfred thread, healing), the music room (the cave entrance), the gym (practice the
  rehearsal fights), the garage (the public car).
- **Batcave**: hub by night. Suit, gadget bench (skill tree), case board (the detective chain),
  car bay, training sims (the existing challenges move here), trophy cases for each boss.
- **Alfred** comments on Fatigue and Standing and voices the cost ("That's the third gala this
  month, sir. They've started saving you a seat by the door.").

---

## 8. Comedy

### 8.1 Where humour fits

- **Goons are allowed to be funny; Batman is not trying to be.** Comedy from goons humanises the
  fight without mocking the stakes.
- **Alfred is the dry voice** that says what the player thinks.
- **Villain taunts carry the villain's personality**, especially the Riddler's ego.
- **Deadpan Batman**: short, literal, never a quip for its own sake.
- **Radio and signage** are background texture for the attentive.
- **Never** joke over a death, a hostage under threat or a Bruce grief beat. Comedy comes
  *after* tension resolves, not during.

### 8.2 Sample lines (original, general audience)

**Goon barks**

1. "Anybody else hear wings? No? Just me? Great."
2. "I took this job for the dental plan. There's no dental plan."
3. "If he shows up, I'm on break. Write that down."
4. "Kevin, stop checking the ceiling. ...Actually, keep checking the ceiling."
5. "Boss says the Bat's a myth. Boss says a lot of things from very far away."
6. "My mom thinks I work in logistics. Technically, I move stuff."
7. "Why's it always a rooftop? Why can't we ever do crime in a nice lobby?"
8. "Rule one: don't stand under gargoyles. Rule two: this city is all gargoyles."
9. "New guy, quick tip: when the lights go out, you already lost."
10. "Do we get hazard pay?" "We get the hazard. That's the pay."
11. "I asked for nights because I thought it'd be quiet."
12. "Count off! One. Two. ...Three? Three, buddy?"
13. "He can't be everywhere." "Then how come he's always here?"
14. "I'm not scared. I'm just standing very defensively."
15. "Who parked the van under the El? He basically lives on the El."
16. "I swear that statue moved." "It's a pigeon." "Pigeons don't have capes."

**Overheard conversations**

17. "You took the El to a heist?" "Getaway car's in the shop." "The getaway car got away?" "It got
    towed. Different thing."
18. "Mr. Cobblepot says feed the fish." "With what?" "He didn't say with what. He said it while
    looking at you."
19. "Why do we wear question marks?" "Branding." "Doesn't that make us easy to spot?" "...That's
    a good question." "Don't say that word around here."
20. "Did you see the Bat last night?" "Nobody sees the Bat." "Then how do you know it was him?"
    "Because nobody saw him."
21. "Commissioner says we don't work with vigilantes." "So who switched on the big light?"
    "Electrical fault." "Bat-shaped?" "Very specific fault."
22. "What are you afraid of?" "Honestly? My performance review."

**Alfred**

23. "The signal is up, sir. I'll tell the gala you've been taken ill. Again. Gotham's most fragile
    billionaire."
24. "I've laid out the tuxedo, the Kevlar and an ice pack. Do wear them in that order."
25. "Shall I add 'fell off a cathedral' to the list of reasons you were late, or keep it vague?"
26. "Your board meeting is in four hours. I recommend sleep, coffee, or a very convincing cough."
27. "That's the third time I've stitched that eyebrow this month. It's practically a hobby."
28. "Master Dick asked if you've learned to say thank you yet. I said we're working on it."
29. "Lucius sent a new grapple. The manual is one page long and says 'please be careful' four
    times."
30. "If you're going to brood, sir, kindly brood away from the soufflé."
31. "The car is fuelled, the cave is lit, and the bats remain unimpressed."
32. "Your guest asked where you vanished to. I said the wine cellar. She found that entirely
    believable, which says something about your reputation."
33. "A man who can solve a murder from a shoelace, and yet the cufflinks elude you."
34. "Sleep isn't a weakness, sir. It's simply something you've never tried."

**Riddler taunts**

35. "What has a thousand eyes and sees nothing? The GCPD. Keep up."
36. "I hid the clue in plain sight. I know, I know: plain sight is your blind spot."
37. "Tick, tock. That's not a riddle, that's a bomb. See? I'm helping."
38. "Wrong! Oh, I've been rehearsing that all week."
39. "You solved it? Lucky guess. Statistically, absurdly lucky. I'm checking the maths."
40. "I'm the only man in Gotham who reads without moving his lips. You're welcome, Gotham."
41. "I left you a prize on top of the Exchange. Climb carefully. Falling would be such an obvious
    ending."
42. "Riddle: I climb all night, I never sleep, and I still can't solve a crossword. Who am I?
    Hint: pointy ears."
43. "Every route you take, I've drawn. Every rooftop, numbered. You're not a mystery, you're a
    commute."

**Deadpan Batman**

44. Goon: "You'll never take me alive!" Batman: "That's not the plan."
45. "You're not getting a lawyer yet. You're getting a cast first."
46. Nightwing: "Perfect landing." Batman: "Perfectly loud."
47. Alfred: "You're bleeding on the carpet." Batman: "It's an old carpet."
48. "Robin. Stop narrating."
49. Superman: "Was that small talk?" Batman: "It didn't count."
50. Penguin: "The umbrella is a weapon!" Batman: "So is the hat, apparently."
51. To a goon hiding in a dumpster: "Comfortable?"
52. "Riddler. The answer is 'prison.'"

**Radio and dispatch chatter**

53. "All units, a man in a cape on the El roof. ...Disregard. Dispatch says we all know who that
    is."
54. "Car twelve, a gargoyle fell off the cathedral. Second caller says it walked away."
55. "Be advised, the river bridge is lifting. Again. No, nobody knows where the boats are going
    at three a.m."
56. "Units near Robinson Park: the plants are behaving aggressively. Please do not argue with the
    plants."
57. "Traffic: Lower Gotham closed due to a large reptile. Use the upper deck. Or another city."
58. "Dispatch, I've got a guy zip-tied to a lamppost with a note that says 'for the GCPD.'" "Is the
    note polite?" "It's very polite."
59. "Reminder: the bat-shaped lamp on the roof is city property. Stop drying socks on it."
60. "Gotham Late Night FM. Tonight's forecast: overcast, with a ninety percent chance of being
    punched if you're up to no good."
61. "Weather: tonight, overcast. Tomorrow, overcast. Long-range outlook: Gotham."

**Signage**

62. GRAPPLE & SONS HARDWARE — Ropes, Hooks, No Questions
63. GARGOYLE MUTUAL INSURANCE — Coverage From Above
64. LAKEFRONT FRANKS — Everything But Ketchup (a Chicago joke)
65. DEEP DISH DETECTIVE AGENCY — No Case Too Deep
66. CAPES CLEANED WHILE U WAIT
67. TICK TOCK CLOCK REPAIR — Running Late Since 1889
68. DR. GRINN FAMILY DENTISTRY — Smile. We Insist.
69. IVY LEAGUE FLORISTS — We Grow On You
70. BOTH SIDES DINER — Sweet or Sour, Flip For It
71. THE EL: Fastest Way Across Gotham That Isn't Gliding
72. JOIN THE GCPD — Somebody Has To Do The Paperwork
73. GOTHAM IRON GYM — Train Like Someone's Watching From A Rooftop
74. COLD COMFORT ICE CO. — Freshly Frozen (graffiti adds: "PLEASE STOP")
75. LOCKSMITH 24H — Not Responsible For Skylights

---

## 9. Skill tree, progression, minimap and GPS

### 9.1 Branches

The existing WayneTech (`src/progress/upgrades.js`) has 4 trees × 5 upgrades (armour, combat,
gadgets, traversal), 1 point per 1,000 XP. **Keep those 20 ids as the first five nodes of each
branch** so old saves load (`long-night-2.md` §2, rule 2). Grow to **56 nodes in 5 branches**:

| Branch | Nodes | Theme | Currency |
|---|---|---|---|
| **Armour** (Body) | 11 | Health, damage reduction, recovery, environmental resistances (cold, fire, gas) | XP points |
| **Combat** (Fist) | 12 | Counters, combos, takedowns, multi-counter, crowd tools | XP points |
| **Gadgets** (Belt) | 12 | Upgrades and new gadget modes (remote batarang, disruptor, line launcher, glue grenade) | XP points |
| **Traversal and Predator** (Night) | 12 | Glide, grapple, wall-run, silent moves, perch, fear takedowns, El riding | XP points |
| **Wayne** (Means) | 9 | R&D deliveries, Batmobile modules, allies on call, Fatigue relief, alibi help | Standing budget (Bruce side) |

### 9.2 Node sketch (56)

**Armour (11):** 1 Reinforced Plating* · 2 Kevlar Weave* · 3 Titanium Plating* · 4 Field Medic* ·
5 Impact Dampers* · 6 Insulated Lining (cold) · 7 Fireweave (fire) · 8 Rebreather (gas) ·
9 Second Wind (one auto-revive per fight) · 10 Shock Gauntlets (electric counters) · 11 Hardened
Cowl (headshot halved).

**Combat (12):** 1 Quick Reflexes* · 2 Steady Flow* · 3 Efficient Chains* · 4 Fast Finish* ·
5 Bat Swarm* · 6 Double Counter · 7 Triple Counter · 8 Shield Breaker · 9 Disarm and Destroy ·
10 Aerial Attack Plus · 11 Beatdown Finisher · 12 Partner Takedown (co-op; solo: with an AI
ally).

**Gadgets (12):** 1 Triple Batarang* · 2 Bigger Bang* · 3 Quick Smoke* · 4 Double Claw* ·
5 Deep Freeze* · 6 Remote Batarang · 7 Disruptor (jam guns) · 8 Line Launcher (zip between
buildings) · 9 Glue Grenade · 10 Sonic Lure · 11 Detective Scan Range · 12 Gadget Combo (two
quickfire gadgets in one combo).

**Traversal and Predator (12):** 1 Grapple Accelerator* · 2 Aerodynamic Cape* · 3 Wall Grip
Boots* · 4 Slide Rails* · 5 Seismic Landing* · 6 Silent Glide · 7 Inverted Takedown ·
8 Fear Takedown (×2, ×3) · 9 Ledge Grab Takedown Plus · 10 El Surfer (stick to train roofs,
jump boost) · 11 Updraft Reader (rising air over vents, silos and the lakefront shown and
usable) · 12 Glide Boost (grapple-boost chains).

**Wayne (9):** 1 Applied Sciences Budget (weekly gadget delivery) · 2 Batmobile Pursuit Mode
upgrades · 3 Battle Mode upgrades · 4 Oracle Network (crimes shown earlier) · 5 Alfred's
Alibis (Suspicion −) · 6 Night Nurse (Fatigue recovery) · 7 Downtown Cave (fast travel) ·
8 Allies on Call (summon Nightwing/Robin AI) · 9 Foundation Fund (district heat −1 per week).

\* = existing id.

### 9.3 Unlock pacing

- At **1,000 XP per point**, a session earns about 4–6 points per hour now. For 56 nodes across
  ~10 h, move to **~5 per hour early, ~4 per hour late**: earn by increasing XP per level
  (1,000 → 1,400 by Act V), not by cutting XP per action.
- **Act gates.** Nodes 6+ of each branch unlock by act (II: 6–7, III: 8–9, IV: 10–11, V: 12),
  so a grinding player can't break the curve and new nodes match new bosses (Insulated Lining
  before Freeze, Rebreather before Scarecrow).
- **Gadgets that a boss needs** are given by story, not bought; the tree upgrades them.
- **Respec** at the Batcave bench for free once per act.

### 9.4 Co-op hero differences

Each hero kit (§4.1) **replaces one branch** with its own, and shares the other four with
different numbers:

- **Batman / alternate Batmen**: the default 5 branches.
- **Nightwing**: Gadgets → "Escrima" (electrified sticks, acrobatic counters, a wall-flip chain).
- **Robin variants**: Gadgets → "Staff and Tricks" (vault, trip, smoke-and-dash).
- **Batwoman**: Predator → "Fear Tactics".
- **Superman**: Gadgets → "Powers" (heat vision, freeze breath, flight). Armour is replaced by
  "Restraint" — he takes on power-limiting meters so fights stay a challenge.
- **Shared co-op nodes**: Partner Takedown, revive speed, combo sharing.

### 9.5 Minimap and GPS in a vertical gliding game

1. **North-up by default** with rotate as an option. North-up teaches the map (the river is
   always above Old Gotham), which matters in a 1 km city.
2. **Altitude bands.** Icons show a small up or down chevron and the floor height of the
   objective (e.g. "▲ 58 m"). The minimap fades buildings shorter than the player's height, so
   from a roof you see roofs.
3. **Two route modes.** *Driving*: the route is drawn on the road on the minimap and as a ground
   ribbon in the world, following the street graph (§4.2) and live gates (raised bridges, closed
   Lower Gotham sections). *On foot or gliding*: a straight line plus the **next good perch**
   (a tall building or a grapple chain) and an air ribbon showing the glide path that loses the
   least height. Switch modes automatically when you enter the car.
4. **Traversal layers on the map:** El lines (and moving trains as dots), bridges (with a lift
   icon when up), Lower Gotham ramps, zip lines, locks.
5. **District tint** on the minimap edge and the name banner when crossing a border, plus
   current heat.
6. **Player waypoints**: one free waypoint plus Oracle's suggested routes; in co-op each player's
   waypoint shows to both.
7. **Landmark compass**: a thin compass strip with the 5 big landmarks always shown (Wayne Tower,
   Exchange, clock tower, Wheel, silos). It is a cheap orientation aid that works even with the
   minimap off.
8. **Low spec**: draw the minimap from the street graph into a 256 px canvas once per chunk, then
   scroll. No render-to-texture of the scene.
9. **Diegetic option** (accessibility toggle): hide the minimap; rely on the compass, landmarks,
   Alfred's directions and a "bat-sense" ping (one press shows the route for 3 s).

---

## 10. Sources

- [S1] Wikipedia, "Streets and highways of Chicago" (address grid, 800 numbers to the mile, 8 blocks per mile, half-mile secondary streets, diagonals). https://en.wikipedia.org/wiki/Streets_and_highways_of_Chicago
- [S2] Block, street and alley widths: Chicago Municipal Code (public alleys min. 16 ft) https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2649965 ; Gapers Block, "Measuring a Chicago mile" https://gapersblock.com/airbags/archives/measuring_a_chicago_mile/ ; MCNY "The Greatest Grid" on Chicago's 66 ft streets and 16 ft alleys https://thegreatestgrid.mcny.org/greatest-grid/other-19th-century-grid/350 ; "A typology of Chicago alleys" https://ultralocal.blogspot.com/2014/10/a-typology-of-chicago-alleys.html
- [S3] Wikipedia, "The Loop (CTA)" (1.79 mi circuit, streets, opening dates, 2 tracks, 90 ft min radius, 600 V third rail, 8 stations of 12). https://en.wikipedia.org/wiki/The_Loop_(CTA)
- [S4] Illinois SHPO, Chicago Loop Elevated rehabilitation agreement (1981): riveted plates and angles; columns and bents at 30–50 ft intervals. https://dnrhistoric.illinois.gov/content/dam/soi/en/web/dnrhistoric/preserve/places/documents/moa-pa/urban-mass-transportation-program-chicago-loop-elevated-rehabilitation-project-106-pa-10-7-1981.pdf ; HAER IL-1 (Union Elevated Railroad) https://loc.gov/pictures/item/il0389
- [S5] City of Chicago CDOT, "Viaduct clearances" (posted where under 14 ft 6 in). https://www.chicago.gov/city/en/depts/cdot/provdrs/bridge/svcs/viaduct_clearances.html
- [S6] Wikipedia, "Chicago River" (main stem 1.5 mi, Wolf Point, 38 movable bridges of a peak 52, reversal, 1803 width ~30 yd, dyeing since 1961). https://en.wikipedia.org/wiki/Chicago_River
- [S7] City of Chicago, Chicago River Main Branch Framework Plan / Riverwalk (20 ft under bridges, 25 ft between, 50 ft at the confluence; below street level; 1.25 mi). https://www.chicago.gov/dam/city/depts/zlup/Sustainable_Development/Publications/Chicago_River_Main_Branch_Framework_Plan/mainbranchframeworkplan.pdf ; Wikipedia, "Chicago Riverwalk" https://en.wikipedia.org/wiki/Chicago_Riverwalk ; depth 20–26 ft: https://shorelinesightseeing.com/what-river-runs-through-chicago/
- [S8] Michigan Avenue (DuSable) Bridge: Wikipedia https://en.wikipedia.org/wiki/DuSable_Bridge ; McCormick Bridgehouse museum https://www.bridgehousemuseum.org/about-the-bridge ; Chicago Architecture Center "Trunnion bascule bridge" https://architecture.org/online-resources/architecture-encyclopedia/trunnion-bascule-bridge ; AISC Modern Steel https://www.aisc.org/modernsteel/news/2015/may/chicagos-michigan-avenue-bridge-turns-95/
- [S9] Greystones and two-flats: Moss Design "Greystone" (25 × 125 ft lots, Bedford limestone) https://moss-design.com/greystone/ ; Chicago Bungalow Association "Chicago two-flat" https://www.chicagobungalow.org/post/chicago-two-flat ; WBEZ "The tale of the two-flat" https://wbez.org/curious-city/2014/08/20/the-tale-of-the-two-flat
- [S10] Wikipedia, "Wacker Drive" (levels, 1926, 2001–02 rebuild, lower level service use, *The Dark Knight* chase on Lower Wacker). https://en.wikipedia.org/wiki/Wacker_Drive
- [S11] City of Chicago Smart Lighting Program (HPS to LED). https://chicago.gov/city/en/depts/mayor/press_room/press_releases/2022/february/ChicagoSmartLightingProgram.html ; WBEZ on the sodium glow https://www.wbez.org/shows/curious-city/the-art-and-science-behind-the-skylines-glow/ec91b586-84b3-448d-b017-96e845faf1bc
- [S12] Wikipedia, "Magnificent Mile" https://en.wikipedia.org/wiki/Magnificent_Mile ; The Magnificent Mile Association, History https://www.themagnificentmile.com/about/history
- [S13] Wikipedia, "Chicago Water Tower". https://en.wikipedia.org/wiki/Chicago_Water_Tower
- [S14] Wikipedia, "Tribune Tower". https://en.wikipedia.org/wiki/Tribune_Tower
- [S15] Wikipedia, "Grant Park (Chicago)". https://en.wikipedia.org/wiki/Grant_Park_(Chicago)
- [S16] Wikipedia, "Buckingham Fountain". https://en.wikipedia.org/wiki/Buckingham_Fountain
- [S17] Wikipedia, "Lake Shore Drive". https://en.wikipedia.org/wiki/Lake_Shore_Drive
- [S18] Wikipedia, "Navy Pier". https://en.wikipedia.org/wiki/Navy_Pier
- [S19] Illinois SHPO, Chicago Courtyard Apartments Multiple Property Document https://dnrhistoric.illinois.gov/content/dam/soi/en/web/dnrhistoric/documents/Chicago%20Courtyard%20Apartments%20Multiple%20Property%20Document%20Form.pdf ; Moss Design "Courtyard apartment" https://moss-design.com/courtyard-apartment/ ; Gnat, ACSA proceedings https://www.acsa-arch.org/proceedings/Annual%20Meeting%20Proceedings/ACSA.AM.98/ACSA.AM.98.60.pdf
- [S20] Wikipedia, "Union Stock Yard Gate". https://en.wikipedia.org/wiki/Union_Stock_Yard_Gate
- [S21] Chinatown Gate: WBEZ "Chicago Icons: Chinatown Gate" https://www.wbez.org/stories/chinatown-gate-chicago-history/613f2e80-f903-45ff-87ea-be534ea0ec1a ; Chicago Sun-Times dedication photo (7 Nov 1975) https://images.chicagohistory.org/asset/349732 ; WTTW https://www.wttw.com/node/3216 (inscription wording differs by source)
- [S22] Wikipedia, "Chicago school (architecture)". https://en.wikipedia.org/wiki/Chicago_school_(architecture)
- [S23] Wikipedia, "Chicago Board of Trade Building". https://en.wikipedia.org/wiki/Chicago_Board_of_Trade_Building
- [S24] Wikipedia, "Carbide & Carbon Building". https://en.wikipedia.org/wiki/Carbide_%26_Carbon_Building
- [S25] Wikipedia, "Marina City". https://en.wikipedia.org/wiki/Marina_City
- [S26] Film locations: movie-locations.com, *Batman Begins* https://www.movie-locations.com/movies/b/Batman-Begins.php and *The Dark Knight* https://movie-locations.com/movies/d/Dark-Knight.php ; Empire, "The Dark Knight location guide" https://empireonline.com/movies/features/dark-knight-location-guide
- [S27] Wikipedia, "Willis Tower". https://en.wikipedia.org/wiki/Willis_Tower
- [S28] Wikipedia, "Gotham City" (O'Neil, Burton, Furst, Welch, Ling, Dini, Logue quotes; Chicago via Neal Adams and Nolan; the Narrows from Kowloon Walled City; Arkham geography). https://en.wikipedia.org/wiki/Gotham_City
- [S29] District names (fan and game wikis; varying continuity): DC Database "Burnley" https://dc.fandom.com/wiki/Burnley ; Batman Wiki "Gotham City (Arkhamverse)" https://batman.fandom.com/wiki/Gotham_City_(Arkhamverse) ; *Gotham Knights* map guide https://www.ggrecon.com/guides/gotham-knights-map
- [S30] *Batman: The Animated Series*: Wikipedia https://en.wikipedia.org/wiki/Batman:_The_Animated_Series ; TVLine on the black-paper backgrounds https://tvline.com/2091384/batman-the-animated-series-distinctive-look-simple-art-trick-black-paper ; Paste on the style https://www.pastemagazine.com/tv/batman-the-animated-series-style
- [S31] Game references (structure only): Wikipedia articles for *Marvel's Spider-Man* (2018) https://en.wikipedia.org/wiki/Spider-Man_(2018_video_game) ; *Batman: Arkham Knight* https://en.wikipedia.org/wiki/Batman:_Arkham_Knight ; *Sleeping Dogs* https://en.wikipedia.org/wiki/Sleeping_Dogs_(video_game) ; *Middle-earth: Shadow of Mordor* https://en.wikipedia.org/wiki/Middle-earth:_Shadow_of_Mordor ; *Persona 5* https://en.wikipedia.org/wiki/Persona_5 ; *The Legend of Zelda: Majora's Mask* https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_Majora%27s_Mask ; *Dead Rising* https://en.wikipedia.org/wiki/Dead_Rising_(video_game) ; *Spider-Man 2* (2004) https://en.wikipedia.org/wiki/Spider-Man_2_(video_game) ; *Batman: The Telltale Series* https://en.wikipedia.org/wiki/Batman:_The_Telltale_Series

**Not verified by a source** (treat as estimates): the El's height above the street (game value
given), Lower Wacker's exact clearance and fixture colour, the workers' cottage and corner tavern
descriptions, the Kinzie Street rail bascule being held raised, and the Chinatown Gate
inscription's exact translation (sources differ).
