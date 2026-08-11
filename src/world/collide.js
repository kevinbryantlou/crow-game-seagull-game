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

/** Does a disc of radius `r` at (x, z) overlap this collider's footprint? */
export function overlaps(c, x, z, r = 0) {
  if (c.shape === 'ring') {
    const d = Math.hypot(x - c.cx, z - c.cz);
    return d + r > c.rInner && d - r < c.rOuter;
  }
  return x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ;
}

/** Is this collider tall enough to stop someone on foot, and low enough to matter? */
export function blocksWalker(c, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER) {
  return c.bottom < height && c.top > stepOver;
}

/** Is a disc of radius `r` at (x, z) clear of everything a walker can't cross? */
export function isFree(cols, x, z, r, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER) {
  for (const c of cols) {
    if (!blocksWalker(c, height, stepOver)) continue;
    // A ring is a solid disc to anyone on foot — see resolveWalk.
    if (c.shape === 'ring') {
      if (Math.hypot(x - c.cx, z - c.cz) - r < c.rOuter) return false;
    } else if (overlaps(c, x, z, r)) return false;
  }
  return true;
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
const DEFLECTIONS = [22, 45, 68, 90, 112];

export function stepAround(cols, pos, tx, tz, dist, r, prefer = 0,
  height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER) {
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
  const free = (p) => isFree(cols, p.x, p.z, r, height, stepOver);

  const straight = at(0, 0);
  if (free(straight)) { take(straight); return 0; }

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
export function resolveWalk(cols, pos, r, height = WALKER_HEIGHT, stepOver = WALKER_STEP_OVER) {
  for (const c of cols) {
    if (!blocksWalker(c, height, stepOver)) continue;

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
