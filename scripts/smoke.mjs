/**
 * Headless smoke test.
 *
 * Builds the whole world and runs the simulation for a simulated minute with no
 * WebGL context — everything except the renderer is plain three.js maths, so
 * this catches the class of bug that would otherwise only show up as a blank
 * canvas: bad API calls, undefined reads, NaN in the physics, broken collision.
 *
 *   node scripts/smoke.mjs
 */

import * as THREE from 'three';

// ── minimal DOM, for the one place we build a canvas texture ────────────────
const fakeGradient = { addColorStop() {} };
class FakeCtx {
  clearRect() {} strokeText() {} fillText() {} fillRect() {}
  beginPath() {} moveTo() {} lineTo() {} stroke() {}
  save() {} restore() {} translate() {} rotate() {}
  createRadialGradient() { return fakeGradient; }
  createLinearGradient() { return fakeGradient; }
  set font(_) {} set textAlign(_) {} set textBaseline(_) {}
  set lineWidth(_) {} set strokeStyle(_) {} set fillStyle(_) {}
  set globalCompositeOperation(_) {}
}
globalThis.document = {
  createElement: (tag) => {
    if (tag !== 'canvas') return {};
    return { width: 0, height: 0, getContext: () => new FakeCtx(), style: {} };
  },
};
globalThis.window = globalThis;
// Node 26 ships a read-only `navigator`; nothing under test reads it, so leave it.

