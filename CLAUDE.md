# Small Change

A crow, a city block, and twenty dollars before sundown. Browser-first WebGL game
built to package for iOS with Capacitor. Single-player, no fail state.

Built from an Instagram "would you rather": *turned into a crow, and the only way
back is collecting $20.* Chosen over the seagull/fries option because $20 is a
value ladder — a penny and a guarded $10 are both "money" — where 40 fries is 40
identical pickups.

## Commands

```bash
npm run dev        # http://localhost:5173
npm run smoke      # headless sim + level invariants + unit tests, BOTH levels (no browser)
npm run shoot      # headless Chrome: real WebGL, screenshots to shots/, functional checks
npm run build      # → dist/, relative base, for Capacitor
npm run build:web  # → dist/, absolute base, for the beacon2 subpath deploy
npm run check      # smoke + build
npm run preview    # render link-preview card candidates → shots/
npm run preview:sheet  # build docs/preview-candidates.html from them
npm run serve:static   # Vercel-style static server (no trailing-slash redirect)
```

Deploying the public snapshot:

```bash
npm run build:web
rm -rf ../beacon2/small-change-crow-game && mkdir -p ../beacon2/small-change-crow-game
cp -R dist/. ../beacon2/small-change-crow-game/
node scripts/serve-static.mjs ../beacon2 4181          # Vercel-style, no redirect
node scripts/shoot.mjs http://localhost:4181/small-change-crow-game    # no slash!
```

`shoot` needs `dev` running in another shell.

## Verify, don't assume

This is the most important convention in the repo, and it was learned the hard way:
a bug where **100 of 351 meshes rendered pure black** shipped to the user because
the game had never been looked at. Both harnesses exist to close that gap.

- **`scripts/smoke.mjs`** builds *every* level headless and steps a simulated
  minute through each. The per-block half lives in `scripts/audit-level.mjs` and
  is run once per entry in `LEVELS`, so a rule written for one block is enforced
  on all of them — which is the only reason rule 11 caught a real thing on level
  1 the day it was written for the roofline. Everything but the renderer is plain three.js maths, so it catches NaN,
  falling through geometry, and — critically — *level-design defects* (see below).
- **`scripts/shoot.mjs`** drives real WebGL in headless Chrome, writes PNGs to
  `shots/`, and fails on any console error or failed request. It runs every
  block: `01`–`13` are the block, `20`–`29` and `l2-dusk-*` are the park,
  `30`–`39` and `l3-dusk-*` are the roofline, and `14` is the ending screen's
  next-level button. It also swaps levels eight times and asserts the GPU gets
  its memory back. Read the PNGs. It can
  place the crow anywhere via `window.__game` (dev builds only) for spot checks,
  and asserts behaviour like trade auto-equip.

When a bug is found, prefer turning it into an assertion over just fixing it.
Almost every test in `smoke.mjs` exists because something real broke.

## Layout

```
src/
  main.js              game class, interaction rules, fixed-step loop
  core/input.js        one abstract input state; keyboard and touch both write to it
  core/audio.js        Web Audio synthesis — no audio files
  render/palette.js    every colour in the game, single source of truth
  render/shapes.js     primitive kit + three-tone face tinting
  render/stage.js      renderer, fixed camera, sunset light rig, occlusion fade
  render/nightlights.js  what comes on at dusk — emissive only, no scene lights
  world/rules.js       RULES — the level-design contract, shared by every block
  world/kit.js         the shared prop kit: tables, lamps, bins, the nest, the pool
  world/level.js       LEVEL 1 — the block: plaza, café row, cart corner. Flat.
  world/park.js        LEVEL 2 — The Park: lawn, pond, pavilion roof. Two decks.
  world/level2.js      LEVEL 3 — The Hotel (Outside): forecourt, balconies, terrace, roof
                       (built second, slotted third — filenames are not slot numbers)
  world/levels.js      the registry: goal, tasks, teach copy, bait rules, endings, per level
  world/collide.js     the collider format, and going round things (pure, unit tested)
  world/pickups.js     the money
  entities/crow.js     locomotion, flight, procedural rig
  entities/human.js    three-state brain, pigeons, and gulls
  ui/hud.js            money, tasks, sun dial, beak prompt, ending headline
  ui/words.js          money spelled out (pure, unit tested)
  ui/rank.js           end-of-run titles (pure, unit tested)
docs/                  design brief + style guide — the spec, written to be checked against
                       lighting-brief.html — dusk lighting: tiers 0–2 shipped, 2.5 and 3 parked
                       park-brief.html    — level 2, the park: design, ladder, what it caught
                       level-2-brief.html — level 3, the roofline (filename predates the slot)
                       menu-brief.html    — progress, level select and pause: PROPOSED, not built
```

