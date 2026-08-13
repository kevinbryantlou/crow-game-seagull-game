/**
 * Everything scripts/smoke.mjs asserts about *a* block, run once per block.
 *
 * This was the middle four hundred lines of smoke.mjs, and it was written when
 * there was one level and the words "the block" meant something definite. The
 * checks have not changed; what has changed is that the numbers they close over
 * — the goal, the water's deck, the basin's radius — come from the level rather
 * than from a literal, and that a rule which only ever ran against the block it
 * was written for now runs against both.
 *
 * Three rules are new, and all three are the ones a level with floors needs:
 * no climb longer than a stamina bar, nothing standing in mid-air, and nobody
 * placed on a deck that is not there.
 */

import * as THREE from 'three';

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * @param {object} o
 * @param {object} o.level    the descriptor from world/levels.js
 * @param {object} o.world    the built block
 * @param {Function} o.check  (name, cond, detail) → void
 * @param {object} o.deps     the modules smoke already imported
 */
export function auditLevel({ level, world, check, deps }) {
  const {
    RULES, overlaps, blocksWalker, deckAt, WALKER_RADIUS, inWaterXZ, waterExtent,
    Crow, CROW, Human, Pigeon, Gull, Pickup, BAIT_KINDS, prepareOccluders,
  } = deps;

  const name = `L${level.id}`;
  const say = (s) => `${s} [${name}]`;

  console.log(`\n── level ${level.id}: ${level.title} (${level.district}) ──`);
  check(say('level builds'), !!world.root);
  check(say('colliders present'), world.colliders.length > 20, `(${world.colliders.length})`);
  check(say('every collider is finite'), world.colliders.every(
    (c) => [c.minX, c.maxX, c.minZ, c.maxZ, c.top, c.bottom].every(Number.isFinite)));
  check(say('nest group exists'), !!world.root.userData.nestGroup);
  check(say('water surface exists'), !!world.root.userData.fountainWater);

  // A mesh whose material has vertexColors on but whose geometry carries no
  // `color` attribute renders pure black. This is invisible to any test that
  // does not look at the actual buffers, and it silently ate most of the block.
  const blackMeshes = [];
  let meshCount = 0;
  world.root.traverse((o) => {
    if (!o.isMesh) return;
    meshCount++;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.vertexColors && !o.geometry.attributes.color) blackMeshes.push(o);
  });
  check(say('no mesh renders black from a missing color attribute'),
    blackMeshes.length === 0, `(${blackMeshes.length} of ${meshCount} meshes)`);
  console.log(`       meshes ${meshCount}, colliders ${world.colliders.length}`);

  /**
   * Every night light is attached to something that will actually be drawn.
   *
   * A light drives a material, not a mesh, so a light whose material no mesh
   * uses is silently dead — it ramps up on schedule every dusk and nothing on
   * screen changes. That is precisely what happened to level 1's café front for
   * months: `Stage.registerOccluders` clones the material of anything that has
   * to fade when it blocks the camera, and a door and three windows were both
   * a night light and an occluder, so the emissive went to an object nobody
   * had rendered since boot.
   *
   * The clone is a *caller's* doing, after the level is built, so the check has
   * to do what the caller does before it can see anything: `prepareOccluders`
   * is the real function main.js reaches through `Stage`, called here in the
   * same order and with the same arguments. Reimplementing it would produce a
   * test that agrees with itself and with nothing else. Pools are exempt — they
   * own the quad they light, and it is not in the level's mesh tree.
   */
  {
    prepareOccluders([...new Set(world.occluders.filter((o) => o && o.isMesh))], world.nightLights);

    const inUse = new Set();
    world.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) inUse.add(m);
    });
    const dead = world.nightLights.items
      .filter((i) => !i.pool && !i.materials.some((m) => inUse.has(m)))
      .map((i) => `0x${i.materials[0].color.getHexString()}`);
    check(say('every night light is on a material something actually renders'),
      dead.length === 0, `(${dead.length} orphaned: ${dead.join(', ')})`);
  }

  // ── the water ─────────────────────────────────────────────────────────────
  const F = world.fountain;
  const DECK = world.waterDeck ?? 0;
  const WX = waterExtent(F);

  /**
   * Is (x, z) within `pad` of the water's *outer* edge — would a body of that
   * radius standing here be in it? The inverse of `inWaterXZ`, which measures
   * inward from the edge; this one measures outward, and both shapes need it.
   */
  const touchesWater = (x, z, pad = 0) => (F.shape === 'box'
    ? x > WX.minX - pad && x < WX.maxX + pad && z > WX.minZ - pad && z < WX.maxZ + pad
    : Math.hypot(x - F.x, z - F.z) < F.r + pad);
  /** Clear of the basin altogether — standing on the coping counts as out. */
  const beyondWater = (x, z) => !touchesWater(x, z, 0);

  /** Does this collider's footprint reach into the basin proper? */
  const reachesWater = (c) => {
    if (F.shape === 'box') {
      return c.maxX > WX.minX + 0.8 && c.minX < WX.maxX - 0.8
        && c.maxZ > WX.minZ + 0.8 && c.minZ < WX.maxZ - 0.8;
    }
    const cx = Math.max(c.minX, Math.min(F.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(F.z, c.maxZ));
    return Math.hypot(cx - F.x, cz - F.z) < F.r - 0.8;
  };

  /**
   * "Nothing is built inside the water" used to be absolute, and it was right
   * for four blocks whose water is an ornamental basin in the middle of a floor.
   * The wharf's water is a working harbour: the pier, both floats, two boats and
   * the beacon all stand in it by definition, and a harbour with nothing in it
   * is not the thing being modelled.
   *
   * So it is a *declared* exemption now, in the same style as `hung: true` on
   * the roofline's one hanging pickup — somebody has to type `inWater: true`
   * into the level source, and the audit prints back what it was told. The rule
   * that actually protects the player is not this one anyway; it is the escape
   * grid below, which got stronger in the same edit precisely because this one
   * got weaker.
   */
  const inBasin = world.colliders.filter((c) => {
    if (c.shape === 'ring') return false;
    // Only things at the water's own height count. A terrace pool sits on top of
    // a fifty-metre building, and the building is not "inside" it.
    if (c.top <= DECK + 0.02 || c.bottom >= F.rim) return false;
    return reachesWater(c);
  });
  const undeclared = inBasin.filter((c) => !c.inWater);
  check(say('nothing undeclared is built inside the water'), undeclared.length === 0,
    `(${undeclared.length} collider(s) overlap the basin: `
    + `${undeclared.slice(0, 4).map((c) => c.tag || 'untagged').join(', ')})`);
  if (inBasin.length) {
    console.log(`       ${inBasin.length} declared structure(s) standing in the water: `
      + `${[...new Set(inBasin.map((c) => c.tag || 'untagged'))].join(', ')}`);
  }

  check(say(`nest landing surface is at least ${RULES.nestPlatformRatio}x the nest`),
    world.nestPlatform >= world.nestFootprint * RULES.nestPlatformRatio,
    `(platform ${world.nestPlatform} vs nest ${world.nestFootprint})`);

  /**
   * And nothing is standing in it.
   *
   * The nest is the one object on a block whose whole job is to be readable at a
   * glance, from the far side of the map, while something is chasing you — and
   * the fourth block put a brass wheel round it with eight spokes running
   * hub-to-rim, which photographed as a pie chart with a crow's nest underneath.
   * Nobody would write that down as a decision; it falls out of modelling the
   * thing the nest sits *on* and forgetting what sits on it.
   *
   * The column checked is the nest's own footprint, from just above its base to
   * a bird's height over it. Anything parented to the nest is exempt, because
   * banked money lives there and is supposed to.
   */
  {
    const N = world.nest;
    const nestGroup = world.root.userData.nestGroup;
    const inNest = new Set();
    nestGroup?.traverse((o) => inNest.add(o));
    const rad = world.nestFootprint / 2;
    const bb = new THREE.Box3();
    const over = [];
    world.root.updateMatrixWorld(true);

    /**
     * A bounding box is the wrong shape to ask this question with, and it took
     * one run to find out: the AABB of a torus covers its own hole, so a brass
     * rim *around* the nest reports as sitting *on* it, and the AABB of a bar
     * rotated 45° reaches a quarter of a metre past either end of the bar.
     * Both are false positives and both would have been "fixed" by moving
     * geometry that was already fine.
     *
     * So the box is only the cheap reject. What decides it is the geometry:
     * every triangle edge, in world space, sampled along its length — which
     * catches the case an AABB would miss as well as the two it invents,
     * namely a beam long enough to span the column with both ends outside it.
     */
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vp = new THREE.Vector3();
    const crosses = (o) => {
      const pos = o.geometry.attributes.position;
      if (!pos) return false;
      const idx = o.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        for (let e = 0; e < 3; e++) {
          const ia = idx ? idx.getX(i + e) : i + e;
          const ib = idx ? idx.getX(i + (e + 1) % 3) : i + (e + 1) % 3;
          va.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
          vb.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
          for (let t = 0; t <= 1; t += 1 / 12) {
            vp.lerpVectors(va, vb, t);
            if (vp.y > N.y + 0.03 && vp.y < N.y + 1.2
              && Math.hypot(vp.x - N.x, vp.z - N.z) < rad) return true;
          }
        }
      }
      return false;
    };

    world.root.traverse((o) => {
      if (!o.isMesh || inNest.has(o)) return;
      bb.setFromObject(o);
      if (bb.max.y < N.y + 0.03 || bb.min.y > N.y + 1.2) return;
      if (bb.max.x < N.x - rad || bb.min.x > N.x + rad) return;
      if (bb.max.z < N.z - rad || bb.min.z > N.z + rad) return;
      if (!crosses(o)) return;
      over.push(`${o.geometry.type} at (${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)})`);
    });
    check(say('nothing overlaps the nest'), over.length === 0,
      `(${[...new Set(over)].join('; ')})`);
  }

  // ── pickups ───────────────────────────────────────────────────────────────
  const pickups = world.pickups.map((s) => new Pickup(s));
  check(say('all pickups construct'), pickups.length === world.pickups.length, `(${pickups.length})`);
  check(say('every pickup has a label'),
    pickups.every((p) => typeof p.label === 'string' && p.label.length));
  // The style guide's rule: a thing you can take is the only thing that glints.
  // The bait is not money but it is takeable, and it is the key to the level's
  // set piece — without a glint the player cannot tell the puzzle is there.
  check(say('every takeable pickup carries a glint'), pickups.every((p) => !!p.glint),
    `(missing: ${pickups.filter((p) => !p.glint).map((p) => p.kind).join(', ') || 'none'})`);
  // Read off the pickup vocabulary rather than naming the two kinds that
  // existed when this was written. The park's pretzel is the third, and a rule
  // that has to be edited to notice a new block is not a rule.
  const bait = pickups.filter((p) => BAIT_KINDS.has(p.kind));
  check(say('the level has exactly one piece of bait, and it glints'),
    bait.length === 1 && !!bait[0].glint, `(${bait.length})`);

  // Two takeables inside one beak-length are one ambiguous target — the cart had
  // three, which made grabbing the thing you actually wanted a lucky dip.
  const tooClose = [];
  for (let i = 0; i < pickups.length; i++) {
    for (let j = i + 1; j < pickups.length; j++) {
      const a = pickups[i].home, b = pickups[j].home;
      const d = a.distanceTo(b);
      // Loose change piles and scattered coins are meant to read as one heap.
      const heap = pickups[i].kind === pickups[j].kind
        && ['penny', 'nickel', 'dime', 'quarter', 'bill1'].includes(pickups[i].kind);
      if (d < RULES.minPickupSeparation && !heap) {
        tooClose.push(`${pickups[i].label}/${pickups[j].label} ${d.toFixed(2)}`);
      }
    }
  }
  check(say('no two distinct pickups sit within one beak-length'), tooClose.length === 0,
    `(${tooClose.join('; ')})`);

  // A pickup inside a collider's blocking volume cannot be reached at all.
  const buried = pickups.filter((p) => world.colliders.some((c) =>
    overlaps(c, p.home.x, p.home.z)
      && p.home.y > c.bottom + 0.02 && p.home.y < c.top - 0.02));
  check(say('no pickup is buried inside solid geometry'), buried.length === 0,
    `(${buried.map((p) => p.label).join(', ')})`);

  /**
   * Rule 11, and the one a block with floors is going to break.
   *
   * Every pickup has to be sitting on something. On one flat level this was
   * unfalsifiable — y was 0.06 and the floor was 0 — and the moment there are
   * four decks it becomes the easiest mistake in the file: write a terrace
   * coordinate, forget to add DECK.terrace to it, and the coin hangs in the air
   * over the yard with nothing under it and no way to tell from the source.
   *
   * Coins in the water are exempt; they rest on a basin floor that is not a
   * collider. So is anything the level explicitly declares as hung on
   * something — the ten in the vendor's apron pocket, and nothing else.
   */
  const floating = [];
  for (const p of pickups) {
    if (p.inWater || p.inJar || p.hung) continue;
    const under = deckAt(world.colliders, p.home.x, p.home.z, p.home.y - 0.005);
    if (p.home.y - under > 0.4) {
      floating.push(`${p.label} at y ${p.home.y.toFixed(2)} over a floor at ${under.toFixed(2)}`);
    }
  }
  check(say('every pickup is resting on something'), floating.length === 0,
    `(${floating.join('; ')})`);

  /**
   * The camera never rotates, so whether a pickup can be seen is a fixed property
   * of where it sits — not something that varies with play. Cast a ray from each
   * pickup along the one sightline the game ever uses (38 deg pitch, 25 deg yaw)
   * and see whether solid, non-fading geometry stands in the way.
   */
  const PITCH = (38 * Math.PI) / 180, YAW = (25 * Math.PI) / 180;
  const toCamera = new THREE.Vector3(
    Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH),
  ).normalize();

  // Raycasting reads matrixWorld, which is only refreshed during a render. With
  // no renderer here it has to be done by hand, or every hit is computed against
  // an identity transform and the results are quietly meaningless.
  world.root.updateMatrixWorld(true);

  const fading = new Set(world.occluders.filter(Boolean));
  const opaque = [];
  world.root.traverse((o) => {
    if (!o.isMesh || fading.has(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.transparent && m.opacity < 0.9) return;
    opaque.push(o);
  });

  const ray = new THREE.Raycaster();
  ray.far = 60;
  const hidden = [];
  for (const p of pickups) {
    const from = p.home.clone().addScaledVector(toCamera, 0.06);
    ray.set(from, toCamera);
    const hit = ray.intersectObjects(opaque, false);
    if (hit.length) {
      const o = hit[0].object.getWorldPosition(new THREE.Vector3());
      hidden.push(`${p.label} at (${p.home.x.toFixed(1)}, ${p.home.y.toFixed(1)}, ${p.home.z.toFixed(1)})`
        + ` behind ${hit[0].object.geometry.type} at (${o.x.toFixed(1)}, ${o.y.toFixed(1)}, ${o.z.toFixed(1)})`);
    }
  }
  check(say('no pickup is hidden from the fixed camera'), hidden.length === 0,
    `(${hidden.join('; ')})`);

  // ── the economy ───────────────────────────────────────────────────────────
  const GOAL = level.goal;
  const money = pickups.reduce((a, p) => a + p.value, 0);
  const free = pickups.filter((p) => !p.owner && !p.inWater && p.value > 0)
    .reduce((a, p) => a + p.value, 0);
  const guarded = pickups.filter((p) => p.owner).reduce((a, p) => a + p.value, 0);
  console.log(`       goal $${GOAL.toFixed(2)}  ·  on the block $${money.toFixed(2)}`
    + `  ·  unguarded + dry $${free.toFixed(2)}  ·  guarded $${guarded.toFixed(2)}`);
  check(say(`more money exists than the $${GOAL} goal`), money > GOAL, `($${money.toFixed(2)})`);
  check(say(`unguarded money alone cannot reach $${GOAL}`), free < GOAL, `($${free.toFixed(2)})`);
  check(say('the endgame must be the guarded stretch'), guarded > money - GOAL,
    `(guarded $${guarded.toFixed(2)} vs slack $${(money - GOAL).toFixed(2)})`);

  /**
   * Trading can soften the level. It must never replace it.
   *
   * The kid's ladder is per-level now, because what a trade is worth depends on
   * what it costs to make one — level 2's kid sits on a roof edge between two
   * guards and pays half again what the block's does. That is a knob with an
   * obvious failure mode: pay enough and the honest route beats the dishonest
   * one, and a game about robbing a hot dog vendor becomes a game about finding
   * bottle caps.
   *
   * So the bound is stated rather than eyeballed: everything you can pick up
   * without crossing anybody, plus every trade the kid will ever make, still has
   * to fall short of the goal.
   */
  const shinies = pickups.filter((p) => p.kind === 'shiny').length;
  const ladder = level.tradeValues;
  const trades = Array.from({ length: shinies },
    (_, i) => ladder[Math.min(i, ladder.length - 1)]).reduce((a, b) => a + b, 0);
  check(say('unguarded money plus every trade still cannot reach the goal'),
    free + trades < GOAL,
    `($${free.toFixed(2)} free + $${trades.toFixed(2)} from ${shinies} trades vs $${GOAL})`);
  console.log(`       ${shinies} shinies pay up to $${trades.toFixed(2)}`
    + `  ·  free + trades $${(free + trades).toFixed(2)} of $${GOAL.toFixed(2)}`);

  /**
   * Rule 9: no climb longer than a stamina bar.
   *
   * For every pickup and for the nest, find the highest thing you could have
   * been standing on within six metres horizontally, and measure the gap. Six
   * metres because a climbing crow moves sideways while it climbs; the ground
   * always counts, so this can only ever fail on something genuinely high with
   * nothing underneath it.
   */
  const climbTo = (x, y, z) => {
    let best = 0;
    for (const c of world.colliders) {
      if (!c.perch || c.top >= y - 0.05) continue;
      const dx = Math.max(c.minX - x, 0, x - c.maxX);
      const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
      if (Math.hypot(dx, dz) <= 6 && c.top > best) best = c.top;
    }
    return y - best;
  };
  const climbs = [];
  for (const p of pickups) {
    const h = climbTo(p.home.x, p.home.y, p.home.z);
    if (h > RULES.maxUnbrokenClimb) climbs.push(`${p.label} ${h.toFixed(1)}m`);
  }
  const toNest = climbTo(world.nest.x, world.nest.y, world.nest.z);
  if (toNest > RULES.maxUnbrokenClimb) climbs.push(`the nest ${toNest.toFixed(1)}m`);
  check(say(`nothing is more than ${RULES.maxUnbrokenClimb}m of unbroken climb`),
    climbs.length === 0, `(${climbs.join('; ')})`);
  console.log(`       tallest climb to the nest ${toNest.toFixed(1)}m`
    + ` (a full bar buys ~${(CROW.FLAP_MAX_RISE / 0.42).toFixed(0)}m)`);

  // ── the cast ──────────────────────────────────────────────────────────────
  const humans = world.humans.map((s) => new Human(s));
  check(say('all humans construct'), humans.length === world.humans.length);
  check(say('exactly one kid'), humans.filter((h) => h.kid).length === 1);
  check(say('the bait guard exists and owns the biggest thing on the block'),
    (() => {
      const guard = humans.find((h) => h.id === level.bait.guard);
      if (!guard) return false;
      const dearest = pickups.reduce((a, b) => (b.value > a.value ? b : a));
      return dearest.owner === guard.id;
    })(),
    `(guard ${level.bait.guard})`);

  const pigeons = (world.pigeons || []).map((s) => new Pigeon(s.x, s.z, s.y ?? 0));
  const gulls = (world.gulls || []).map((s) => new Gull(s.x, s.z, s.y ?? 0));
  check(say('birds construct'), pigeons.every((p) => !!p.root) && gulls.every((g) => !!g.root),
    `(${pigeons.length} pigeons, ${gulls.length} gulls)`);

  const stage = {
    basis: () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) }),
  };
  const crow = new Crow(stage);
  crow.pos.set(...level.spawn);
  check(say('crow constructs'), !!crow.root);
  check(say('beak resolves to a world point'), finite(crow.beakWorld));
  check(say('the crow spawns on a surface, not in the air or in a wall'),
    Math.abs(level.spawn[1] - deckAt(world.colliders, level.spawn[0], level.spawn[2], level.spawn[1] + 0.05)) < 0.35
      && !world.colliders.some((c) => blocksWalker(c, 0.7, 0.05, level.spawn[1])
        && overlaps(c, level.spawn[0], level.spawn[2], 0.34)),
    `(spawn ${level.spawn.join(', ')})`);

  // ── the water, as a room with a door in the ceiling ───────────────────────
  const audio = new Proxy({}, { get: () => () => {} });
  {
    const dry = { move: { x: 0, y: 0 }, flap: false };
    // Far enough out to build up speed, near enough to still be on the deck the
    // pool sits on. On the block that is eight metres of open plaza; on the
    // terrace it is however much roof there is round a three-metre pool.
    const approach = Math.min(8, F.shape === 'box' ? 3.2 : F.r + 2.3);
    /** Somewhere a crow could actually be standing before it walks at the rim. */
    const standable = (x, z) => !world.colliders.some(
      (c) => blocksWalker(c, 0.7, 0.05, DECK) && overlaps(c, x, z, 0.34));

    /**
     * Where to walk at the water from, and which way.
     *
     * A circle has one answer — outward from the middle, every two degrees. A
     * rectangle has four sides, so it is sampled along each of them with the
     * approach run laid perpendicular to that side. Starts that land inside
     * something get dropped rather than counted, because a crow cannot walk at
     * the harbour from inside the ice house; the count is asserted afterwards so
     * that dropping them all can never read as a pass.
     */
    const rimRuns = [];
    if (F.shape === 'box') {
      const sides = [
        { nx: 0, nz: 1, along: 'x', at: WX.maxZ },   // the near edge
        { nx: 0, nz: -1, along: 'x', at: WX.minZ },
        { nx: 1, nz: 0, along: 'z', at: WX.maxX },
        { nx: -1, nz: 0, along: 'z', at: WX.minX },
      ];
      for (const s of sides) {
        const lo = s.along === 'x' ? WX.minX : WX.minZ;
        const hi = s.along === 'x' ? WX.maxX : WX.maxZ;
        for (let t = lo + 1.2; t <= hi - 1.2; t += 1.5) {
          const ex = s.along === 'x' ? t : s.at;
          const ez = s.along === 'x' ? s.at : t;
          rimRuns.push({
            x: ex + s.nx * approach, z: ez + s.nz * approach,
            dx: -s.nx, dz: -s.nz, label: `(${ex.toFixed(0)}, ${ez.toFixed(0)})`,
          });
        }
      }
    } else {
      for (let deg = 0; deg < 360; deg += 2) {
        const a = (deg * Math.PI) / 180;
        rimRuns.push({
          x: F.x + Math.cos(a) * approach, z: F.z + Math.sin(a) * approach,
          dx: -Math.cos(a), dz: -Math.sin(a), label: `${deg}°`,
        });
      }
    }

    const leaks = [];
    let rimRan = 0;
    for (const run of rimRuns) {
      if (!standable(run.x, run.z)) continue;
      rimRan++;
      const c = new Crow(stage);
      c.pos.set(run.x, DECK, run.z);
      // `move.y` is the -z axis of the input basis, hence the sign.
      dry.move.x = run.dx; dry.move.y = -run.dz;
      for (let i = 0; i < 60 * 8 && !c.inWater; i++) c.update(1 / 60, dry, world, audio);
      if (c.inWater) leaks.push(run.label);
    }
    check(say('the rim is a wall at every heading — you go in over the top, not through'),
      leaks.length === 0, `(walked straight in at ${leaks.length}: ${leaks.slice(0, 8).join(', ')})`);
    check(say('the rim test had somewhere to walk at the water from'), rimRan >= 24,
      `(${rimRan} of ${rimRuns.length} approaches were on standable ground)`);

    /**
     * The ratio that was the actual bug. A flap only lifts the crow if it
     * out-accelerates gravity; at the old WATER_FLAP it did not, and escape
     * depended on catching the right phase of the bob.
     */
    check(say('a flap in water out-accelerates gravity'),
      CROW.FLAP_ACCEL * CROW.WATER_FLAP > CROW.GRAVITY,
      `(${(CROW.FLAP_ACCEL * CROW.WATER_FLAP).toFixed(1)} vs ${CROW.GRAVITY}, `
      + `need WATER_FLAP > ${(CROW.GRAVITY / CROW.FLAP_ACCEL).toFixed(3)})`);

    /**
     * Both input modes, because they fail differently, and from an empty bar,
     * because that is the state a player is actually in by the time they decide
     * the water is broken.
     */
    /**
     * Every square of open water, rather than three radii out from the middle.
     *
     * The old sampling — 8 headings × 3 radii — is complete for an empty
     * circular basin and says nothing at all about a harbour with a pier, two
     * boats and a beacon standing in it. Now that a level may *declare*
     * structures inside the water, the escape test is the thing standing between
     * that permission and a lobster pot, so it walks a grid, drops the cells
     * that are inside a declared solid, and requires every one that is left.
     *
     * The exact centre is always sampled whatever the grid lands on, because
     * that is where the lobby's fountain-centrepiece trap was caught.
     */
    const blocked = (x, z) => world.colliders.some(
      (c) => c.top > F.floor + 0.05 && c.bottom < F.rim + 0.1 && overlaps(c, x, z, 0.34));
    const step = F.shape === 'box' ? 3.0 : Math.max(1.2, F.r * 0.42);
    const openCells = [];
    for (let x = WX.minX + step / 2; x < WX.maxX; x += step) {
      for (let z = WX.minZ + step / 2; z < WX.maxZ; z += step) {
        if (!inWaterXZ(F, x, z) || blocked(x, z)) continue;
        openCells.push({ x, z });
      }
    }
    if (!blocked(F.x, F.z) && inWaterXZ(F, F.x, F.z)) openCells.push({ x: F.x, z: F.z });
    check(say('the escape test found open water to check'), openCells.length >= 4,
      `(${openCells.length} cell(s))`);

    const escape = (startStamina, mode) => {
      const stuck = [];
      for (const cell of openCells) {
        const c = new Crow(stage);
        c.pos.set(cell.x, F.floor, cell.z);
        c.stamina = startStamina;
        let out = false;
        for (let i = 0; i < 60 * 12; i++) {
          // 5 frames down, 7 up — roughly a 90 ms tap at 5 per second.
          const flap = mode === 'hold' ? true : (i % 12) < 5;
          c.update(1 / 60, { move: { x: 0, y: 0 }, flap }, world, audio);
          if (c.pos.y > F.rim + 0.25) { out = true; break; }
        }
        if (!out) stuck.push(`(${cell.x.toFixed(1)}, ${cell.z.toFixed(1)})`);
      }
      return stuck;
    };

    for (const [label, stamina, mode] of [
      ['holding flap, full bar', 1.0, 'hold'],
      ['holding flap, empty bar', 0, 'hold'],
      ['tapping flap, full bar', 1.0, 'tap'],
      ['tapping flap, empty bar', 0, 'tap'],
    ]) {
      const stuck = escape(stamina, mode);
      check(say(`a crow in the water gets out — ${label}`),
        stuck.length === 0, `(stuck at ${stuck.join(', ')})`);
    }

    /**
     * And the third way out, which needs no technique at all: walk at the wall.
     *
     * From every open cell, headed at the nearest edge. "Out" is standing on the
     * coping or past it — height alone will not do, because the land outside a
     * basin is *below* its rim, so a crow that has genuinely walked out onto the
     * quay is lower than the wall it climbed.
     */
    const escaped = (c) => !c.inWater
      && (c.pos.y >= F.rim - 0.02 || beyondWater(c.pos.x, c.pos.z));
    const nearestEdge = (x, z) => {
      if (F.shape !== 'box') {
        const d = Math.hypot(x - F.x, z - F.z);
        // Dead centre has no outward direction, and asking for one gives (0, 0)
        // — a crow told to walk nowhere, which reads as a trapped crow. Any
        // heading is the right answer from the middle of a circle.
        if (d < 1e-6) return { x: 1, z: 0 };
        return { x: (x - F.x) / d, z: (z - F.z) / d };
      }
      const d = [
        { x: -1, z: 0, gap: x - WX.minX }, { x: 1, z: 0, gap: WX.maxX - x },
        { x: 0, z: -1, gap: z - WX.minZ }, { x: 0, z: 1, gap: WX.maxZ - z },
      ].sort((a, b) => a.gap - b.gap)[0];
      return { x: d.x, z: d.z };
    };

    const walkOut = [];
    for (const cell of openCells) {
      const c = new Crow(stage);
      c.pos.set(cell.x, F.floor, cell.z);
      const n = nearestEdge(cell.x, cell.z);
      const move = { x: n.x, y: -n.z };   // straight at the nearest rim
      let out = false;
      for (let i = 0; i < 60 * 12; i++) {
        c.update(1 / 60, { move, flap: false }, world, audio);
        if (escaped(c)) { out = true; break; }
      }
      if (!out) walkOut.push(`(${cell.x.toFixed(1)}, ${cell.z.toFixed(1)})`);
    }
    check(say('a crow in the water can simply walk out, no flapping at all'),
      walkOut.length === 0, `(stuck at ${walkOut.join(', ')})`);

    // Regen is the whole fix, so state the rate rather than just the outcome.
    const floater = new Crow(stage);
    floater.pos.set(F.x, F.floor, F.z);
    floater.stamina = 0;
    for (let i = 0; i < 60; i++) floater.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, world, audio);
    check(say('a second of floating gets most of the bar back'),
      floater.stamina > 0.5, `(${floater.stamina.toFixed(2)} after 1s)`);

    const bobber = new Crow(stage);
    bobber.pos.set(F.x + F.r * 0.4, F.floor, F.z);
    let lo = Infinity, hi = -Infinity, bobs = 0, prevVel = 0;
    for (let i = 0; i < 60 * 6; i++) {
      bobber.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, world, audio);
      if (i < 60) continue;                       // let it settle
      lo = Math.min(lo, bobber.pos.y);
      hi = Math.max(hi, bobber.pos.y);
      if (prevVel < 0 && bobber.vel.y >= 0) bobs++;
      prevVel = bobber.vel.y;
    }
    check(say('a crow left in the water still bobs'),
      hi - lo > 0.15 && bobs >= 4,
      `(${(hi - lo).toFixed(2)}m over ${bobs} bobs in 5s)`);

    /**
     * And the trap a raised pool sets that a ground-level one cannot.
     *
     * `inWater` used to be "inside the ring and below the surface", which is
     * true of the entire column of air under a pool that is five metres up. A
     * crow in the yard would have been swimming.
     */
    if (DECK > 1) {
      const below = new Crow(stage);
      below.pos.set(F.x, 0, F.z);
      below.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, world, audio);
      check(say('a crow far below a raised pool is not in it'), below.inWater === false);
    }
  }

  /**
   * Nothing may move the crow further in one frame than it could fly.
   *
   * This is the "clipping through the fire escape" report, made falsifiable. The
   * lateral collision passes used to resolve *any* footprint overlap they could
   * see, on both axes, ejecting toward whichever face the sign of the velocity
   * implied — so a crow flying straight at a stack of thin platforms was thrown
   * sideways by up to 3.2m, sometimes clean through the edge of the block.
   *
   * Three separate faults, all of which only show up on geometry with air
   * underneath it: resolve the nearer face rather than the signed one, resolve
   * only the axis that actually caused the overlap, and bonk the crow's head
   * before the lateral passes rather than after them.
   *
   * Aimed at the things that can be flown under — anything whose `bottom` is off
   * the floor — because those are the only shapes that can produce it.
   */
  {
    const overhangs = world.colliders.filter((c) => c.shape !== 'ring' && c.bottom > 0.01
      && c.top - c.bottom < 2.0 && c.maxX - c.minX < 30);
    const MAX_STEP = 0.55;           // a scramble is the largest legitimate jump
    const jumps = [];
    // A start point has to be somewhere the crow could actually be. Flying at a
    // sun lounger on a roof terrace from four metres away and one metre down
    // starts you inside the building the terrace is on top of, and being pushed
    // out of that is correct behaviour rather than a bug.
    const embedded = (x, y, z) => world.colliders.some((c) => c.shape !== 'ring'
      && y > c.bottom + 0.02 && y < c.top - 0.02
      && x + 0.34 > c.minX && x - 0.34 < c.maxX && z + 0.34 > c.minZ && z - 0.34 < c.maxZ);
    for (const c of overhangs.slice(0, 24)) {
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      const reach = Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 3;
      for (const dy of [-1.1, -0.4, 0.15]) {
        for (let deg = 0; deg < 360 && jumps.length < 6; deg += 45) {
          const a = (deg * Math.PI) / 180;
          const sx = cx + Math.cos(a) * reach;
          const sy = Math.max(0, c.bottom + dy);
          const sz = cz + Math.sin(a) * reach;
          if (embedded(sx, sy, sz)) continue;
          const k = new Crow(stage);
          k.pos.set(sx, sy, sz);
          const move = { x: -Math.cos(a), y: Math.sin(a) };
          const prev = k.pos.clone();
          for (let i = 0; i < 150; i++) {
            k.update(1 / 60, { move, flap: i % 20 < 9 }, world, audio);
            const d = k.pos.distanceTo(prev);
            if (d > MAX_STEP) {
              jumps.push(`${d.toFixed(1)}m at (${k.pos.x.toFixed(1)}, ${k.pos.y.toFixed(1)}, `
                + `${k.pos.z.toFixed(1)}) flying at the solid on ${cz.toFixed(1)}/${c.top.toFixed(1)}`);
              break;
            }
            prev.copy(k.pos);
          }
        }
      }
    }
    check(say(`nothing shoves the crow more than ${MAX_STEP}m in a frame`),
      jumps.length === 0, `(${overhangs.length} overhangs; ${jumps.join('; ')})`);
  }

  /**
   * Anything lying flat on top of something else declares itself a decal.
   *
   * The paving variation sits twelve millimetres above the ground it covers.
   * That is ample at the near plane and nothing like enough sixty metres out at
   * a grazing angle: the boundary breaks into a staircase of depth-test coin
   * flips, and it was reported twice as "textures clipping into one another".
   * `polygonOffset` fixes it because it scales with the polygon's own depth
   * slope, which is the term that blows up here — but only on materials that ask
   * for it, and asking is one word that is easy to leave out on the next slab.
   *
   * Additive light pools are exempt: they write no depth, so they cannot fight
   * for it.
   */
  {
    const v = new THREE.Vector3();
    const flat = [];
    world.root.traverse((o) => {
      if (!o.isMesh || o.geometry.type !== 'PlaneGeometry') return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.depthWrite === false) return;
      o.getWorldPosition(v);
      const under = deckAt(world.colliders, v.x, v.z, v.y - 0.001);
      const gap = v.y - under;
      if (gap > 0.001 && gap < 0.3 && !m.polygonOffset) {
        flat.push(`plane at y ${v.y.toFixed(3)} over ${under.toFixed(2)}`);
      }
    });
    check(say('every plane lying on another surface is a depth decal'),
      flat.length === 0, `(${flat.join('; ')})`);
  }

  /**
   * And no two of them overlap at the same height.
   *
   * This is the one that actually mattered, and it took three rounds to find
   * because the symptom is identical to every other depth complaint. Three
   * paving patches shared y = 0.012 and two of them were crossed by a 64 x 4
   * strip running along the building: at *identical* depth the winner is a coin
   * flip per pixel, and it drew a staircase down the whole frontage.
   *
   * `polygonOffset` cannot fix that — it nudges every decal by the same amount
   * and leaves them exactly as coplanar with each other as they were, which is
   * precisely why the first fix looked right and changed nothing. Heights are
   * assigned in add order by `addDecal`; this checks the result rather than
   * trusting the habit.
   */
  {
    const v = new THREE.Vector3();
    const decals = [];
    world.root.traverse((o) => {
      if (!o.isMesh || o.geometry.type !== 'PlaneGeometry') return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.depthWrite === false || !m.polygonOffset) return;
      o.getWorldPosition(v);
      o.geometry.computeBoundingBox();
      const size = o.geometry.boundingBox.getSize(new THREE.Vector3());
      decals.push({ y: v.y, x: v.x, z: v.z, w: size.x, d: size.z });
    });
    const coplanar = [];
    for (let i = 0; i < decals.length; i++) {
      for (let j = i + 1; j < decals.length; j++) {
        const a = decals[i], b = decals[j];
        if (Math.abs(a.y - b.y) > 0.0015) continue;
        if (Math.abs(a.x - b.x) * 2 >= a.w + b.w) continue;
        if (Math.abs(a.z - b.z) * 2 >= a.d + b.d) continue;
        coplanar.push(`two patches overlap at y ${a.y.toFixed(3)}`);
      }
    }
    check(say('no two ground decals overlap at the same height'),
      coplanar.length === 0, `(${[...new Set(coplanar)].join('; ')})`);

    /**
     * And every light pool floats above every decal it lands on.
     *
     * A pool writes no depth and a decal does, so a decal sitting higher than a
     * pool *clips* it — the pool draws on the paving and disappears on the
     * apron, with a hard straight edge where one patch meets the next. It looks
     * like the floor has gone glossy in patches, which is how it was reported.
     *
     * The trap is that it depends on the decal *count*: `addDecal` stacks them
     * 4 mm apart, so a block is fine at nine decals and broken at thirteen, and
     * the block that breaks is not the one anybody changed. Hence a rule rather
     * than headroom.
     */
    /**
     * Pools are identified by what makes them pools — additive, no depth write —
     * and *not* by their geometry type, which is the mistake this check made on
     * the day it was written. It filtered on `PlaneGeometry`; a performance pass
     * changed pools to `CircleGeometry` to stop shading four transparent
     * corners, and the check went from asserting a real thing to finding zero
     * pools and passing. It printed "0 light pools" on all four blocks and
     * nobody would have read it.
     *
     * Hence the count assertion below as well: a rule that can quietly end up
     * with nothing to check is not a rule.
     */
    const pools = [];
    world.root.traverse((o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!o.isMesh || !m || m.depthWrite !== false || m.blending !== THREE.AdditiveBlending) return;
      o.getWorldPosition(v);
      o.geometry.computeBoundingBox();
      const size = o.geometry.boundingBox.getSize(new THREE.Vector3());
      pools.push({ y: v.y, x: v.x, z: v.z, w: size.x, d: size.z });
    });
    const clipped = [];
    for (const pool of pools) {
      for (const d of decals) {
        if (d.y <= pool.y) continue;
        if (Math.abs(d.x - pool.x) * 2 >= d.w + pool.w) continue;
        if (Math.abs(d.z - pool.z) * 2 >= d.d + pool.d) continue;
        clipped.push(`a pool at y ${pool.y.toFixed(3)} under a decal at ${d.y.toFixed(3)}`);
      }
    }
    check(say('the pool check actually found some pools'), pools.length > 0,
      `(${pools.length})`);
    check(say('every light pool floats above the decals it lands on'),
      clipped.length === 0, `(${[...new Set(clipped)].join('; ')})`);
    console.log(`       ${decals.length} ground decals, ${pools.length} light pools`);
  }

  /**
   * Nothing is standing in the block's edge kerb.
   *
   * A bin was, on level 2, half-sunk into the kerb along the near edge — which
   * is invisible in the source (they are twenty metres apart in the file) and
   * obvious in a screenshot. The kerb is the one collider on a block that runs
   * its whole length, so anything careless near the front edge ends up inside
   * it; that makes it worth a check rather than a habit.
   */
  {
    const kerb = world.colliders.find((c) => c.tag === 'edge-kerb');
    const inKerb = !kerb ? [] : world.colliders.filter((c) => c !== kerb
      && c.shape !== 'ring' && c.top > 0.05 && c.bottom < kerb.top
      && c.perch !== false                          // not the invisible bounds
      && c.maxX - c.minX < 40 && c.maxZ - c.minZ < 40
      && c.minX < kerb.maxX && c.maxX > kerb.minX
      && c.minZ < kerb.maxZ && c.maxZ > kerb.minZ)
      .map((c) => `(${((c.minX + c.maxX) / 2).toFixed(1)}, ${((c.minZ + c.maxZ) / 2).toFixed(1)})`);
    check(say('nothing is standing in the edge kerb'), inKerb.length === 0, `(${inKerb.join('; ')})`);
  }

  // ── where people stand ────────────────────────────────────────────────────
  const solidTo = (floor) => world.colliders.filter((c) => blocksWalker(c, undefined, undefined, floor));
  const inside = (x, z, floor = 0) =>
    solidTo(floor).filter((c) => overlaps(c, x, z, WALKER_RADIUS));

  const embedded = world.humans
    .filter((h) => inside(h.pos[0], h.pos[2], h.pos[1] || 0).length)
    .map((h) => `${h.id} at (${h.pos[0]}, ${h.pos[2]}) on deck ${h.pos[1] || 0}`);
  check(say('no one spawns inside solid geometry'), embedded.length === 0, `(${embedded.join('; ')})`);

  /**
   * Rule 11 again, for people. A human's y is authored, not derived — they never
   * fall — so a maître d' written onto a deck that is not under him stands in
   * the air over a yard, working normally, for the whole session.
   */
  const midair = world.humans
    .filter((h) => Math.abs((h.pos[1] || 0) - deckAt(world.colliders, h.pos[0], h.pos[2], (h.pos[1] || 0) + 0.05)) > 0.3)
    .map((h) => `${h.id} on ${h.pos[1] || 0}, floor is ${deckAt(world.colliders, h.pos[0], h.pos[2], (h.pos[1] || 0) + 0.05).toFixed(2)}`);
  check(say('everyone is standing on a deck that exists'), midair.length === 0, `(${midair.join('; ')})`);

  const badBirds = [...(world.gulls || []), ...(world.pigeons || [])]
    .filter((b) => Math.abs((b.y ?? 0) - deckAt(world.colliders, b.x, b.z, (b.y ?? 0) + 0.05)) > 0.3)
    .map((b) => `(${b.x}, ${b.z}) on ${b.y ?? 0}`);
  check(say('every bird is standing on a deck that exists'), badBirds.length === 0,
    `(${badBirds.join('; ')})`);

  const badWaypoints = [];
  for (const h of world.humans) {
    for (const [x, z] of h.patrol || []) {
      if (inside(x, z, h.pos[1] || 0).length) badWaypoints.push(`${h.id} → (${x}, ${z})`);
    }
  }
  check(say('no patrol waypoint sits inside solid geometry'), badWaypoints.length === 0,
    `(${badWaypoints.join('; ')})`);

  // Collision stops people wading, but a route that walks into the water every
  // lap only trades a person in it for a person grinding along a wall.
  const wading = [];
  for (const h of world.humans) {
    if (!h.patrol || Math.abs((h.pos[1] || 0) - DECK) > 0.5) continue;
    for (let i = 0; i < h.patrol.length; i++) {
      const [ax, az] = h.patrol[i];
      const [bx, bz] = h.patrol[(i + 1) % h.patrol.length];
      for (let t = 0; t <= 1; t += 0.004) {
        if (touchesWater(ax + (bx - ax) * t, az + (bz - az) * t, WALKER_RADIUS)) {
          wading.push(`${h.id} leg ${i}`); break;
        }
      }
    }
  }
  check(say('no patrol route walks through the water'), wading.length === 0,
    `(${[...new Set(wading)].join('; ')})`);

  /**
   * Chases cannot be authored around anything: SHOOING steers straight at the
   * crow, and the crow can stand behind whatever it likes. So a walker has to be
   * able to get to a point on the far side of every large solid it shares a deck
   * with.
   */
  {
    const stranded = [];
    for (const [label, floor, from, to] of level.chaseProbes(world)) {
      const walker = new Human({
        id: 'probe', cloth: 0, skin: 0, hair: 0,
        pos: [from[0], floor, from[1]], home: [from[0], floor, from[1]], patrol: null,
        speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1, guardRadius: 0, alertness: 0,
      });
      walker._cols = world.colliders;
      const target = new THREE.Vector3(to[0], 0, to[1]);
      let arrived = false;
      for (let i = 0; i < 60 * 20 && !arrived; i++) {
        walker._moveToward(target, 1 / 60, 4.0);
        arrived = Math.hypot(walker.pos.x - to[0], walker.pos.z - to[1]) < 0.9;
      }
      if (!arrived) stranded.push(`${label} (gave up at ${walker.pos.x.toFixed(1)}, ${walker.pos.z.toFixed(1)})`);
    }
    check(say('a chase can get round every large solid on its own deck'),
      stranded.length === 0, `(${stranded.join('; ')})`);
  }

  /**
   * The set piece has to be possible. There must be somewhere the player can
   * actually put the bait: on the deck the level requires, far enough from what
   * it guards, inside the block, and not inside a wall.
   */
  {
    const b = level.bait;
    const anchor = b.anchor(world);
    const deck = b.deck ?? 0;
    let spots = 0;
    for (let x = -24; x <= 24; x += 1) {
      for (let z = -12; z <= 14; z += 1) {
        if (Math.hypot(x - anchor.x, z - anchor.z) < b.minDist) continue;
        if (Math.abs(deckAt(world.colliders, x, z, deck + 0.05) - deck) > 0.3) continue;
        if (world.colliders.some((c) => blocksWalker(c, 0.6, 0.05, deck) && overlaps(c, x, z, 0.4))) continue;
        spots++;
      }
    }
    check(say('there is somewhere legal to drop the bait'), spots >= 12, `(${spots} square metres)`);
  }

  // ── one simulated minute ──────────────────────────────────────────────────
  const game = {
    audio, pickups, elapsed: 0, world, humans,
    onShooed: () => { game.shooCount = (game.shooCount || 0) + 1; },
    onGullAlarm: () => { game.alarms = (game.alarms || 0) + 1; },
  };

  const input = { move: { x: 0, y: 0 }, flap: false };
  const STEP = 1 / 60;
  let minY = Infinity, maxY = -Infinity, escaped = false;
  const reached = new Map();
  const lastIndex = new Map(humans.map((h) => [h.id, h.patrolIndex]));

  for (let i = 0; i < 60 * 60; i++) {
    // Wander: change direction periodically, flap in bursts, so we exercise
    // walking, flight, gliding, landing, water and the collision resolver.
    if (i % 37 === 0) {
      input.move.x = Math.sin(i * 0.7);
      input.move.y = Math.cos(i * 0.41);
    }
    input.flap = (i % 120) < 45;

    game.elapsed += STEP;
    crow.update(STEP, input, world, audio);
    for (const p of pickups) p.update(STEP, world, null);
    for (const h of humans) h.update(STEP, crow, game);
    for (const p of pigeons) p.update(STEP, null, crow, world);
    for (const g of gulls) g.update(STEP, null, crow, world, game);
    for (const h of humans) {
      if (!h.patrol || h.patrolIndex === lastIndex.get(h.id)) continue;
      lastIndex.set(h.id, h.patrolIndex);
      reached.set(h.id, (reached.get(h.id) || 0) + 1);
    }

    if (!finite(crow.pos) || !finite(crow.vel)) { escaped = true; break; }
    minY = Math.min(minY, crow.pos.y);
    maxY = Math.max(maxY, crow.pos.y);
    if (crow.pos.x < -40 || crow.pos.x > 40 || crow.pos.z < -30 || crow.pos.z > 30) escaped = true;
  }

  check(say('one simulated minute produced no NaN'),
    !escaped && finite(crow.pos) && finite(crow.vel));
  check(say('crow never fell through the world'), minY > -0.5, `(min y ${minY.toFixed(2)})`);
  check(say('crow actually got airborne'), maxY > 1.5, `(max y ${maxY.toFixed(2)})`);
  check(say('crow stayed inside the block'),
    crow.pos.x > -34 && crow.pos.x < 34 && crow.pos.z > -20 && crow.pos.z < 20,
    `(${crow.pos.x.toFixed(1)}, ${crow.pos.z.toFixed(1)})`);
  check(say('humans stayed finite'), humans.every((h) => finite(h.pos)));
  check(say('humans stayed near the block'),
    humans.every((h) => Math.abs(h.pos.x) < 40 && Math.abs(h.pos.z) < 25));

  const stuckIn = humans
    .filter((h) => inside(h.pos.x, h.pos.z, h.floorY).length)
    .map((h) => `${h.id} at (${h.pos.x.toFixed(1)}, ${h.pos.z.toFixed(1)})`);
  check(say('no one ended up inside solid geometry'), stuckIn.length === 0, `(${stuckIn.join('; ')})`);

  const stalled = humans.filter((h) => h.patrol && (reached.get(h.id) || 0) < 2);
  check(say('everyone with a route got round at least two waypoints in the minute'),
    stalled.length === 0,
    `(${humans.filter((h) => h.patrol).map((h) => `${h.id} ${reached.get(h.id) || 0}`).join(', ')})`);

  const paddling = [...pigeons, ...gulls]
    .filter((p) => Math.abs(p.floorY - DECK) < 0.5 && touchesWater(p.pos.x, p.pos.z));
  check(say('no bird is standing in the water'), paddling.length === 0, `(${paddling.length})`);

  // A gull is a hazard marker, so it has to stay where it was put — a gull that
  // wanders is a hazard that moves, and the whole point of them is learnability.
  const drifted = gulls.filter((g) => g.pos.distanceTo(g.home) > 2.6);
  check(say('gulls hold their pitch'), drifted.length === 0,
    `(${drifted.map((g) => g.pos.distanceTo(g.home).toFixed(1)).join(', ')})`);

  /**
   * And they stay on the thing they are standing on. A bird's y is authored and
   * never integrated — nothing with feathers falls — so a gull put on a parapet
   * 0.6m deep walked straight off the side and hovered over the yard six metres
   * up, which is what a playtest reported. The deck is a leash now; this is the
   * check that says so.
   */
  const offDeck = [...pigeons, ...gulls]
    .filter((b) => Math.abs(deckAt(world.colliders, b.pos.x, b.pos.z, b.floorY + 0.05) - b.floorY) > 0.3)
    .map((b) => `(${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)}) on ${b.floorY} over `
      + `${deckAt(world.colliders, b.pos.x, b.pos.z, b.floorY + 0.05).toFixed(1)}`);
  check(say('no bird walked off the deck it was standing on'), offDeck.length === 0,
    `(${offDeck.join('; ')})`);

  // And it has to actually go off when the crow lands next to it.
  if (gulls.length) {
    const g = gulls[0];
    const c = new Crow(stage);
    c.pos.set(g.pos.x + 0.9, g.floorY, g.pos.z);
    const probe = { onGullAlarm: () => { probe.fired = true; }, fired: false };
    g.alarmCooldown = 0;
    g.update(STEP, null, c, world, probe);
    check(say('a gull shrieks when the crow lands beside it'), probe.fired === true);

    const far = new Crow(stage);
    far.pos.set(g.pos.x + 0.9, g.floorY + 4, g.pos.z);
    const probe2 = { onGullAlarm: () => { probe2.fired = true; }, fired: false };
    g.alarmCooldown = 0;
    g.update(STEP, null, far, world, probe2);
    check(say('a gull ignores a crow flying over it'), probe2.fired === false);
  }

  // ── carry / bank ──────────────────────────────────────────────────────────
  const coin = pickups.find((p) => p.value > 0 && !p.pinned);
  coin.setCarried(crow.grip);
  crow.carried = coin;
  check(say('carried item reparents to the beak'), coin.root.parent === crow.grip);
  check(say('carried item hides its glint'), coin.glint ? coin.glint.visible === false : true);
  coin.bank(world.root.userData.nestGroup, 0);
  check(say('banked item lands in the nest'), coin.root.parent === world.root.userData.nestGroup);
  check(say('banked item is marked taken'), coin.taken === true);

  return { meshCount, colliders: world.colliders.length, money, free, guarded, toNest };
}
