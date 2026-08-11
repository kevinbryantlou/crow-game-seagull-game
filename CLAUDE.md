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
  world/level.js       the authored block: geometry, colliders, placements, RULES
  world/pickups.js     the money
  entities/crow.js     locomotion, flight, procedural rig
  entities/human.js    three-state brain, and pigeons
  ui/hud.js            money, tasks, sun dial, beak prompt, ending headline
  ui/words.js          money spelled out (pure, unit tested)
  ui/rank.js           end-of-run titles (pure, unit tested)
docs/                  design brief + style guide — the spec, written to be checked against
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

`TEST_TRADE_PAYOUT` in `main.js` overrides the kid's trade payout so one trade
clears the goal. `null` in normal play. While set it shows a red TEST MODE badge,
prints a banner in `smoke`, and logs a startup warning — three tripwires so it
cannot ship by accident. Leave all three in place.

## Conventions

- No asset pipeline. Every model is generated from primitives; there is nothing to
  download at runtime and the whole build is ~155 kB gzipped, mostly three.js.
- Simulation is fixed-step at 60 Hz, decoupled from render, so a 120 Hz iPad and a
  throttled phone agree.
- Comments explain *why*, especially where a value was tuned or a bug was fixed.
- Git: commit when a chunk lands; message says what changed and what it cost.