Pure logic goes in its own module so `smoke.mjs` can test it without a DOM.
That's why `words.js` and `rank.js` are separate from `hud.js`.

## Traps that have already bitten

- **`tint()` returns a non-indexed clone** for indexed geometry. Callers must use
  the return value. Dropping it leaves `vertexColors: true` with no `color`
  attribute, which renders **pure black**. Box/cylinder/cone/plane are indexed;
  icosahedron is not, which is why that bug looked selective.
- **`Pickup` has a `label` getter**, so `spec.label` must not go through
  `Object.assign` — assigning to a getter-only property throws in strict mode.
- **Touch detection must happen up front.** `#touch` is `display:none` until
  `body.touch` is set, so waiting for a touch event to set it is circular.
- **A circle approximated by boxes is a lie with gaps in it.** The fountain rim
  was twelve 1.6m boxes on a circle; they met only at their corners, so the crow
  walked in at three headings and nowhere else, and they reached a metre further
  into the basin than the stone did. Rings are now a real collider shape
  (`world/collide.js`), resolved radially. Don't add a second one lightly, but
  don't fake the next one either.
- **`mat()` caches by colour, so 38 meshes share one `goldLit` material.** Setting
  `.emissive` on it lights four lamp bulbs and every skyline window at once.
  That is useful for the skyline and fatal for anything wanting its own
  schedule, so `nightlights.js` always clones. Smoke asserts the cache was not
  poisoned.
- **A harness must ask the game how long the day is.** `shoot.mjs` hardcoded
  a fixed 18 minutes to compute "60% of the day" and silently measured four identical
  frames at `t=1` while `TEST_SESSION_SECONDS` was 60. `game.sessionSeconds`
  exists for this.
- **Shade is the hemisphere light's *sky* colour, not its ground colour.**
  `fill.color` lights up-facing surfaces, and the paving is nothing but those;
  `groundColor` only touches down-facing faces the paving does not have. That is
  why the shadows read rust for months while the palette said violet.
- **A guard that only checks one direction will pass the bug it was written for.**
  The day was 18 minutes, so the lamps caught at 12m58s against a 2m07s
  competent run and nobody ever saw dusk. The first assertions written for it
  bounded the day from *below* — "a fast run still finishes in daylight" — and
  passed happily at 18 minutes. Run a new check against the broken value before
  trusting it; `smoke.mjs` now bounds the lamp trigger from both sides.
- **Fractions of a hardcoded session length rot silently.** `hud.js` revealed
  the sun dial at `t > 30 / (18 * 60)`, which is only 30 seconds while the day
  is 18 minutes — it became 13 when the day became 8. Compare in seconds
  (`t * sessionSeconds > 30`), not in fractions of a constant.
- **Assert tuning *ratios*, not just outcomes.** Flapping in water sat at 62% of
  full power, i.e. 16.7 m/s² against gravity's 19 — net downward. The only thing
  lifting the crow was the buoyancy impulse, so escaping the fountain depended on
  catching the right phase of the bob. Every scripted escape test passed; a human
  holding the key never got out. `TUNING` is exported from `crow.js` so the
  relationship itself can be checked. Water flap power must stay above
  `GRAVITY / FLAP_ACCEL` = 0.704.
- **Holding a key and tapping it are different mechanics.** Tapping is a duty
  cycle: at ~40% on, average acceleration is 40% of the flap's. No sane power
  setting makes a tapped flap beat gravity, so in water a beat sets a floor on
  upward velocity (`WATER_HEAVE`) instead of adding acceleration. Test both
  patterns for anything the player might mash.
