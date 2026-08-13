/**
 * Small Change — palette.
 *
 * Single source of truth for every colour in the game. docs/style-guide.html is
 * written against these exact values; if you change one here, change it there.
 *
 * The one rule that holds the whole look together: shade is violet, never grey.
 */

export const PAL = {
  // ground & architecture
  paving:      0xd8c6a8,
  pavingMid:   0xbfa98a,
  shade:       0x6e6478,
  terracotta:  0xb4643c,
  terracottaLit: 0xd07e52,
  steel:       0x8a8f98,
  steelDark:   0x6e7480,
  stone:       0xe4dacb,
  stoneMid:    0xc9bda8,

  /**
   * Mown grass — the park's ground, and therefore the single biggest surface
   * in any block of this game.
   *
   * It is not `canopy`, and finding that out cost a round of measurement. The
   * lawn was first painted in the same greens as the trees, which is what you
   * would write down without thinking, and it failed dusk twice over: the
   * median fell to 35 against a floor of 48, and — worse — the frame stopped
   * being violet. A saturated leaf green absorbs blue, so the violet sky fill
   * that makes every other block's shadows read cool came back off the grass
   * as mud, and the 5th-percentile check caught the brightness while the
   * blue-beats-red check caught the hue. One material, both failures, exactly
   * as the roofline's terracotta wall did.
   *
   * A sun-bleached sage is also just truer. Parkland in late summer at six in
   * the evening is not the colour of a leaf, and keeping leaf green for the
   * trees is what stops the canopies dissolving into the ground they stand on.
   *
   * The correction after that one over-corrected, which is the other half of
   * the lesson: at 0xb8c6a2 the dusk numbers were fine and the *daylight* was
   * a beach. The afternoon key is 0xffd9a0 at 2.6, warm and strong enough to
   * pull anything under-saturated straight to tan — and the paving went with
   * it, so a park with paths in it rendered as one continuous sandpit. Green
   * has to beat red by enough to survive that light (here, by 29) while blue
   * stays high enough to catch the violet at the other end of the day. Both
   * ends of the ramp, or neither.
   */
  lawn:        0xa2bf8a,
  lawnMid:     0x93b07b,

  /**
   * The lobby runner — the biggest coloured surface on level 4, and it took two
   * goes for the same reason the park's lawn took three.
   *
   * The first paint was a sage-teal, one value up from `awning`, chosen so the
   * lobby would carry the park's colour chord indoors. It measured fine and it
   * *photographed as grass*: a long green band running off the edge of the
   * frame, on a block that has spent every other decision trying not to read as
   * outdoors. Under this game's afternoon key — 0xffd9a0 at 2.6 — a green with
   * any yellow in it goes olive, and olive on a floor is a lawn.
   *
   * Blue is the correction to that, and it pays for itself twice: it cannot be
   * mistaken for planting at any hour, and it is the one large surface in the
   * game that *helps* the dusk check that says shade must be violet.
   *
   * The *value* took a second measurement. At 0x6f9ab4 — a perfectly reasonable
   * dusty blue — the runner rendered at dusk as a navy band across a third of
   * the lower frame and pinned the 5th percentile at 21 against a floor of 24,
   * and no amount of light fixed it, because a pool on the floor cannot make a
   * dark material bright. It is 34 points of luminance below `lawn`, and `lawn`
   * is itself the palest thing the park could get away with. So this is a pale
   * blue-grey at almost exactly the lawn's value: still unmistakably not
   * planting, still blue over red by 43, and no longer the darkest thing in the
   * room. **A big surface is a light-rig decision before it is a colour one.**
   */
  rug:         0xa7c2d2,
  rugMid:      0x8fadc0,

  /**
   * The harbour, and the bed under it — the wharf's biggest surface, and the
   * third time a block's biggest surface has needed its own entry.
   *
   * The lawn took three attempts and the lobby's runner took two, both for the
   * same reason: a large saturated surface either swallows the violet sky fill
   * at dusk or goes to tan under the afternoon key. `water` is the fountain
   * colour and it is far too saturated to cover a third of the frame with — a
   * teal that reads as a jewel in a five-metre basin reads at thirty metres as
   * a hole in the block.
   *
   * So this is pale and barely blue, at almost exactly `lawn`'s value, which
   * puts it well clear of the 5th-percentile floor. It also does something none
   * of the other big surfaces can: blue beats red here by 55, and the lobby
   * shipped with that margin down to 10 at t = 0.98 because warm additive light
   * eats the violet everything is built on. A big cool plane is the one thing
   * that pays that back rather than spending more of it.
   *
   * `harbourBed` shows through at 0.66 opacity, so it is part of the colour
   * rather than under it — kept close in value on purpose, because the coins on
   * the bottom have to read through the surface and a dark bed hides them.
   */
  harbour:     0x8fb8c6,
  harbourBed:  0x7fa8b4,

  // planting & water
  canopy:      0x7fa05c,
  canopyLit:   0x8fb06a,
  canopyShade: 0x4e6b3e,
  bark:        0x8c6e4a,
  barkShade:   0x6b5136,
  water:       0x4e9bb0,
  waterLit:    0x7fc4d2,
  awning:      0x2e8c8c,
  awningLit:   0x3fa8a8,

  // the crow
  feather:      0x1e1a24,
  featherSheen: 0x3c3a63,
  featherShade: 0x0f0d14,
  beak:         0x2a2530,
  eye:          0xe8e2d2,

  // money & pickups
  gold:    0xe0b348,
  goldLit: 0xf2cf74,
  silver:  0xc9cdd2,
  bill:    0x5e8c63,
  billDark:0x3e6444,
  shiny:   0xd8e4ea,

  // people
  skin:   [0xe0b07a, 0xc98d5c, 0x8a5c3a, 0xf0cba0],
  hair:   [0x3a2e28, 0x1e1a18, 0x6b4a2e, 0xa8a29c],
  cloth:  [0xd95f4c, 0x3f5f8c, 0xe8ce6e, 0x8c5fa8, 0x4a8c6a],
  clothLit: [0xee7a66, 0x5a7cab, 0xf5e08e, 0xa87bc4, 0x63a884],
  trouser:[0x3a2e28, 0x4a4458, 0x2f3a4a],

  // sky & light
  sunHaze: 0xf2c879,
  skyHigh: 0x8fb4c4,
  dusk:    0x4a3f5c,

  // key light colour over the course of a session
  keyAfternoon: 0xffd9a0,
  keyGolden:    0xff9e5c,
  keyDusk:      0x6e6aa8,
};

