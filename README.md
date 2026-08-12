# Small Change

A crow, a city block, and twenty dollars before sundown.

You were a person this morning. You are a crow now, and the only way back is
**$20**, in your nest, by the time the light goes. One thing in the beak at a
time, and money only counts once it lands in the nest.

Built from the prompt *"you're turned into a crow and the only way to turn back
into a human is by collecting $20."*

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build        # → dist/ with relative paths, for Capacitor
npm run build:web    # → dist/ with an absolute base, for the hosted subpath
npm run smoke        # headless simulation + level invariants + unit tests
npm run shoot        # headless Chrome: real WebGL, screenshots, functional checks
npm run check        # smoke + build, the pre-commit gate
npm run serve:static # Vercel-style static server, for verifying a deploy
```

`shoot` needs a server running — `npm run dev`, or `npm run serve:static <dir>`
against a built deploy.

## The link preview card

Pasting the hosted URL produces a proper card rather than a bare link. The image
is rendered from the running game, not mocked up:

```bash
npm run dev
npm run preview        # → shots/*.png, six candidate framings
npm run preview:sheet  # → docs/preview-candidates.html, a contact sheet
```

Pick one, copy it to `public/preview.png`, rebuild. It lives in `public/`
because Vite copies that directory to the root of `dist/` — the deploy directory
is wiped on every `build:web`, so nothing can be placed there by hand. The Open
Graph tags in `index.html` use an absolute URL; a relative `og:image` silently
produces no card at all.

To try a different strapline without editing the script:

```bash
ONLY=preview-f-cart node scripts/preview.mjs http://localhost:5173/ "another line"
```

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` / arrows | left thumb stick (spawns where you touch) |
| Fly | `Space`, hold to climb | **Fly** |
| Beak — take, drop, stash, give, shove | `J` or `E` | **Beak** |
| Caw | `K` or `Q` | **Caw** |
| Mute | `M` | — |

Four verbs, and that ceiling is set by the phone rather than by the design.

## How it works

- **Money is a ladder, not a counter.** $33.95 sits on the block, but only
  $0.75 of it can be pocketed without crossing somebody. Everything else is
  owned, so the endgame is the guarded stretch no matter what order you play in.
- **One item at a time.** Every grab is a commitment, the run home is where the
  game happens, and being caught costs you what you were carrying.
- **Nobody dies.** Humans are weather: calm → suspicious → shooing. Getting
  caught costs time and dignity. There is no fail state and no game over.
- **The cart puzzle.** The vendor never leaves the ten. Steal a hot dog, drop it
  well away from the cart, and the pigeons mob it — he goes to shoo them, and
  you have twelve seconds.
- **The kid on the bench** trades coins for shiny worthless things, at an
  escalating rate. She is the safety valve, and the reason the ending has a
  second beat.

## Layout

```
src/
  main.js              game class, interaction rules, fixed-step loop
  core/input.js        one abstract input state; keyboard and touch both write to it
  core/audio.js        Web Audio synthesis — no audio files
  render/palette.js    every colour in the game, single source of truth
  render/shapes.js     primitive kit + the three-tone face tinting
  render/stage.js      renderer, fixed camera, sunset light rig, occlusion fade
  world/rules.js       RULES — the level-design contract, shared by every block
  world/kit.js         the shared prop kit: tables, lamps, bins, the nest, the pool
  world/levels.js      the registry: goal, tasks, teach copy, bait rules, endings
  world/level.js       LEVEL 1 — the block. Flat, $20.
  world/park.js        LEVEL 2 — the park. Two decks, $25.
  world/level2.js      LEVEL 3 — the hotel exterior. Four decks, $30.
  world/collide.js     the collider format, and going round things
  world/pickups.js     the money
  entities/crow.js     locomotion, flight, the procedural rig
  entities/human.js    the three-state brain, and pigeons
  ui/hud.js            money, tasks, sun dial, beak prompt
docs/
  design-brief.html    what the game is and why
  style-guide.html     the art direction, with concept plates
  park-brief.html      level 2, the park
  level-2-brief.html   level 3, the hotel exterior (filename predates the slot)
scripts/smoke.mjs      headless build-and-simulate test
```

No asset pipeline: every model is generated from primitives in code. The whole
build is one ~153 kB gzipped chunk (almost all of it three.js) with nothing to
download at runtime.

## iOS

The web build is the iOS build — `capacitor.config.json` is already here and
points at `dist/`.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios        # then set a signing team and run
```

What makes that a config change rather than a port:

- Touch was never a retrofit — the input layer is one abstract state object.
- Layout is driven by `env(safe-area-inset-*)` from the start, so a notch
  changes nothing.
- The simulation is fixed-step at 60 Hz and decoupled from render, so a 120 Hz
  iPad and a throttled phone produce identical physics.
- No network, no third-party scripts, no storage.
- `base: './'` in the Vite config, so the build works from a `capacitor://`
  origin.

Worth doing on device before shipping: bump the shadow map down to 1024 on
phones, and confirm the audio context unlocks on the first tap (it is wired to
the Begin button, which is the gesture iOS wants).

## Docs

`docs/design-brief.html` and `docs/style-guide.html` are the spec. They are
written to be checked against — the palette in the style guide and the palette
in `src/render/palette.js` are the same values, and the economy figures in the
brief are asserted by `npm run smoke`, which fails if unguarded money alone
could ever reach $20.