- **Pushing a walker out of a wall is not pathing.** It puts them back exactly
  where they were, so anyone walking straight at a wall deadlocks there forever.
  Steps have to be *steered* around obstacles, and the chosen side has to be held
  until the straight line clears — re-deciding each frame parks the walker at the
  point of the wall nearest its target, shuffling.
- **Raycasting headless needs `updateMatrixWorld(true)`** first, or every hit is
  computed against an identity transform and the results are silently wrong.
- **The camera never rotates**, so occlusion is a fixed property of position and
  can be tested. It is: see "no pickup is hidden from the fixed camera".
- **`npm run preview` renders the link-preview card, not a dev server.** Vite's
  usual meaning of that script name does not apply here; use `serve:static` to
  serve a build.
- **Static assets go in `public/`, never in the deploy directory.** `build:web`
  wipes `../beacon2/small-change-crow-game/` entirely, so anything hand-placed
  there vanishes on the next deploy. Vite copies `public/` to the root of
  `dist/`, which is how `preview.png` survives.
- **`og:image` and `og:url` must be absolute.** A relative `og:image` produces no
  card at all, silently — nothing errors and nothing renders.
- **Verify deploys by content, not by bundle hash.** The HTML shell and the JS
  bundle version independently; a copy or meta-tag change ships with an
  identical bundle hash, so hash comparison reports a false match. Fetch the
  page and grep for the actual string.
- **Relative asset paths break at a URL with no trailing slash.** `vite.config.js`
  sets `base: './'` for Capacitor, but a page served at `/thing` (not `/thing/`)
  resolves `./assets/…` against the *parent* directory and 404s the bundle — the
  page then hangs forever on "Building the block…". Deploy to a subpath with
  `npm run build:web`, which sets an absolute base. **Always test the no-slash
  form**: `python -m http.server` hides this bug by 301-redirecting to the slash
  version, which is why `scripts/serve-static.mjs` exists — it serves
  `dir/index.html` in place like Vercel does.

- **Everything quietly assumed `y = 0` until the roofline.** Walkers, light pools and
  the water body all measured from the world floor, which is the same statement
  as "measure from your own deck" right up until there is more than one deck.
  `blocksWalker`/`isFree`/`stepAround`/`resolveWalk` take a `floor`, `Human` and
  `Pigeon` carry a `floorY`, and `NightLights.addPool` takes a `y`. Level 1
  passes 0 everywhere and is unchanged.
- **`c.bottom <= 0.01` is not "is this on the ground", it is "is this at y=0".**
  The crow's scramble test used it, so the plunge pool — whose rim stands on a
  terrace at 5.4 — could not be climbed out of at *any* heading. That is the
  fountain-as-lobster-pot bug for the second time, from a completely different
  direction. It now reads `c.bottom <= from + 0.01`, measured from the crow's own
  feet, which says the same thing on every floor.
- **`inWater` needs a floor as well as a ceiling.** "Inside the ring and below
  the surface" is true of the entire column of air under a raised pool, so a crow
  in the yard was swimming in a pool five metres over its head. Bounded both
  ways, in `crow.js` and in `pickups.js`, and asserted from below.
- **`stepAround` ran out of steering at 112°.** Enough to get round a fountain,
  not enough to get round a 7.2m van: sliding along a wide face *away* from the
  target rotates the target direction until every deflection under 112° still
  points into the wall, the committed side has nothing free, and the walker turns
  round. Deflections now go to 158°, and a committed side is held until 2.5m of
  the straight line ahead is clear rather than until one step is.
- **A concave notch deadlocks a walker.** The van's body and cab differed by 0.1
  in `z`, and a walker steered into that 0.1m pocket could not commit its way
  out. One obstacle, one outline.
- **A dropped pickup lands at the beak, and the beak comes off the rig's world
  matrix.** Teleporting the crow and dropping in the same tick tests the position
  the crow used to be in. Let two frames pass first.
- **The goal under the money counter was markup.** `index.html` said
  "of $20.00" whatever the level asked for — the bar filled correctly and the
  number beside it lied. `Hud` writes it now.
