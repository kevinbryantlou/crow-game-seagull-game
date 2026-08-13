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
 */
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
