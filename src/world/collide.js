/**
 * The collider format, and the two questions anything ever asks of it.
 *
 * Every solid on the block is an axis-aligned box, with one exception: the
 * fountain is a `ring`. It used to be twelve overlapping boxes standing in for
 * a circle, and that approximation was a real bug — the boxes left walk-through
 * slots at three headings and nowhere else, while reaching 0.8 further into the
 * basin than the stone they represented. A circle is cheap to test exactly, so
 * it is tested exactly.
 *
 * Pure maths, no three.js, so scripts/smoke.mjs can assert against it directly.
 */

/** A person is this tall, and will step over anything shorter than this. */
export const WALKER_HEIGHT = 1.75;
export const WALKER_STEP_OVER = 0.45;   // kerbs and the busker's case, not benches
// Torso plus swinging arms. Wide enough that nobody can stand half inside a
// magazine rack, narrow enough to get between two café tables.
export const WALKER_RADIUS = 0.36;
// Ankle height, so a pigeon shelters under a café table but is still turned
// back by its pedestal — and by the fountain it used to paddle in.
export const PIGEON_RADIUS = 0.16;
export const PIGEON_HEIGHT = 0.35;
export const PIGEON_STEP_OVER = 0.1;

/**
 * Where a person looks from.
 *
 * `WALKER_HEIGHT` is 1.75 because that is what a person's *collider* has to be
 * to stop them walking under a café awning. The eye is not up there: the rig in
 * `entities/human.js` hangs the head group at 1.60 and builds a 0.32 skull
 * about it, so 1.60 is the number the model itself already uses. Sighting from
 * the collision height instead would put every guard's eye on the top of their
 * own skull and hand them a free 0.15m of vision over every desk in the game.
 */
export const WALKER_EYE = 1.60;

/**
 * How far a solid has to stand above the seer's own deck before it is cover.
 *
 * `hasLineOfSight` below is exact, and on its own it is *too* exact. It aims at
 * a single point, and the point it is given is the crow's **feet** — `crow.pos`
 * is set to `floor` on landing — so a ray from a standing eye is grazing the
 * ground by the time it arrives. Left ungated, a 0.34m kerb hides a bird stood
 * behind it, and a guard blinded by street furniture would gut five shipped,
 * playtested blocks.
 *
 * So a solid only counts if a person would have to look *at* it rather than
 * over it. Where that line falls is a judgement, and the honest thing to say
 * about it is that **the blocks do not contain a gap to put it in**. Measure
 * every collider in the game against every deck somebody stands on and the
 * heights run all but continuously through the region that matters:
 *
 *     0.62  fountain, pond and quay copings           0.72  a lobby plinth
 *     0.67  a bench          0.70  a terrace parapet, from its own deck
 *     0.79  a park bench     0.80  a lobby column base
 *     0.81  a café tabletop
 *     ————————————————————— 0.85 —————————————————————
 *     0.90  a park platform, and the lobby's gallery balustrade
 *     0.94  a lobby pier     0.95  the wharf's bait table     0.98  a park stand
 *     1.00  a newsstand      1.04, 1.12, 1.15, 1.17, 1.19 …
 *     1.25  the lobby's front desk — the solid this whole change is about
 *     1.40  the wharf's breakwater      1.62  a litter bin
 *
 * So the value is picked for *margin*, not for meaning. 0.81 → 0.90 is the only
 * empty band wider than 0.06 anywhere between a bench and the front desk, and
 * 0.85 sits in the middle of it with 0.04 clear on each side. That matters more
 * than the fourth decimal place of the number itself, because the first value
 * tried was 0.90 and it landed *exactly* on `lobby.js`'s gallery balustrade —
 * `DECK.mezzanine` is 4.4, the rail tops out at 5.3, and `5.3 - 4.4` is
 * 0.8999999999999995. Which side of the rule a shipped block's gallery staff
 * fell on would have been decided by a floating-point crumb. `smoke` asserts
 * nothing else ever comes to rest on the line.
 *
 * Above the line the classification is what you would want: the front desk, the
 * breakwater, the bins and the containers are cover. Below it the kerbs, the
 * copings, the benches and the café tables are not, which is the result the
 * five shipped blocks need — a guard blinded by street furniture would gut all
 * of them.
 *
 * Measured **from the seer's own deck**, which is what makes the parapet line
 * true in both directions at once — 0.70 of stone is something the terrace
 * staff look straight over, and the same stone is 6.10 of wall to a porter
 * standing in the forecourt. It also means the deck a guard is standing on
 * (top exactly at their feet, so 0 above it) is never their own cover, which is
 * the conservative reading: a roof edge does geometrically hide the ground at
 * the foot of the building, but taking that away from the roofline's staff is a
 * change to how a played block behaves, and this is a bug fix.
 */
