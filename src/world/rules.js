/**
 * Level-design invariants — the contract every block has to keep.
 *
 * These lived in world/level.js while there was one block, which was fine right
 * up until there were two: a rule that lives inside the level it constrains is
 * not a contract, it is a comment. They are read by both blocks and by both
 * harnesses, so there is one place to change them.
 *
 * Ten rules are enforced. The ones with a number live here. The rest are
 * structural and have nothing to tune; they are listed anyway, because this
 * object is what someone reads to find out what the contract *is*.
 *
 *   numeric, below
 *     1. a nest's landing surface is ≥ 2× the nest         smoke
 *     2. no two distinct pickups within a beak-length      smoke
 *     3. the block is navigable after dark                 shoot (luminance)
 *     4. the street lights come on before it is a problem  smoke + level
 *     9. no climb is longer than one stamina bar           smoke
 *
 *   structural, asserted but nothing to tune
 *     5. nothing is built inside the water                 smoke
 *     6. no pickup is buried, or hidden from the camera    smoke
 *     7. every volume the crow can enter, it can leave     smoke + shoot
 *     8. nobody stands or walks through solid geometry     smoke
 *    10. everything takeable carries a glint               smoke
 */
export const RULES = {
  /**
   * The surface you land on to reach a nest must be at least twice the nest's
   * own footprint in each dimension. Banking happens under pressure — the last
   * thing between a player and their money should never be pixel-accurate
   * landing on a plinth the size of the nest.
   */
  nestPlatformRatio: 2,
  /**
   * Two takeable things closer than this are one ambiguous target, because the
   * beak grabs the nearest. Keep pickups further apart than the beak's reach.
   */
  minPickupSeparation: 1.2,
  /**
   * The block has to stay navigable after dark. Measured by scripts/shoot.mjs
   * as the median and 5th-percentile luminance (sRGB 0–255) of the lower 58% of
   * the frame with the HUD hidden. Before the dusk work these fell to 19 and 8,
   * and the last third of the session — the guarded stretch the money layout
   * deliberately saves for the end — was the least playable part of the game.
   * docs/lighting-brief.html §1 guessed 55 and 35 before anything was built;
   * these are what the shipped frames actually justify.
   */
  duskMedianFloor: 48,
  duskShadowFloor: 24,
  /**
   * How long the day lasts, in seconds. A level may shorten its own, and level 2
   * does not — what level 2 shortens is how much of the day is left when it
   * starts. See `dayStart` on the level descriptor.
   *
   * It was 18 minutes, which was nine times a competent run — the real playtest
   * time is 2m07s and the rank ladder's fast cutoff is 2m30s. The consequence
   * was not just slack pacing: the light did not visibly change until 10m48s
   * and the lamps did not catch until 12m58s, so nobody who played well ever
   * saw dusk at all, and the sunset the game is named around never happened.
   *
   * At 8 minutes the lamps catch at 5m46s, just past the 5m30s
   * Accomplished Thief cutoff. Finish well and daylight is the reward; take
   * your time and the sunset is.
   */
  sessionSeconds: 8 * 60,
  /**
   * Time of day at which the street lights catch. Before the shadows go long
   * enough to be a navigation problem, not after — light that arrives once the
   * player is lost reads as a fix, light that arrives just before reads as a
   * world. It is also the day's second clock, and the only one that is not a
   * HUD widget. docs/lighting-brief.html §7.
   */
  lampsOnAt: 0.72,
  /**
   * The tallest climb, in metres, that a block may ask for with nothing to land
   * on in between.
   *
   * Rule 9, and it exists because level 2 is a vertical block and level 1 was
   * not. A full stamina bar is 1.0 / 0.42 = 2.38 seconds of flapping, and a flap
   * tops out at 6.4 m/s, so the theoretical ceiling is about 15 metres. Sizing
   * the rule at that number would be sizing it for a player who arrives at the
   * bottom of every climb with a full bar, which is exactly the player who does
   * not exist: you arrive at a climb having just flown away from someone.
   *
   * 9 metres is 60% of the ceiling — it clears on a bar that is nearly two
   * thirds empty. Anything taller has to be broken up with something to stand
   * on, which is why level 2's roofline is a staircase of decks rather than one
   * cliff, and why the fire escape has landings on it.
   */
  maxUnbrokenClimb: 9,
};