const { buildLevel, RULES } = await import('../src/world/level.js');
const { overlaps, blocksWalker, WALKER_RADIUS } = await import('../src/world/collide.js');
const { Crow, TUNING: CROW } = await import('../src/entities/crow.js');
const { Human, Pigeon } = await import('../src/entities/human.js');
const { Pickup } = await import('../src/world/pickups.js');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name} ${detail}`); failures++; }
};

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

console.log('\nbuilding the block');
const world = buildLevel();
check('level builds', !!world.root);
check('colliders present', world.colliders.length > 20, `(${world.colliders.length})`);
check('every collider is finite', world.colliders.every(
  (c) => [c.minX, c.maxX, c.minZ, c.maxZ, c.top, c.bottom].every(Number.isFinite)));
check('nest group exists', !!world.root.userData.nestGroup);
check('fountain water exists', !!world.root.userData.fountainWater);

// A mesh whose material has vertexColors on but whose geometry carries no
// `color` attribute renders pure black. This is invisible to any test that
// does not look at the actual buffers, and it silently ate most of the block.
const blackMeshes = [];
const countMeshes = (rootObj) => {
  let n = 0;
  rootObj.traverse((o) => {
    if (!o.isMesh) return;
    n++;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.vertexColors && !o.geometry.attributes.color) blackMeshes.push(o);
  });
  return n;
};
const meshCount = countMeshes(world.root);
check('no mesh renders black from a missing color attribute',
  blackMeshes.length === 0, `(${blackMeshes.length} of ${meshCount} meshes)`);

console.log('\nmoney in words');
const { moneyInWords } = await import('../src/ui/words.js');
const say = (n) => {
  const { dollars, cents } = moneyInWords(n);
  return [dollars, cents].filter(Boolean).join(', ');
};
for (const [amount, expected] of [
  [20.00, 'twenty dollars'],
  [22.66, 'twenty-two dollars, sixty-six cents'],
  [20.01, 'twenty dollars, one cent'],
  [21.00, 'twenty-one dollars'],
  [33.95, 'thirty-three dollars, ninety-five cents'],
  [1.00,  'one dollar'],
  [0.05,  'five cents'],
  [0.00,  'zero dollars'],
  [40.10, 'forty dollars, ten cents'],
  [115.15,'one hundred fifteen dollars, fifteen cents'],
]) {
  check(`$${amount.toFixed(2)} reads as "${expected}"`, say(amount) === expected, `(got "${say(amount)}")`);
}
// Floating-point sums of pennies must not drift into the wrong words.
let drift = 0;
for (let i = 0; i < 2066; i++) drift += 0.01;
check('a sum of 2066 pennies still reads correctly',
  say(drift) === 'twenty dollars, sixty-six cents', `(got "${say(drift)}")`);

console.log('\nranks');
const { rankFor, formatRankLine, RANKS, UNFINISHED } = await import('../src/ui/rank.js');
const run = (o) => ({ won: true, elapsed: 400, caught: 3, traded: true, tasksDone: 2, totalTasks: 5, ...o });

for (const [label, state, expected] of [
  ['never caught beats everything', run({ caught: 0, elapsed: 900 }), 'Model Citizen'],
  ['a genuinely fast run',          run({ elapsed: 120 }),            'Corvid Prodigy'],
  ['2m07s (the real playtest run)', run({ elapsed: 127 }),            'Corvid Prodigy'],
  ['all theft, no trading',         run({ traded: false }),           'Career Criminal'],
  ['cleared the list',              run({ tasksDone: 5 }),            'Thorough Bird'],
  ['a solid time',                  run({ elapsed: 300 }),            'Accomplished Thief'],
  ['took a beating',                run({ elapsed: 600, caught: 7 }), 'Persistent Bird'],
  ['got there eventually',          run({ elapsed: 600 }),            'Bird About Town'],
  ['ran out of light',              run({ won: false, caught: 0 }),   UNFINISHED],
]) {
  check(`${label} → ${expected}`, rankFor(state) === expected, `(got ${rankFor(state)})`);
}

// The old ladder handed the top rank to any informed run; the new one must not.
check('a middling 4-minute run is no longer a prodigy',
  rankFor(run({ elapsed: 240 })) !== 'Corvid Prodigy', `(got ${rankFor(run({ elapsed: 240 }))})`);
check('every rank is reachable — none is shadowed by an earlier test',
  RANKS.every((r) => RANKS.findIndex((x) => x.title === r.title) ===
    RANKS.findIndex((x) => x.test({
      won: true, elapsed: 400, caught: 3, traded: true, tasksDone: 2, totalTasks: 5,
      ...(r.title === 'Model Citizen' ? { caught: 0 } : {}),
      ...(r.title === 'Corvid Prodigy' ? { elapsed: 100 } : {}),
      ...(r.title === 'Career Criminal' ? { traded: false } : {}),
      ...(r.title === 'Thorough Bird' ? { tasksDone: 5 } : {}),
      ...(r.title === 'Accomplished Thief' ? { elapsed: 300 } : {}),
      ...(r.title === 'Persistent Bird' ? { elapsed: 600, caught: 7 } : {}),
      ...(r.title === 'Bird About Town' ? { elapsed: 600 } : {}),
    }))));
check('the eyebrow names the catch count, not the money',
  formatRankLine(run({ elapsed: 127, caught: 0 })) === 'Model Citizen · 2m 07s · never caught',
  `(got "${formatRankLine(run({ elapsed: 127, caught: 0 }))}")`);
check('being caught is counted in the eyebrow',
  formatRankLine(run({ elapsed: 127, caught: 3 })).endsWith('caught ×3'),
  `(got "${formatRankLine(run({ elapsed: 127, caught: 3 }))}")`);

console.log('\nlevel-design rules');

// Nothing may be built inside the fountain basin. A bench spawned in the water
// once, and it was only caught because a human happened to fly over it.
const F = world.fountain;
const inFountain = world.colliders.filter((c) => {
  if (c.shape === 'ring') return false;
  const cx = Math.max(c.minX, Math.min(F.x, c.maxX));
  const cz = Math.max(c.minZ, Math.min(F.z, c.maxZ));
  return Math.hypot(cx - F.x, cz - F.z) < F.r - 0.8;
});
check('nothing is built inside the fountain', inFountain.length === 0,
  `(${inFountain.length} collider(s) overlap the basin)`);

check(`nest landing surface is at least ${RULES.nestPlatformRatio}x the nest`,
  world.nestPlatform >= world.nestFootprint * RULES.nestPlatformRatio,
  `(platform ${world.nestPlatform} vs nest ${world.nestFootprint})`);

console.log('\npickups');
const pickups = world.pickups.map((s) => new Pickup(s));
check('all pickups construct', pickups.length === world.pickups.length, `(${pickups.length})`);
check('every pickup has a label', pickups.every((p) => typeof p.label === 'string' && p.label.length));
// The style guide's rule: a thing you can take is the only thing that glints.
// The hot dog is not money but it is takeable, and it is the key to Cart
// Corner — without a glint the player cannot tell the puzzle is there.
check('every takeable pickup carries a glint', pickups.every((p) => !!p.glint),
  `(missing: ${pickups.filter((p) => !p.glint).map((p) => p.kind).join(', ') || 'none'})`);
check('the hot dog exists on the cart', pickups.some((p) => p.kind === 'hotdog' && p.glint));
const labelled = pickups.filter((p) => p.customLabel);
check('custom labels survive construction', labelled.length === 3,
  `(${labelled.map((p) => p.label).join(', ')})`);

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
check('no two distinct pickups sit within one beak-length', tooClose.length === 0,
  `(${tooClose.join('; ')})`);

// A pickup inside a collider's blocking volume cannot be reached at all. The
// fountain rim used to be exempt from this, because the ring of boxes standing
// in for it swallowed a wishing coin. The real ring does not, so the exemption
// is gone and the coins are checked like everything else.
const buried = pickups.filter((p) => world.colliders.some((c) =>
  overlaps(c, p.home.x, p.home.z)
    && p.home.y > c.bottom + 0.02 && p.home.y < c.top - 0.02));
check('no pickup is buried inside solid geometry', buried.length === 0,
  `(${buried.map((p) => p.label).join(', ')})`);

/**
 * The camera never rotates, so whether a pickup can be seen is a fixed property
 * of where it sits — not something that varies with play. Cast a ray from each
 * pickup along the one sightline the game ever uses (38 deg pitch, 25 deg yaw)
 * and see whether solid, non-fading geometry stands in the way.
 *
 * Registered occluders are exempt: they fade to a silhouette when they come
 * between the camera and the crow. Transparent things are exempt too — you can
 * see the wishing coins through the water.
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
ray.far = 40;
const hidden = [];
for (const p of pickups) {
  const from = p.home.clone().addScaledVector(toCamera, 0.06);
  ray.set(from, toCamera);
  const hit = ray.intersectObjects(opaque, false);
  if (hit.length) hidden.push(`${p.label} behind ${hit[0].object.geometry.type}`);
}
check('no pickup is hidden from the fixed camera', hidden.length === 0,
  `(${hidden.join('; ')})`);

const money = pickups.reduce((a, p) => a + p.value, 0);
const free = pickups.filter((p) => !p.owner && !p.inWater && p.value > 0)
  .reduce((a, p) => a + p.value, 0);
const guarded = pickups.filter((p) => p.owner).reduce((a, p) => a + p.value, 0);
console.log(`       total on the block  $${money.toFixed(2)}`);
console.log(`       unguarded + dry     $${free.toFixed(2)}`);
console.log(`       guarded             $${guarded.toFixed(2)}`);
check('more money exists than the $20 goal', money > 20, `($${money.toFixed(2)})`);
check('unguarded money alone cannot reach $20', free < 20, `($${free.toFixed(2)})`);
check('the endgame must be the guarded stretch', guarded > money - 20,
  `(guarded $${guarded.toFixed(2)} vs slack $${(money - 20).toFixed(2)})`);

console.log('\nentities');
const humans = world.humans.map((s) => new Human(s));
check('all humans construct', humans.length === world.humans.length);
check('exactly one kid', humans.filter((h) => h.kid).length === 1);
check('a vendor owns the ten',
  pickups.some((p) => p.kind === 'bill10' && p.owner === 'vendor'));

const pigeons = [];
for (let i = 0; i < 7; i++) pigeons.push(new Pigeon(-20 + i, 6));

// The crow only ever asks the stage for a movement basis.
const stage = { basis: () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) }) };
const crow = new Crow(stage);
check('crow constructs', !!crow.root);
check('beak resolves to a world point', finite(crow.beakWorld));

console.log('\nthe fountain');
const audio = new Proxy({}, { get: () => () => {} });

/**
 * The basin is a room with one door in the ceiling, and it has to behave like
 * one from every angle.
 *
 * It used to behave like a lobster pot. The rim was twelve boxes laid round a
 * circle, which met only at their corners, so the crow could walk in at three
 * headings out of 180 — and because flapping was disabled in water, a crow that
 * got in by any other route could never get out again. Both halves are asserted
 * here: the wall is continuous, and the sky is always open.
 */
{
  const dry = { move: { x: 0, y: 0 }, flap: false };
  const leaks = [];
  for (let deg = 0; deg < 360; deg += 2) {
    const a = (deg * Math.PI) / 180;
    const c = new Crow(stage);
    c.pos.set(F.x + Math.cos(a) * 8, 0, F.z + Math.sin(a) * 8);
    dry.move.x = -Math.cos(a); dry.move.y = Math.sin(a);   // straight at the middle
    for (let i = 0; i < 60 * 8 && !c.inWater; i++) c.update(1 / 60, dry, world, audio);
    if (c.inWater) leaks.push(deg);
  }
  check('the rim is a wall at every heading — you go in over the top, not through',
    leaks.length === 0, `(walked straight in at ${leaks.length} heading(s): ${leaks.slice(0, 8).join(', ')})`);

  /**
   * Escaping has to work from an empty stamina bar, not just a full one.
   *
   * The first version of this check only ever started at full stamina, so it
   * passed while the basin was still a trap in practice: stamina regenerated
   * only while `grounded`, and buoyancy means a crow in the water never is.
   * You arrived wet, spent what you had, and floated there.
   *
   * `mashing` is the panic case — a player who holds flap down on an empty bar
   * rather than releasing it. If regen waits for the key to come up, that reads
   * as the game being broken.
   */
  /**
   * The ratio that was the actual bug.
   *
   * A flap only lifts the crow if it out-accelerates gravity. At the old
   * WATER_FLAP of 0.62 it did not — 27 × 0.62 = 16.7 against 19 — so flapping in
   * the fountain was net downward and the only thing that ever raised the bird
   * was the buoyancy impulse below rim−0.34. Escape therefore depended on
   * catching the right phase of the bob: every scripted test got out, and a
   * person holding the key did not. Assert the ratio, not just the outcome,
   * because the outcome tests all passed while this was broken.
   */
  check('a flap in water out-accelerates gravity',
    CROW.FLAP_ACCEL * CROW.WATER_FLAP > CROW.GRAVITY,
    `(${(CROW.FLAP_ACCEL * CROW.WATER_FLAP).toFixed(1)} vs ${CROW.GRAVITY}, ` +
    `need WATER_FLAP > ${(CROW.GRAVITY / CROW.FLAP_ACCEL).toFixed(3)})`);

  /**
   * Both input modes, because they fail differently. Holding rides the flap
   * accumulator; tapping gives it up sixty times a second and only works if a
   * single burst nets height. A player does one or the other without thinking
   * about it and neither may strand them.
   */
  const escape = (startStamina, mode) => {
    const stuck = [];
    for (let deg = 0; deg < 360; deg += 45) {
      for (const r of [0, 2.0, 4.2]) {
        const a = (deg * Math.PI) / 180;
        const c = new Crow(stage);
        c.pos.set(F.x + Math.cos(a) * r, F.floor, F.z + Math.sin(a) * r);
        c.stamina = startStamina;
        let out = false;
        for (let i = 0; i < 60 * 12; i++) {
          // 5 frames down, 7 up — roughly a 90 ms tap at 5 per second, which is
          // about as fast as a person actually presses a key.
          const flap = mode === 'hold' ? true : (i % 12) < 5;
          c.update(1 / 60, { move: { x: 0, y: 0 }, flap }, world, audio);
          if (c.pos.y > F.rim + 0.25) { out = true; break; }
        }
        if (!out) stuck.push(`${deg}° r${r}`);
      }
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
    check(`a crow in the water gets out — ${label}`,
      stuck.length === 0, `(stuck at ${stuck.join(', ')})`);
  }

  /**
   * And the third way out, which needs no technique at all: walk at the wall.
   * The rim has to stay one-way — climbable from inside where the crow floats
   * 0.20 below it, solid from outside where it stands 0.62 below it.
   */
  const walkOut = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const a = (deg * Math.PI) / 180;
    const c = new Crow(stage);
    c.pos.set(F.x + Math.cos(a) * 2.5, F.floor, F.z + Math.sin(a) * 2.5);
    const move = { x: Math.cos(a), y: -Math.sin(a) };   // straight at the rim
    let out = false;
    for (let i = 0; i < 60 * 12; i++) {
      c.update(1 / 60, { move, flap: false }, world, audio);
      if (!c.inWater && Math.hypot(c.pos.x - F.x, c.pos.z - F.z) > F.r) { out = true; break; }
    }
    if (!out) walkOut.push(`${deg}°`);
  }
  check('a crow in the water can simply walk out, no flapping at all',
    walkOut.length === 0, `(stuck at ${walkOut.join(', ')})`);

  // Regen is the whole fix, so state the rate rather than just the outcome.
  const floating = new Crow(stage);
  floating.pos.set(F.x, F.floor, F.z);
  floating.stamina = 0;
  for (let i = 0; i < 60; i++) floating.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, world, audio);
  check('a second of floating gets most of the bar back',
    floating.stamina > 0.5, `(${floating.stamina.toFixed(2)} after 1s)`);

  // The buoyancy bob is the fountain's whole character — a crow sitting in
  // water rides it rather than resting on it. It falls out of the 26 m/s²
  // buoyancy impulse fighting gravity, so any tuning pass on either could
  // flatten it into a crow standing in a puddle without anyone noticing.
  const bobber = new Crow(stage);
  bobber.pos.set(F.x + 2, F.floor, F.z);
  let lo = Infinity, hi = -Infinity, bobs = 0, prevVel = 0;
  for (let i = 0; i < 60 * 6; i++) {
    bobber.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, world, audio);
    if (i < 60) continue;                       // let it settle
    lo = Math.min(lo, bobber.pos.y);
    hi = Math.max(hi, bobber.pos.y);
    if (prevVel < 0 && bobber.vel.y >= 0) bobs++;
    prevVel = bobber.vel.y;
  }
  check('a crow left in the water still bobs',
    hi - lo > 0.15 && bobs >= 4,
    `(${(hi - lo).toFixed(2)}m over ${bobs} bobs in 5s)`);
}

console.log('\nlights at dusk');
{
  const { NightLights } = await import('../src/render/nightlights.js');
  const { PAL, SKY_RAMP } = await import('../src/render/palette.js');
  const { mat } = await import('../src/render/shapes.js');
  const night = world.nightLights;

  // A pool drives `opacity` on a MeshBasicMaterial; an emissive source drives
  // `emissiveIntensity`. Everything that asks "is it off?" has to read whichever
  // one this light actually uses.
  const output = (i) => (i.pool ? i.material.opacity : i.material.emissiveIntensity);
  const pools = night.items.filter((i) => i.pool);

  /**
   * The sunset has to actually happen inside a session someone will play.
   *
   * At 18 minutes it did not: the light held steady until 10m48s and the lamps
   * caught at 12m58s, while the real playtest run is 2m07s and the rank ladder's
   * fast cutoff is 2m30s. Every hour of lighting work was unreachable in normal
   * play and no test noticed, because each half was individually correct — the
   * lamps fired at the right *fraction* of a day nobody was still playing.
   *
   * Probe the ladder for its fast threshold rather than hardcoding it, so this
   * stays true if the ranks are retuned.
   */
  const clean = (elapsed) => rankFor({ won: true, elapsed, caught: 1, traded: true, tasksDone: 1, totalTasks: 5 });
  const cutoff = (title) => {
    for (let e = 10; e < 3600; e += 5) if (clean(e) !== title) return e;
    return Infinity;
  };
  const fast = cutoff('Corvid Prodigy');            // 150s — a speedrun
  const solid = (() => { let e = fast; while (e < 3600 && clean(e) === 'Accomplished Thief') e += 5; return e; })();
  const lampsAt = RULES.lampsOnAt * RULES.sessionSeconds;

  check('a fast run is rewarded with daylight — the lamps catch after it ends',
    lampsAt > fast, `(lamps ${Math.round(lampsAt)}s vs fast cutoff ${fast}s)`);

  /**
   * The upper bound is the one that matters, and the first version of this
   * check did not have it — it passed happily at eighteen minutes, which is the
   * exact bug it was written for. Guarding only against a day that is too short
   * misses the failure that actually shipped: lamps firing so late that no real
   * run reaches them. 1.5x the ladder's "did fine" time is the outer edge of a
   * session someone actually plays.
   */
  check('a normal run reaches the sunset — the lamps are not stranded past it',
    lampsAt < solid * 1.5,
    `(lamps ${Math.round(lampsAt)}s vs 1.5x the ${solid}s solid-run mark)`);

  check('there is enough lit dusk left to be worth building',
    RULES.sessionSeconds - lampsAt > 90,
    `(only ${Math.round(RULES.sessionSeconds - lampsAt)}s of dusk)`);
  check('the slowest rank is still winnable inside the session',
    RULES.sessionSeconds > solid, `(session ${RULES.sessionSeconds}s vs ${solid}s)`);

  check('the street lights catch at the documented hour',
    night.trigger === RULES.lampsOnAt, `(${night.trigger} vs RULES ${RULES.lampsOnAt})`);
  check('the block registers night lights', night.items.length >= 8, `(${night.items.length})`);
  check('the block registers ground pools', pools.length >= 6, `(${pools.length})`);
  check('nothing is emitting during the day', night.items.every((i) => output(i) === 0));

  /**
   * The cache trap, asserted. `shapes.mat()` hands the same material to every
   * mesh of a colour — 38 of them share `goldLit`. If a light were registered by
   * mutating that material instead of a clone, every lamp bulb, every skyline
   * window and anything else gold would come on as one object with one
   * schedule, and there would be no way to stagger them.
   */
  // `emissiveIntensity` defaults to 1 on a fresh material; what makes one inert
  // is a black `emissive`. Checking the intensity here would fail on a material
  // nobody has touched.
  const cached = mat(PAL.goldLit);
  check('registering a light did not poison the shared material cache',
    cached.emissive.getHex() === 0,
    `(cached goldLit emissive #${cached.emissive.getHexString()})`);
  check('every night light has its own material, none is the cached one',
    night.items.every((i) => i.material !== cached));

  // Before the trigger nothing is on, however long the frame.
  night.update(0.5, 10);
  check('nothing comes on before the trigger', night.items.every((i) => output(i) === 0));

  // A lamp that flickers must actually flicker: bright, dark, bright.
  const lamp = night.items.find((i) => i.flicker && i.delay === 0);
  const trace = [0.02, 0.10, 0.16, 0.24].map((s) => NightLights.levelAt(lamp, s));
  check('a lamp catches with a stutter before it warms',
    trace[0] > 0.5 && trace[1] < 0.1 && trace[2] > 0.5 && trace[3] < 0.1,
    `(${trace.map((v) => v.toFixed(2)).join(', ')})`);

  // And everything reaches full, in order, within a sensible wall-clock time.
  const slowest = Math.max(...night.items.map((i) => i.delay + i.warm));
  night.update(0.99, slowest + 1.5);
  const short = night.items.filter((i) => output(i) < i.peak - 1e-6);
  check(`every light reaches full by ${(slowest + 1.5).toFixed(1)}s after sundown`,
    short.length === 0, `(${short.length} still ramping)`);

  // Scrubbing time backwards re-arms the sequence rather than leaving the block
  // lit in daylight — which is exactly what a debug session or a replay does.
  night.update(0.1, 0.016);
  check('winding the clock back turns the block off again',
    night.items.every((i) => output(i) === 0));

  /**
   * The bug that cost a whole round of tuning. A CanvasTexture defaults to
   * NoColorSpace, so three.js reads the gradient as linear data while the
   * renderer outputs sRGB — an amber authored as (255,206,120) reaches the
   * screen as roughly (255,234,183), a near-white cream. It measured as a pool
   * 40% brighter and 0% warmer, and no amount of retinting the stops would have
   * fixed it. Asserted because it is invisible in code review and only shows up
   * as "the light looks a bit washed out".
   */
  check('pool textures are tagged sRGB, not left linear',
    pools.every((i) => i.material.map && i.material.map.colorSpace === THREE.SRGBColorSpace),
    `(${pools.map((i) => i.material.map?.colorSpace || 'none').join(', ')})`);

  /**
   * A pool is light, not geometry that light falls on — and specifically it must
   * not write depth. That is what lets the crow stand on top of one and stay a
   * silhouette, which is how "the crow is the darkest thing on screen" survives
   * putting light on the ground it walks over.
   */
  check('pools are additive and write no depth',
    pools.every((i) => i.material.blending === THREE.AdditiveBlending
      && i.material.depthWrite === false && i.material.fog === false));

  /**
   * Shade is violet, never grey — and after the fill colour was split off the
   * horizon glow, never rust either. Checked as blue-beats-red on the colour
   * that lights every up-facing surface the key does not reach.
   */
  const dusk = SKY_RAMP[SKY_RAMP.length - 1];
  const fillB = dusk.fill & 0xff, fillR = (dusk.fill >> 16) & 0xff;
  check('the colour of shade at dusk is violet, not rust',
    fillB > fillR + 20, `(fill #${dusk.fill.toString(16)} — r${fillR} b${fillB})`);
  check('the ramp lifts the ambient floor through the back half of the day',
    dusk.amb > SKY_RAMP[0].amb, `(${dusk.amb} at dusk vs ${SKY_RAMP[0].amb} at noon)`);
}