export const SIGHT_OVER = 0.85;

/**
 * How close a sightline may skim a solid's surface and still count as clear.
 *
 * Load-bearing, not slop. A crow's `pos.y` is its feet, and landing sets that
 * to the collider's `top` *exactly* — so a bird standing on the lobby desk or a
 * litter bin is a point sitting precisely on the face of the thing under it,
 * and an exact test reports it as buried inside its own perch. Five centimetres
 * of grazing allowance is well under anything that reads as cover and is the
 * difference between "on the bin" and "behind the bin".
 */
export const SIGHT_GRAZE = 0.05;

/**
 * How wide a solid has to be before it is cover rather than a post.
 *
 * A lamppost is 0.30 x 0.30 and 4.60 tall, so it clears `SIGHT_OVER` by five
 * metres and is, geometrically, a wall. There are twenty-one of them across the
 * five blocks and they were 24% of the park's blinded sightlines. A guard losing
 * the crow behind a pole is *true* and reads as a bug, which is the whole
 * argument: this test exists to model what a person can see, and a person does
 * not lose a bird behind a lamppost.
 *
 * The line has a physical meaning rather than a tuned one. **The crow's own
 * collision radius is 0.34, so the bird is 0.68 wide, and a solid narrower than
 * that cannot hide it** — there is no position behind a 0.30m post where a
 * 0.68m bird is not sticking out of both sides. So the rule is "is this thing
 * at least as wide as the thing it is meant to be hiding", and the answer is
 * measured on the collider's *larger* horizontal dimension: a front desk is
 * 8.3 x 1.2 and is obviously cover, while a post is small both ways.
 *
 * 0.66 rather than 0.68 for the same reason `SIGHT_OVER` is 0.85 — margin, not
 * meaning. Measured across every block, the candidates run 0.30, 0.40, 0.50,
 * 0.60 (a tree trunk), 0.62, then 0.70, 0.76, 0.94, 1.10, 1.24, 1.30 (a litter
 * bin). 0.62 -> 0.70 is the gap the line belongs in and 0.66 sits in the middle
 * of it, 0.04 clear on each side. `smoke` asserts nothing comes to rest on it.
 *
 * What this drops: lampposts, tree trunks, the roofline's slim columns, the
 * thinner pilings. What it keeps: bins, planters, newsstands, desks, vans,
 * buildings — everything anybody would call cover. The tree is worth noting,
 * because a tree also carries a second, 2.8m collider for its canopy: the trunk
 * stops blocking and the canopy still does, which is right in both directions.
 */
export const SIGHT_SLIM = 0.66;

/**
 * Is there anything solid between an eye and a point?
 *
 * The whole reason this is a segment test and not a footprint test: a crow
 * flying *over* the lobby's front desk has to stay visible. So a collider only
 * blocks if the segment is actually inside it — over its footprint **and**
 * between its `bottom` and its `top` while it is there.
 *
 * The method is the standard Liang–Barsky slab clip run on x and z only, which
 * hands back the two parameters where the segment enters and leaves the
 * footprint; the segment's height at those two parameters is then the height
 * range to compare against the box. That is exact for an axis-aligned box and
 * costs no allocation, which matters because this is on the 60 Hz path.
 *
 * @param {number} floor  the deck the *seer* is standing on. Everything about
 *   cover is relative to it — see SIGHT_OVER.
 */
