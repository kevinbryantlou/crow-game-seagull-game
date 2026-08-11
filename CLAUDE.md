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
npm run smoke      # headless sim + level invariants + unit tests (no browser)
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

- **`scripts/smoke.mjs`** builds the real world headless and steps a simulated
  minute. Everything but the renderer is plain three.js maths, so it catches NaN,
  falling through geometry, and — critically — *level-design defects* (see below).
- **`scripts/shoot.mjs`** drives real WebGL in headless Chrome, writes PNGs to
  `shots/`, and fails on any console error or failed request. Read the PNGs. It can
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
  world/level.js       the authored block: geometry, colliders, placements, RULES
  world/collide.js     the collider format, and going round things (pure, unit tested)
  world/pickups.js     the money
  entities/crow.js     locomotion, flight, procedural rig
  entities/human.js    three-state brain, and pigeons
  ui/hud.js            money, tasks, sun dial, beak prompt, ending headline
  ui/words.js          money spelled out (pure, unit tested)
  ui/rank.js           end-of-run titles (pure, unit tested)
docs/                  design brief + style guide — the spec, written to be checked against
                       lighting-brief.html — dusk lighting exploration, NOT implemented
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

## Level-design rules (asserted, not aspirational)

In `RULES` in `world/level.js`, enforced by `smoke.mjs`:

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
- **The sunset happens inside a session someone plays.** `RULES.lampsOnAt` ×
  `sessionSeconds` must land after a fast run ends and well before the day does.
  Asserted in *both* directions — see the one-direction trap above.

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