console.log('\nwhere people stand');

// A person standing inside a magazine rack is not a rendering bug, it is a
// placement bug, and it shipped. Nobody spawns inside anything solid, and no
// patrol waypoint sits inside anything either.
const solidToWalkers = world.colliders.filter((c) => blocksWalker(c));
const inside = (x, z) => solidToWalkers.filter((c) => overlaps(c, x, z, WALKER_RADIUS));

const embedded = world.humans
  .filter((h) => inside(h.pos[0], h.pos[2]).length)
  .map((h) => `${h.id} at (${h.pos[0]}, ${h.pos[2]})`);
check('no one spawns inside solid geometry', embedded.length === 0, `(${embedded.join('; ')})`);

const badWaypoints = [];
for (const h of world.humans) {
  for (const [x, z] of h.patrol || []) {
    if (inside(x, z).length) badWaypoints.push(`${h.id} → (${x}, ${z})`);
  }
}
check('no patrol waypoint sits inside solid geometry', badWaypoints.length === 0,
  `(${badWaypoints.join('; ')})`);

// Collision stops people wading, but a route that walks into the fountain every
// lap only trades a person in the water for a person grinding along a wall.
const wading = [];
for (const h of world.humans) {
  if (!h.patrol) continue;
  for (let i = 0; i < h.patrol.length; i++) {
    const [ax, az] = h.patrol[i];
    const [bx, bz] = h.patrol[(i + 1) % h.patrol.length];
    for (let t = 0; t <= 1; t += 0.004) {
      const d = Math.hypot(ax + (bx - ax) * t - F.x, az + (bz - az) * t - F.z);
      if (d < F.r + WALKER_RADIUS) { wading.push(`${h.id} leg ${i}`); break; }
    }
  }
}
check('no patrol route walks through the fountain', wading.length === 0,
  `(${[...new Set(wading)].join('; ')})`);