export function hasLineOfSight(cols, ex, ey, ez, px, py, pz, floor = 0) {
  const dx = px - ex, dy = py - ey, dz = pz - ez;
  const loY = ey < py ? ey : py, hiY = ey < py ? py : ey;

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    /**
     * Rings are the fountain, pond and lobby-pool copings, and every one of
     * them tops out at 0.62 — below SIGHT_OVER from any deck anybody stands on,
     * so the height gate on the next line already drops all of them and the
     * annulus maths would never once run. Skipped by name rather than left to
     * that coincidence, and `smoke` asserts the coincidence still holds: the
     * day somebody builds a circular tower, a check is what says so instead of
     * a guard quietly seeing through it.
     */
    if (c.shape === 'ring') continue;
    /**
     * An opt-out, for the one shape this test gets wrong: a small platform on a
     * pole. The mast's crown is 3.2m across and seven metres up, so it is wide
     * enough and tall enough to qualify as cover — and a guard standing at the
     * foot of the mast is then blind to a crow *above* it, which is
     * geometrically true and exactly the direction this whole change must never
     * break. Flight is the answer to being chased; a lid in the sky that hides
     * the bird from underneath is worse than the bug being fixed.
     *
     * Declared per collider, and there is one in the game.
     */
    if (c.sight === false) continue;
    if (c.top - floor < SIGHT_OVER) continue;
    // Too slim to hide a bird 0.68 wide — a lamppost is not cover.
    if (c.maxX - c.minX < SIGHT_SLIM && c.maxZ - c.minZ < SIGHT_SLIM) continue;
    if (c.bottom >= hiY || c.top <= loY) continue;

    let t0 = 0, t1 = 1;

    if (dx === 0) {
      if (ex <= c.minX || ex >= c.maxX) continue;
    } else {
      let a = (c.minX - ex) / dx, b = (c.maxX - ex) / dx;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 >= t1) continue;
    }

    if (dz === 0) {
      if (ez <= c.minZ || ez >= c.maxZ) continue;
    } else {
      let a = (c.minZ - ez) / dz, b = (c.maxZ - ez) / dz;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 >= t1) continue;
    }

    // How high the segment is running while it is over the footprint.
    const ya = ey + dy * t0, yb = ey + dy * t1;
    const segLo = ya < yb ? ya : yb, segHi = ya < yb ? yb : ya;
    if (segLo < c.top - SIGHT_GRAZE && segHi > c.bottom + SIGHT_GRAZE) return false;
  }
  return true;
}

/**
 * Is (x, z) inside the level's water body, `inset` metres in from its edge?
 *
 * The water was a circle for four blocks, and the test for it was written out
 * by hand in three places — twice in `crow.js` (am I swimming, and where is the
 * basin floor under me) and once in `pickups.js` (does a dropped coin land on
 * that floor). The wharf's harbour is a rectangle, so the maths moved here and
 * the three call sites read it instead.
 *
 * The `inset` is not decoration: it keeps a crow standing *on* the coping from
 * reading as being in the water, and it is the reason the number 0.7 appears in
 * every one of those call sites. Passing it explicitly rather than baking it in
 * is what lets the audit ask a slightly stricter question (0.8) about what may
 * be built in the basin.
 *
 * A level that names no shape gets the circle, so levels 1–4 take exactly the
 * expression they took before this function existed.
 *
 * **The shape describes the basin, not the waterline**, and getting that wrong
 * cost a round. On a circular pool `f.r` is the coping's centre and the stone's
 * inner face is 0.6 further in, so a 0.7 inset lands a tenth of a metre past
 * the wall — which is what keeps a crow pressed against that wall still reading
 * as *in the water*, and therefore still able to scramble out of it. A
 * rectangle whose min/max were the waterline instead put the same inset 0.7 m
 * inside the wall: a crow walking at the edge stopped being in the water while
 * it was still in the water, lost its float height, and could no longer climb
 * a coping it was touching. It is the lobster pot again, from a third
 * direction. `WATER_EDGE_PAD` is the number that keeps the two shapes saying
 * the same thing.
 */
export const WATER_EDGE_PAD = 0.6;