- **Big dark surfaces fail the navigability floor, and no amount of lamps fix
  it.** The roofline's first dusk measurement was 5th-percentile 6 against a floor of
  24. The cause was four *materials*, not four missing lights: a 50m terracotta
  wall facing away from the sun, a yard one paving step too dark, a navy van, and
  six unlit teal windows that measured darker in daylight than the shadow they
  sat in. Look at the frame and find the biggest dark thing before adding a lamp
  — and never lower `duskMedianFloor`/`duskShadowFloor` to make a new block pass.

- **The crow's lateral collision resolved the wrong thing, three ways.** Reported
  from a playtest as "clipping through the fire escape — resets me outside the
  playable area", and it was three faults compounding on any geometry with air
  underneath it. It ejected toward the face implied by the *sign of the
  velocity*, which is the face you came from only if you were moving on that axis
  at all; it resolved *any* footprint overlap it could see, so flying straight
  along z produced a shove along x; and the head bonk ran *after* the lateral
  passes, so rising into the underside of a platform read as being inside it.
  Three stacked 0.25m landings triggered all three on nearly every climb and
  moved the bird up to 3.2m, sometimes through the edge of the block. Now: nearer
  face, only the axis that caused the overlap, bonk first. Asserted — worst
  single-frame move must stay under 0.55m, tested against every overhang.
- **Nothing with feathers falls.** A bird's `y` is authored and never integrated,
  which is invisible while every bird stands on a plaza, because a plaza is
  everywhere. On a 0.6m parapet a gull walks calmly off the side and hovers over
  the forecourt. `Pigeon._onDeck` makes the deck a leash: a step that leaves it is
  undone and the bird is sent home. Asserted after a simulated minute.
- **Low scenery still buries pickups.** The forecourt's garden beds are 0.3 tall,
  under both the crow's 0.34 scramble and a walker's 0.45 step, so they block
  nobody and are pure silhouette — and they will still swallow a coin, because
  "buried" is a volume test and does not care whether anything can be stopped by
  it. Put nothing takeable inside one.

- **A coin on the far side of a fountain is looking at the fountain.** Its one
  sightline to the camera leaves at 38°, and on a 3.2m basin with a 2.3m
  centrepiece that ray goes straight through the stem and the dish. Wishing coins
  now sit only in the arc where the ray leaves outward, and there are five rather
  than six, because a basin that size cannot hold six coins and a shiny with a
  beak-length between every pair. Level 1's basin is 5.2m and its coins sit
  further out than its bowl is wide, which is why it never came up.
- **A dark band across the foreground is a third of the frame the lamps never
  reach.** A kerb gives the forecourt an edge and is worth having; the strip of
  road first drawn beyond it took the dusk median from 53 to 42 against a floor
  of 48. Narrow, and no darker than the paving.
- **Legible in the source is not legible on screen.** The kid was moved onto the
  terrace and became invisible — a slightly shorter adult among a maître d', a
  busser and two diners, and a playtester could not tell who to trade with.
  Colour and props did not fix it; a *silhouette* did. She sits, and nothing else
  in either block sits. When a character has to be identified at the distance
  this camera sits, change the shape, not the shade.

- **Two ground decals at the *same* height is the bug; the ground underneath is
  not.** This one took three rounds because the symptom — a staircase down the
  whole frontage — is identical to every other depth complaint. Three paving
  patches shared `y = 0.012` and a 64x4 strip along the building crossed two of
  them. At *identical* depth the winner is a coin flip per pixel. `polygonOffset`
  cannot help, because it nudges every decal by the same amount and leaves them
  exactly as coplanar with each other as they were — which is why the first fix
  looked right and changed nothing at all. Use `kit.addDecal()`, which stacks
  them 4mm apart in add order; asserted both ways.
- **A 12mm gap over the ground is thin, and worth `polygonOffset` anyway.** The paving variation lies
  that far above the ground it covers, which is ample at the near plane and
  nothing like enough sixty metres out at a grazing angle: the boundary breaks
  into a staircase, and it got reported twice as "textures clipping into one
  another". The fix is `polygonOffset`, not more height — it scales with the
  polygon's own depth slope, which is the term that blows up, and raising the
  geometry instead would put a visible step at the edge of every slab. Pass
  `decal: true` to `plane()`/`mat()` — `addDecal` does — and it is part of the
  material cache key, so one slab asking for it cannot turn it on for all 38
  users of a colour. Asserted: any plane sitting 1mm–30cm above a surface must be
  a decal.