/**
 * Chases cannot be authored around anything: SHOOING steers straight at the
 * crow, and the crow can stand behind whatever it likes. So a walker has to be
 * able to get to a point on the far side of every large solid on the block.
 *
 * Making people solid without this deadlocked two of them immediately — pushing
 * someone out of a wall they are walking into just puts them back where they
 * were, forever. The waiter spent a whole run pressed against a café table.
 */
{
  const stranded = [];
  for (const [name, from, to] of [
    ['the fountain, north to south', [F.x, 0, F.z - 9], [F.x, F.z + 9]],
    ['the fountain, corner to corner', [F.x - 7, 0, F.z - 7], [F.x + 7, F.z + 7]],
    ['the memorial', [world.nest.x, 0, world.nest.z - 5.5], [world.nest.x, world.nest.z + 5.5]],
    ['the newsstand', [11, 0, 11], [11, 4]],
    ['the café tables', [-8, 0, 2], [8, 10]],
    ['the hot dog cart', [world.cart.x, 0, world.cart.z - 5], [world.cart.x, world.cart.z + 5]],
  ]) {
    const walker = new Human({
      id: 'probe', cloth: 0, skin: 0, hair: 0, pos: from, home: from, patrol: null,
      speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1, guardRadius: 0, alertness: 0,
    });
    walker._cols = world.colliders;
    const target = new THREE.Vector3(to[0], 0, to[1]);
    let arrived = false;
    for (let i = 0; i < 60 * 20 && !arrived; i++) {
      walker._moveToward(target, 1 / 60, 4.0);
      arrived = Math.hypot(walker.pos.x - to[0], walker.pos.z - to[1]) < 0.8;
    }
    if (!arrived) stranded.push(`${name} (gave up at ${walker.pos.x.toFixed(1)}, ${walker.pos.z.toFixed(1)})`);
  }
  check('a chase can get round every large solid on the block',
    stranded.length === 0, `(${stranded.join('; ')})`);
}