export function inWaterXZ(f, x, z, inset = 0.7) {
  if (f.shape === 'box') {
    return x > f.minX + inset && x < f.maxX - inset
      && z > f.minZ + inset && z < f.maxZ - inset;
  }
  return Math.hypot(x - f.x, z - f.z) < f.r - inset;
}

/** The water body's bounding rectangle, whichever shape it is. */
export function waterExtent(f) {
  if (f.shape === 'box') {
    return { minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ };
  }
  return { minX: f.x - f.r, maxX: f.x + f.r, minZ: f.z - f.r, maxZ: f.z + f.r };
}

/** Does a disc of radius `r` at (x, z) overlap this collider's footprint? */
export function overlaps(c, x, z, r = 0) {
  if (c.shape === 'ring') {
    const d = Math.hypot(x - c.cx, z - c.cz);
    return d + r > c.rInner && d - r < c.rOuter;
  }
  return x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ;
}

/**
 * Is this collider tall enough to stop someone on foot, and low enough to matter?
 *
 * `floor` is the deck the walker is standing on, and it is the whole reason a
 * level can have more than one storey. Everything here used to assume y = 0,
 * which is fine on a flat block and wrong the moment a waiter stands on a roof
 * terrace: the deck he is standing on is a 5.4m solid, so he would be permanently
 * inside a wall, unable to take a step in any direction. Measured from his own
 * floor instead, the deck is under his feet and the parapet at the edge of it is
 * still a wall. Level 1 passes 0 everywhere and is bit-for-bit unchanged.
 */
export function blocksWalker(c, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER, floor = 0) {
  return c.bottom < floor + height && c.top > floor + stepOver;
}

/** Is a disc of radius `r` at (x, z) clear of everything a walker can't cross? */
export function isFree(cols, x, z, r, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER, floor = 0) {
  for (const c of cols) {
    if (!blocksWalker(c, height, stepOver, floor)) continue;
    // A ring is a solid disc to anyone on foot — see resolveWalk.
    if (c.shape === 'ring') {
      if (Math.hypot(x - c.cx, z - c.cz) - r < c.rOuter) return false;
    } else if (overlaps(c, x, z, r)) return false;
  }
  return true;
}

/**
 * The deck a walker standing at (x, z) would be on — the highest landable top
 * at or below `from`, or 0 for the ground.
 *
 * Used to place people and to check that a placement is on a surface rather than
 * hanging in the air over the yard, which on a block with a roof on it is a
 * mistake you cannot see in a code review.
 */
export function deckAt(cols, x, z, from = Infinity, r = 0) {
  let best = 0;
  for (const c of cols) {
    if (!c.perch || c.top > from + 0.01 || c.top <= best) continue;
    if (overlaps(c, x, z, r)) best = c.top;
  }
  return best;
}

/**
 * Take one step toward (tx, tz), going round whatever is in the way. Returns
 * the side it skirted on (-1, 0 or 1), or null if it is boxed in.
 *
 * Pushing a walker back out of a solid is not enough on its own: someone
 * walking straight at a wall gets pushed straight back, and deadlocks there
 * forever. Both the waiter and the phone-starer did exactly that the first time
 * people were made solid — pinned against a café table and a plane tree
 * respectively, legs moving, going nowhere. So the step itself is steered:
 * try straight, then progressively wider deflections to either side, and take
 * the first angle that is actually free.
 */
/**
 * The angles a step may be deflected by, in order of preference.
 *
 * It stopped at 112° for as long as the only obstacles were a fountain and some
 * café tables. Skirting something wide breaks that: as the walker slides along a
 * face *away* from its target, the direction to the target keeps rotating, and
 * past the halfway point every deflection under 112° still points into the wall.
 * The committed side then has nothing free, the other side does, and the walker
 * turns round — which is the shuffle, arrived at from the opposite direction.
 * Level 2's delivery van is 7.2m across and reproduced it exactly.
 *
 * 135 and 158 are nearly sideways and nearly backwards. They are only ever
 * reached when everything gentler is blocked, and the alternative to reaching
 * them is a deadlock.
 */
const DEFLECTIONS = [22, 45, 68, 90, 112, 135, 158];
/** How far up the road to look before releasing a committed side, in metres. */
const LOOKAHEAD = 2.5;

