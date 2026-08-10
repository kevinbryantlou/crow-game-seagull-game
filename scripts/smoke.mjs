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

const { buildLevel } = await import('../src/world/level.js');
const { Crow } = await import('../src/entities/crow.js');
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

console.log('\nsimulating');
const audio = new Proxy({}, { get: () => () => {} });
const game = {
  audio, pickups, elapsed: 0,
  onShooed: () => { game.shooCount = (game.shooCount || 0) + 1; },
};

const input = { move: { x: 0, y: 0 }, flap: false };
const STEP = 1 / 60;
let minY = Infinity, maxY = -Infinity, escaped = false;

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
  for (const p of pigeons) p.update(STEP, null, crow);

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

console.log('\ncarry / bank');
const coin = pickups.find((p) => p.kind === 'quarter');
coin.setCarried(crow.grip);
crow.carried = coin;
check('carried item reparents to the beak', coin.root.parent === crow.grip);
check('carried item hides its glint', coin.glint ? coin.glint.visible === false : true);
coin.bank(world.root.userData.nestGroup, 0);
check('banked item lands in the nest', coin.root.parent === world.root.userData.nestGroup);
check('banked item is marked taken', coin.taken === true);

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} failing check(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