console.log('\nsimulating');
const game = {
  audio, pickups, elapsed: 0, world,
  onShooed: () => { game.shooCount = (game.shooCount || 0) + 1; },
};

const input = { move: { x: 0, y: 0 }, flap: false };
const STEP = 1 / 60;
let minY = Infinity, maxY = -Infinity, escaped = false;
// Solid people can wedge where ghosts could not, so count waypoints as we go.
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

check('one simulated minute produced no NaN', !escaped && finite(crow.pos) && finite(crow.vel));
check('crow never fell through the world', minY > -0.5, `(min y ${minY.toFixed(2)})`);
check('crow actually got airborne', maxY > 1.5, `(max y ${maxY.toFixed(2)})`);
check('crow stayed inside the block',
  crow.pos.x > -34 && crow.pos.x < 34 && crow.pos.z > -20 && crow.pos.z < 20,
  `(${crow.pos.x.toFixed(1)}, ${crow.pos.z.toFixed(1)})`);
check('humans stayed finite', humans.every((h) => finite(h.pos)));
check('humans stayed near the block', humans.every((h) => Math.abs(h.pos.x) < 40 && Math.abs(h.pos.z) < 25));

// Solid people can get wedged where ghosts could not, so the sim has to prove
// they did not: nobody ends the minute inside anything, and everyone with a
// route is still walking it.
const stuckIn = humans
  .filter((h) => inside(h.pos.x, h.pos.z).length)
  .map((h) => `${h.id} at (${h.pos.x.toFixed(1)}, ${h.pos.z.toFixed(1)})`);