/**
 * Sky gradient endpoints for the sunset ramp, in order.
 *
 * `fill` is the hemisphere light's *sky* colour, which is what lights every
 * up-facing surface not reached by the key — i.e. it is the colour of shade,
 * and the paving is nothing but up-facing surfaces. It used to be set to `low`,
 * the horizon glow, which is why the block's shadows went rust-red at dusk
 * while the style guide and the losing ending both said violet. Shading it off
 * `low` is also wrong physically: flat ground in shadow at sunset is lit by the
 * sky dome overhead, not by the orange band at the horizon. It now runs warm at
 * midday and swings violet as the sun drops, which is the real phenomenon, obeys
 * *shade is violet, never grey*, and gives the amber street lighting something
 * cool to read against instead of more orange.
 *
 * `amb` climbs through the back half of the day. That is not realism, it is the
 * navigability floor from docs/lighting-brief.html §1 — the block's median
 * luminance used to fall to 19/255 and the last third of the session was
 * unplayable. `groundColor` stays PAL.shade throughout and only ever touches
 * down-facing faces.
 */
export const SKY_RAMP = [
  { t: 0.0,  high: 0x8fb4c4, low: 0xf2c879, fill: 0xf2c879, key: PAL.keyAfternoon, keyI: 2.6, amb: 0.85, elev: 0.42 },
  { t: 0.55, high: 0x7fa0bd, low: 0xf0a860, fill: 0xe8a877, key: PAL.keyGolden,    keyI: 2.4, amb: 0.82, elev: 0.24 },
  { t: 0.85, high: 0x5c6a94, low: 0xd8724e, fill: 0xa98cb4, key: 0xff7a48,         keyI: 1.7, amb: 1.05, elev: 0.12 },
  { t: 0.93, high: 0x46527e, low: 0xb0637a, fill: 0x9280b8, key: 0xb0729e,         keyI: 1.3, amb: 1.24, elev: 0.085 },
  { t: 1.0,  high: 0x3b4570, low: 0x8a5a72, fill: 0x8676b4, key: PAL.keyDusk,      keyI: 0.9, amb: 1.40, elev: 0.06 },
];