- **When something looks like z-fighting, turn the shadow map off first.** Two
  different artifacts on the same wall in the same week looked identical and had
  nothing to do with each other. One frame with `renderer.shadowMap.enabled =
  false` separates them in seconds — but the materials have to be recompiled
  (`needsUpdate = true`) or the shadows stay on and the test lies to you, which
  cost a round here.
- **Shadow acne reads exactly like z-fighting, and is not.** Irregular horizontal
  smears along the whole 64m frontage of the roofline, only at some sun angles, which
  is why it survived a shipping pass — the block looked clean at noon and striped
  at four o'clock. A long building casts a long shadow across a very large ground
  plane, and inside that cast shadow the depth comparison fails in bands.
  `normalBias` is the knob (it offsets along the surface normal, which is what a
  raking light on a big flat receiver needs); it went 0.03 → 0.15, clean by 0.10,
  the rest is margin. Before hunting for overlapping geometry, turn
  `renderer.shadowMap.enabled` off and look again.
- **British words are not neutral words.** The teaching toast said "the kid on the
  parapet". The whole job of that line is to send an American player to a specific
  place, and *parapet* sends them to a dictionary. Copy that names a location has
  to name it in the plainest word available — "the roof edge".
- **The edge kerb runs the whole length of the block**, so anything placed near
  the near edge ends up half-sunk in it — a bin was. Tagged `edge-kerb` and
  asserted against.

- **A material has to survive both ends of the light ramp, and the two ends pull
  opposite ways.** The park's lawn is the biggest surface in the game and it took
  three attempts. Painted in the tree greens it failed dusk twice over — median
  35 against a floor of 48, *and* the blue-beats-red check, because a saturated
  green swallows the violet sky fill that every block's shadows are made of. The
  correction to a pale sage fixed both numbers and made the **daylight** a beach:
  the afternoon key is 0xffd9a0 at 2.6, warm and strong enough to pull anything
  under-saturated to tan, and it took the paving with it, so a park with paths in
  it rendered as one continuous sandpit. `PAL.lawn` is the third try — green
  beats red by 29 so it survives the key, blue stays at 0.85 of red so it catches
  the violet. **Check a new large-surface colour at t=0 and t=0.98, never one or
  the other.**
- **Adding a lamppost can make a frame darker.** At this camera a lamp is a pool
  on the ground *plus* a 4.6m opaque column and its shadow standing in the frame.
  A ninth lamp at the park's west gate bought two points of median and cost four
  of 5th percentile. Light the ground — paths, aprons, brighter road — and treat
  the lamp count as the last resort, not the first.
- **A lamppost is also 4.6m of opaque nothing on somebody's sightline.** One
  stood exactly on the ray from the bandstand step's loose change to the camera.
  Rule 6 caught it; the fix is to move the lamp, not the coin, because the coin
  is where the level wants it.
- **A ledge's collider has to sit where the ledge *mesh* sits.** The park's
  noticeboard has a 0.12m ledge proud of a solid board, and 0.12m is the entire
  clearance the dollar on it has: collider at the board's z and the bill is
  buried, collider anywhere further out and it is standing on air. When a prop is
  offset from its parent, offset the collider by the same amount.
- **A silhouette that identifies someone is inherited, not owned.** The roofline
  made the kid legible by sitting her down, because nothing else in the game sits.
  A park is *mostly benches* — so the park is designed around defending that: the
  picnic stands round its cooler, the keeper walks, the jogger runs, and all four
  benches are empty. If a later block seats anybody, the kid stops working on
  every block at once.
- **A near-side occluder only fades on one ray.** `stage._updateOccluders` casts
  a single ray from camera to crow, so the shelter fades when it is between them
  and stands there solid the rest of the time. Nothing that is core loop — the
  kid, the trade — goes behind the thing whose job is to be in the way.