export function stepAround(cols, pos, tx, tz, dist, r, prefer = 0,
  height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER, floor = 0) {
  const dx = tx - pos.x, dz = tz - pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;

  const at = (deg, sign) => {
    const a = ((deg * Math.PI) / 180) * sign;
    const cos = Math.cos(a), sin = Math.sin(a);
    return {
      x: pos.x + (ux * cos - uz * sin) * dist,
      z: pos.z + (ux * sin + uz * cos) * dist,
    };
  };
  const take = (p) => { pos.x = p.x; pos.z = p.z; };
  const free = (p) => isFree(cols, p.x, p.z, r, height, stepOver, floor);

  const straight = at(0, 0);
  if (free(straight)) {
    take(straight);
    if (!prefer) return 0;
    /**
     * One free step is not the same as a clear road, and treating it as one is
     * how the commitment gets thrown away at the worst possible moment.
     *
     * Skirting a wide obstacle, a walker reaches the point on its face nearest
     * the target, and there the next single step toward the target is free —
     * so the side it had committed to was released, the cost function was asked
     * again, and both ways round measured the same. It picked one, took a step,
     * was blocked, released again, picked the other. The van in level 2's yard is
     * 7.2m across and the probe starts 2.9m from it; the walker shuffled on the
     * spot for the full twenty seconds.
     *
     * So look two and a half metres up the road before letting go. Five samples,
     * only on frames where a side was already chosen, which is a small minority
     * of them.
     */
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const f = Math.min(1, ((i / steps) * LOOKAHEAD) / d);
      if (!isFree(cols, pos.x + dx * f, pos.z + dz * f, r, height, stepOver, floor)) return prefer;
    }
    return 0;
  }

  // Once a side is chosen it is held until the straight line is clear again.
  // A per-frame "whichever candidate ends up nearest the target" rule looks
  // reasonable and does not work: the walker settles on the point of the wall
  // closest to its target, where both ways round cost the same, and shuffles
  // there indefinitely. Committing is what actually gets round a corner.
  const sides = prefer ? [prefer, -prefer] : [1, -1];
  let opened = null;
  for (const sign of sides) {
    for (const deg of DEFLECTIONS) {
      const p = at(deg, sign);
      if (!free(p)) continue;
      if (prefer) { take(p); return sign; }
      // No commitment yet — weigh the first opening on each side and go the
      // way that gets nearer the target.
      const cost = deg + Math.hypot(tx - p.x, tz - p.z);
      if (!opened || cost < opened.cost) opened = { p, sign, cost };
      break;
    }
  }
  if (opened) { take(opened.p); return opened.sign; }
  return null;
}

/**
 * Push a walker out of everything solid, in place.
 *
 * Boxes resolve on the shallowest axis, so a person slides along a wall instead
 * of being flung around its corner. Rings resolve radially and, to anyone on
 * foot, are a solid disc rather than a hollow one: a person has no business
 * wading in the fountain, and treating the basin as enterable would let a chase
 * walk them into a well they have no way to climb out of.
 */
export function resolveWalk(cols, pos, r, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER, floor = 0) {
  for (const c of cols) {
    if (!blocksWalker(c, height, stepOver, floor)) continue;

    if (c.shape === 'ring') {
      const dx = pos.x - c.cx, dz = pos.z - c.cz;
      const d = Math.hypot(dx, dz);
      if (d - r >= c.rOuter) continue;
      const s = d || 1e-6;
      pos.x = c.cx + (dx / s) * (c.rOuter + r);
      pos.z = c.cz + (dz / s) * (c.rOuter + r);
      continue;
    }

    if (!overlaps(c, pos.x, pos.z, r)) continue;
    const west = pos.x + r - c.minX, east = c.maxX + r - pos.x;
    const north = pos.z + r - c.minZ, south = c.maxZ + r - pos.z;
    const least = Math.min(west, east, north, south);
    if (least === west) pos.x = c.minX - r;
    else if (least === east) pos.x = c.maxX + r;
    else if (least === north) pos.z = c.minZ - r;
    else pos.z = c.maxZ + r;
  }
}
