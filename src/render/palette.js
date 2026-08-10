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

/** Sky gradient endpoints for the sunset ramp, in order. */
export const SKY_RAMP = [
  { t: 0.0,  high: 0x8fb4c4, low: 0xf2c879, key: PAL.keyAfternoon, keyI: 2.6, amb: 0.85, elev: 0.42 },
  { t: 0.55, high: 0x7fa0bd, low: 0xf0a860, key: PAL.keyGolden,    keyI: 2.4, amb: 0.75, elev: 0.24 },
  { t: 0.85, high: 0x5c6a94, low: 0xd8724e, key: 0xff7a48,         keyI: 1.7, amb: 0.62, elev: 0.12 },
  { t: 1.0,  high: 0x3b4570, low: 0x8a5a72, key: PAL.keyDusk,      keyI: 0.9, amb: 0.55, elev: 0.06 },
];