- **Geometry is safe to dispose and materials are not, and the difference is the
  whole of teardown.** Every mesh owns its geometry — `tint()` even hands back a
  private non-indexed clone — so a level rebuild can free all of it. `mat()`
  caches by colour and 38 meshes share one `goldLit`, so a teardown that walks
  the scene disposing what it finds frees materials the *next* block needs and
  the level after a replay renders undefined. `isSharedMaterial()` in
  `shapes.js` makes that a question the code asks rather than a rule someone
  remembers. The per-build exceptions worth freeing by hand: the night-light
  clones, the pool quads, `Stage`'s occluder clones, and each `Human`'s marker
  texture.
- **Reloading the page to restart would silence the game.** `audio.unlock()`
  has to run inside a user gesture, and a freshly loaded page has not had one —
  so the obvious implementation of "Again!" (`location.reload()`) comes back
  with a suspended AudioContext and no sound until the player next presses
  something. That single fact is why levels are swapped in place.
- **Three things survive a level swap that should not.** `stage._smoothed` holds
  the old crow position, so the camera and the shadow frustum sail across the
  map on arrival unless you `snapTo` the new spawn. `stage._occluders` must be
  cleared *before* the meshes leave the scene or the per-frame raycast hits
  freed geometry. And `hud.setTasks` keys off task id and only ever appends, so
  a new block inherits the old block's rows — worse, ids that match keep the
  *old wording*, so four of five tasks silently read as the previous level's.
- **A CSS animation plays once per element per page.** The ending screen's
  fade-up was correct for as long as the only way to see a second ending was a
  reload. Now that replaying rebuilds in place, every ending after the first
  would appear fully formed with no fade unless the animation is re-armed —
  remove the class, force a reflow, put it back. The reflow read is
  load-bearing; without it the browser coalesces both changes and nothing
  happens.
- **A block is not built the same way twice.** `addSkyline` drops 22% of its
  windows at random, so the roofline's mesh count ranges over about ten between
  builds. Any assertion on mesh or geometry counts has to be a bound, not an
  equality — but scene *children* are deterministic, so that one can be pinned,
  and it is the sharper leak detector anyway.
- **A night light drives a material, not a mesh, so it can be orphaned in
  silence.** `Stage.registerOccluders` clones the material of anything that
  fades when it blocks the camera; a mesh that is *also* a night light keeps
  ramping a material nothing renders. Level 1's whole café front — a door and
  three windows — never lit up for months for exactly this reason. `NightLights`
  holds a *list* of materials now and `follow()` is how the clone gets adopted.
  The clone itself cannot be skipped: `mat()` caches by colour, so `transparent`
  would leak to every mesh of that colour, and fade is per-mesh, so two
  occluders sharing one material would fight over one `opacity` every frame.
- **A check that runs before the thing it checks for passes for free.** The
  orphaning above is done by a *caller*, after the level is built, so an audit
  that only looks at the built world sees nothing wrong — it measured 0 orphans
  at build time and 2 a moment later. `prepareOccluders` is exported from
  `stage.js` so the audit can run the real step in the real order rather than a
  reimplementation that would only ever agree with itself.

## Level-design rules (asserted, not aspirational)

In `RULES` in `world/rules.js`, enforced by `smoke.mjs` via `audit-level.mjs`,
once per entry in `LEVELS`:

- A nest's landing surface is **at least 2× the nest footprint**. Banking happens
  under pressure; the last obstacle should never be a pixel-accurate landing.
- **No two distinct pickups within one beak-length** (1.2). The beak takes the
  nearest, so closer than that is one ambiguous target, not two. Same-denomination
  coins are exempt — they read as one heap.
- **Nothing built inside the fountain**, or any volume the player moves through.
- **No pickup buried in solid geometry**, and none hidden from the fixed camera.
- Anything takeable **carries a glint**. It is the game's only "you can take this"
  signal — including the hot dog, which is not money but unlocks Cart Corner.
- **Every volume the crow can get into, it can get out of.** Asserted both ways
  for the fountain: the rim is a wall at all 180 headings, and from 24 points on
  the basin floor the crow can always flap out.
- **Nobody stands inside anything, and no route walks through anything.** No
  human spawn or patrol waypoint inside a solid, and no patrol leg across the
  fountain.
- **A chase can get round every large solid.** Shooing steers at the crow and the
  crow can stand anywhere, so this cannot be authored — it has to be pathing.