check('no one ended up inside solid geometry', stuckIn.length === 0, `(${stuckIn.join('; ')})`);

const stalled = humans.filter((h) => h.patrol && (reached.get(h.id) || 0) < 2);
check('everyone with a route got round at least two waypoints in the minute',
  stalled.length === 0,
  `(${humans.filter((h) => h.patrol).map((h) => `${h.id} ${reached.get(h.id) || 0}`).join(', ')})`);

const paddling = pigeons.filter((p) => Math.hypot(p.pos.x - F.x, p.pos.z - F.z) < F.r);
check('no pigeon is standing in the fountain', paddling.length === 0, `(${paddling.length})`);

console.log('\ncarry / bank');
const coin = pickups.find((p) => p.kind === 'quarter');
coin.setCarried(crow.grip);
crow.carried = coin;
check('carried item reparents to the beak', coin.root.parent === crow.grip);
check('carried item hides its glint', coin.glint ? coin.glint.visible === false : true);
coin.bank(world.root.userData.nestGroup, 0);
check('banked item lands in the nest', coin.root.parent === world.root.userData.nestGroup);
check('banked item is marked taken', coin.taken === true);

// Loud warning if a temporary test cheat is still wired in.
const mainSrc = await import('node:fs').then((fs) => fs.readFileSync('src/main.js', 'utf8'));
const active = [...mainSrc.matchAll(/const (TEST_\w+) = ([^;]+);/g)]
  .filter((m) => m[2].trim() !== 'null');
if (active.length) {
  console.log(`\n  ${'!'.repeat(60)}`);
  for (const m of active) console.log(`  TEST CHEAT ACTIVE — ${m[1]} = ${m[2].trim()}`);
  console.log('  Set it back to null in src/main.js before shipping.');
  console.log(`  ${'!'.repeat(60)}`);
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} failing check(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