- **The block stays navigable after dark.** `shoot` measures the rendered frame:
  median ≥ `RULES.duskMedianFloor`, 5th percentile ≥ `duskShadowFloor`. It fell
  to 19 and 8 before the dusk work.
- **The sunset happens inside a session someone plays.** `RULES.lampsOnAt` has to
  be converted on to *this level's* clock first — a block may start partway into
  the afternoon (`dayStart`), so the same 0.72 buys 5m46s on the block and 4m08s
  on the roofline. Asserted in *both* directions — see the one-direction trap
  above.
- **No climb longer than `RULES.maxUnbrokenClimb` (9m) with nothing to land on.**
  60% of what a full stamina bar buys, because nobody arrives at a climb with a
  full bar. This is why the roofline is a staircase of decks and not a cliff.
- **Everything is resting on a deck that exists.** Pickups, people and birds. On
  a flat block this was unfalsifiable; with four decks it is the easiest mistake
  in the file — write a terrace coordinate, forget the offset, and it hangs in
  the air with nothing under it and no way to see that in review. One exemption,
  declared in the level data: `hung: true` on the ten in the vendor's apron.
- **Nothing shoves the crow more than 0.55m in a frame.** The clipping report,
  made falsifiable: every collider with air under it, from eight headings at
  three heights.
- **There is somewhere legal to drop the bait.** The set piece has a deck
  requirement and a distance requirement; if they ever conflict, the block's
  marquee puzzle is quietly unsolvable.
- **Unguarded money plus every trade still cannot reach the goal.** The kid's
  ladder is per-level (`tradeValues`) because what a trade is worth depends on
  what it costs to make one — the roofline's kid sits on a roof edge between two
  guards and pays half again. That knob has an obvious failure mode: pay enough
  and the honest route beats the dishonest one. The bound is stated, not
  eyeballed.
- **Nothing is standing in the edge kerb.**

## Three levels

`world/levels.js` is the registry. A level descriptor holds everything about a
block that is not geometry: `goal`, `sessionSeconds`, `dayStart`, `spawn`, the
task list (with `when` predicates for the ones that complete by observation),
`bankTicks`, the teaching toasts, the `bait` set-piece rules, `chaseProbes` for
smoke, and the ending copy. If another block would need a different one, it is
level data; if they all need the same one, it is in `world/rules.js`.

The ladder is **$20 / $25 / $30** and **one deck / two decks / four decks**.
Both rows are deliberate: each block is one step, and the middle one exists
because the gap between the outer two was measured and found too big.

- **Level 1 — the block** (`level.js`). Flat, $20, starts at `dayStart: 0`.
- **Level 2 — The Park** (`park.js`). Two decks (0 / 3.4, nest at 4.75), $25,
  ±30 wide, starts at `dayStart: 0.20` so the lamps catch at 5m12s.
  `docs/park-brief.html` is the spec.

  Written *because* the roofline was too big a leap from the block, so its whole
  design constraint is to be a small step: one roof, cleared with 1.0m of
  unbroken climb, and no new verbs. What it spends instead of altitude is
  **social pressure** — the marquee is three people standing round one cooler
  with $10.85 on and beside it, where the block always gave you a softer
  district next door. Built, verified and **playtested — it reads as solid and
  needed no revision round**, which the other two blocks both did. The pavilion
  is settled: right for this map, not to be redesigned.
- **Level 3 — The Hotel (Outside)** (`level2.js`). Four decks (0 / 3.2 / 5.4 /
  9.2, nest at 12.35), $30, ±32 wide, starts at `dayStart: 0.42` so the lamps
  catch at 4m08s. `docs/level-2-brief.html` is the spec.

  Playtested and revised across three rounds: it reads as **too big a scale leap
  to follow the block directly**, so it moved to slot 3 once the park existed.
  That is why the goal is $30 and not $40 — above the block, below a doubling.
  **Do not renumber the file.** `level2.js` is level 3 and `park.js` has no
  number in its name at all; order is a registry question, not a filename one,
  and renaming would only move the confusion somewhere git blame cannot follow.

**Finishing a block hands you the next one.** The ending screen carries a brass
button naming where it goes (`The park →`) with `Again!` beside it in outline;
the last block and every loss show only `Again!`, in brass, because you reach a
block by completing the one before it. The whole progression system is two
fields on the descriptor — `next` and `shortName` — plus `Game.loadLevel(id)`.

Both buttons **rebuild the level inside the live page**; nothing reloads. That
is not polish. `audio.unlock()` needs a user gesture, and a reloaded page has
not had one, so a reload comes back with the game silent until the player next
presses something.

`?level=N` still works and is still how a session starts; `loadLevel` keeps the
address bar in step so a refresh returns you to the block you are on. **There is
still no menu** — no way to reach an arbitrary block, no record of what you have
finished, no route backwards. That needs saved state, which nothing in the game
has yet.

`world/kit.js` holds anything a fourth block would otherwise copy-paste: tables,
benches, lamps, bins, planters, trees, the skyline, the nest, and the water body.
A café table is kit; a war memorial with a nest on it is not. Level 1 was rebuilt
on the kit and re-verified *before* the roofline was written, so the refactor and the
new level never had to be debugged at the same time. Do that again.

## Art direction

`docs/style-guide.html` is the spec; `render/palette.js` holds the same values.
If they disagree, the doc is wrong. Non-negotiables: flat shading everywhere,
three tones per object, **shade is violet and never neutral grey**, no textures or
gradients on geometry, humans have no faces, the crow is the darkest thing on
screen, nothing is outlined.

## Docs

`docs/*.html` are self-contained (no webfonts, no external assets, theme-aware).
They are also deployed to the **password-gated** `/research/` area of the sibling
`beacon2` repo — *not* `/notes`, which is public despite the name. After editing a
doc, copy it to `../beacon2/research/small-change-*.html` and commit both repos.

**Copying the file is only half of publishing it.** `beacon2/research/index.html`
is a hand-maintained list of cards and nothing generates it, so a copied doc is
reachable only by someone who already knows its URL — which is how the park
brief and the lighting brief sat deployed and unlinked for weeks, and the menu
brief for an afternoon. A new doc needs a card in that file too. The check is
four lines, and it is worth running after any doc lands:

```bash
cd ../beacon2 && node -e "
const h=require('fs').readFileSync('research/index.html','utf8');
const links=[...h.matchAll(/href=\"\/research\/([^\"]+)\"/g)].map(m=>m[1]);
const files=require('fs').readdirSync('research').filter(f=>f.endsWith('.html')&&f!=='index.html');
console.log('unlisted:',files.filter(f=>!links.includes(f)));
console.log('broken :',links.filter(l=>!files.includes(l)&&l!=='logout'));"
```

Mockups inside a brief are rendered by `npm run mocks`, which photographs every
element carrying `data-shot` into `shots/`. It opens the doc over `file://`, so
it also fails on a brief that has stopped being self-contained.

## Brand surfaces

The hosted page carries Open Graph and Twitter card metadata plus a 1200×630
image at `/small-change-crow-game/preview.png`, rendered from the real game by
`scripts/preview.mjs` (HUD hidden, crow parked, wordmark overlaid). Six framings
were compared in `docs/preview-candidates.html`; Cart Corner ships, the memorial
is the runner-up. The card's strapline and the `og:description` are written as a
pair — same deadpan register, no repeated words between them.

## Test hooks

Two constants at the top of `main.js`, both `null` in normal play:

- `TEST_TRADE_PAYOUT` overrides the kid's trade payout so one trade clears the goal.
- `TEST_SESSION_SECONDS` shortens the day. Everything about sundown — the light
  rig, the sun dial, the out-of-time ending — runs off `elapsed / SESSION_SECONDS`,
  so `60` gives a full dusk in a minute.

Either one shows a red TEST MODE badge, prints a banner in `smoke`, and logs a
startup warning — three tripwires so neither can ship by accident. The smoke
banner matches any `TEST_*` constant, so a new hook is covered automatically.
Leave all three tripwires in place.

## Conventions

- No asset pipeline. Every model is generated from primitives; there is nothing to
  download at runtime and the whole build is ~155 kB gzipped, mostly three.js.
- Simulation is fixed-step at 60 Hz, decoupled from render, so a 120 Hz iPad and a
  throttled phone agree.
- Comments explain *why*, especially where a value was tuned or a bug was fixed.
- Git: commit when a chunk lands; message says what changed and what it cost.
