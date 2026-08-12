/**
 * LEVEL 1 — the block.
 *
 * One continuous space, authored by hand — no procedural generation. Three
 * districts flow into each other left to right, with money density falling and
 * guard density rising as you go. See docs/design-brief.html §6.
 *
 * Everything here is at ground level; the vertical block is level 2. The parts
 * both blocks share now live in world/kit.js and the contract in world/rules.js,
 * which is why this file is shorter than it was without a line of it changing.
 *
 * Returns geometry plus the collision, pickup and NPC data the sim needs.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat, tint } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

export const BOUNDS = { minX: -31, maxX: 31, minZ: -15, maxZ: 15 };

// Re-exported so anything that already imports RULES from the level it
// constrains keeps working. rules.js is where it lives now.
export { RULES };

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const {
    solid, addDecal, addTree, addPlanter, addBench, addLamp, addBin, addTable,
    addSkyline, makeNest, addPool,
  } = kit;

  // ── ground ────────────────────────────────────────────────────────────────
  const ground = plane(120, 90, PAL.paving, { receive: true });
  ground.position.y = 0;
  root.add(ground);

  // Paving variation — flat slabs a hair above the ground, purely to break up
  // a very large single colour.
  // These overlap each other, so each needs its own height — see `addDecal`.
  for (const [x, z, w, d, c] of [
    [-22, 0, 16, 16, PAL.pavingMid], [12, 2, 22, 14, PAL.pavingMid],
    [-2, 8, 20, 9, PAL.stoneMid], [24, -4, 14, 12, PAL.pavingMid],
  ]) addDecal(x, z, w, d, c);

  // Kerb along the near edge, so the block has an edge instead of just stopping.
  const kerb = box(120, 0.34, 1.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
  kerb.position.set(0, 0.17, 16.4);
  root.add(kerb);
  solid(0, 16.4, 120, 1.2, 0.34);

  // ── backdrop skyline (far side, never occludes) ───────────────────────────
  // The whole city coming up behind the block, on one material and one
  // assignment. Slow and unstaggered: the foreground lamps are the event, and
  // the skyline is the weather behind it. Randomised per session, so no two
  // runs light the same windows.
  addSkyline([
    [14, 22, PAL.terracotta], [11, 17, PAL.stoneMid], [13, 26, PAL.terracotta],
    [10, 20, PAL.bark], [15, 24, PAL.stoneMid], [12, 19, PAL.terracotta],
  ], -24, { startX: -46 });
  solid(0, -20, 120, 10, 24);

  // Invisible bounds so the crow cannot leave the block.
  solid(BOUNDS.minX - 2, 0, 4, 90, 30, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 90, 30, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 120, 4, 30, 0, { perch: false });

  // ══════════════════════════════════════════════════════════════════════════
  // FOUNTAIN PLAZA
  // ══════════════════════════════════════════════════════════════════════════
  const POOL = addPool(-22, 0, 5.2, 0, { tag: 'fountain-rim' });
  const FOUNTAIN = POOL.spec;
  {
    const g = POOL.group, water = POOL.water;

    const pedestal = cyl(0.5, 0.85, 1.9, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
    pedestal.position.y = FOUNTAIN.rim + 0.95;
    g.add(pedestal);
    const bowl = cyl(1.5, 0.4, 0.42, 12, PAL.stone, { up: PAL.stone, down: PAL.shade });
    bowl.position.y = FOUNTAIN.rim + 2.0;
    g.add(bowl);

    perches.push({ x: FOUNTAIN.x, y: FOUNTAIN.rim + 2.3, z: FOUNTAIN.z });
    g.userData.water = water;
    root.userData.fountainWater = water;
    // Lit from under the water, the way civic fountains are. Kept faint — the
    // brief's rule is that nothing added may outshine a pickup glint — but it
    // keeps the wishing coins readable after dark, and it makes the losing
    // ending's promise about a fountain full of coins literally true.
    // Very faint. It is by far the largest emissive surface on the block, and
    // at 0.22 of waterLit it read as a floodlit swimming pool that outshone
    // every glint in the plaza — the one thing the brief says must not happen.
    night.add(water, PAL.water, { peak: 0.055, warm: 5.0, delay: 1.6 });
  }

  // ── the memorial, and the nest on top of it ───────────────────────────────
  const NEST = { x: -12.5, y: 5.35, z: -6.5 };
  {
    const g = new THREE.Group();
    g.add(at(box(3.6, 0.5, 3.6, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.25, 0));
    g.add(at(box(2.8, 0.45, 2.8, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.72, 0));
    g.add(at(box(2.0, 3.6, 2.0, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 2.75, 0));
    // The cap is a wide cornice, not a plinth the size of the nest. Landing on
    // it while being chased has to be forgiving — see NEST_PLATFORM_RULE.
    g.add(at(box(3.4, 0.4, 3.4, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 4.75, 0));
    // A plaque nobody reads.
    g.add(at(box(1.1, 0.7, 0.06, PAL.steelDark, { shadow: false }), 0, 2.6, 1.02));

    // The nest: a ring of twigs.
    const nest = makeNest();
    nest.position.set(0, 5.0, 0);
    g.add(nest);
    g.userData.nest = nest;

    g.position.set(NEST.x, 0, NEST.z);
    root.add(g);
    root.userData.nestGroup = nest;

    solid(NEST.x, NEST.z, 3.6, 3.6, 0.5);
    solid(NEST.x, NEST.z, 2.0, 2.0, 4.55);            // the shaft
    solid(NEST.x, NEST.z, 3.4, 3.4, 4.95, 4.55);      // the cornice you land on
    perches.push({ x: NEST.x, y: NEST.y, z: NEST.z });
  }

  // Anything on the near side of the block (z > 6) can come between the camera
  // and the crow, so it is registered to fade to a silhouette.
  addTree(-28, -7);
  addTree(-27.5, 9, 0.9, { occlude: true });
  addTree(-11.5, 12.5, 1.05, { occlude: true });   // clear of the kid's bench and its sightline
  addTree(4, -9, 0.95);
  addTree(21, 10.5, 1, { occlude: true });
  addPlanter(-17, -8.5);
  addPlanter(8, 11.5);
  addLamp(-25.5, 4.5);
  addLamp(-8, -3);
  addLamp(9, -8);
  addLamp(24, 6);
  const kidBench = addBench(-17.5, 9.5);
  addBench(-29, 2.5, Math.PI / 2);   // clear of the fountain and of the loose change
  addBench(0, 12.2);
  const purseBench = addBench(-4.5, -10.5);

  // ══════════════════════════════════════════════════════════════════════════
  // CAFÉ ROW — the café sits on the near side, so its awning is the block's
  // one deliberate occluder.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    const wall = box(17, 5.0, 4.0, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    wall.position.set(0, 2.5, 14.0);
    g.add(wall);
    const door = box(1.6, 2.6, 0.2, PAL.barkShade, { shadow: false });
    door.position.set(-1, 1.3, 11.9);
    g.add(door);
    const cafeWindows = [];
    for (const wx of [-6, 3.4, 6.4]) {
      const win = box(2.6, 1.9, 0.2, PAL.water, { shadow: false });
      win.position.set(wx, 2.1, 11.92);
      g.add(win);
      cafeWindows.push(win);
    }
    // The café is the near-side occluder, so its glow lands where the player's
    // eye already is. Warm over the glass, and the doorway weaker than the
    // windows — a lit room seen through a door is mostly doorframe.
    night.add(cafeWindows, PAL.goldLit, { peak: 0.62, warm: 3.2, delay: 0.9 });
    night.add(door, 0xd8a256, { peak: 0.30, warm: 3.6, delay: 1.4 });
    // Three overlapping pools; a 17m shopfront is not a circle.
    for (const px of [-6, 0.5, 6.4]) {
      night.addPool(root, px, 9.6, 4.8, { profile: 'stall', peak: 0.46, warm: 3.2, delay: 1.1 });
    }
    // Awning
    const awn = box(17, 0.22, 3.4, PAL.awning, { up: PAL.awningLit, down: PAL.awning });
    awn.position.set(0, 3.3, 10.2);
    awn.rotation.x = -0.11;
    g.add(awn);
    for (let i = 0; i < 8; i++) {
      const stripe = box(1.05, 0.24, 3.4, i % 2 ? PAL.stone : PAL.awningLit, { shadow: false, receive: false });
      stripe.position.set(-7.4 + i * 2.12, 3.31, 10.2);
      stripe.rotation.x = -0.11;
      g.add(stripe);
    }
    g.add(at(box(0.14, 3.3, 0.14, PAL.steelDark), -8.2, 1.65, 8.7));
    g.add(at(box(0.14, 3.3, 0.14, PAL.steelDark), 8.2, 1.65, 8.7));

    // The counter by the door — where the tip jar lives.
    g.add(at(box(2.4, 1.0, 0.9, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 2.0, 0.5, 11.0));

    root.add(g);
    occluders.push(wall, awn, ...g.children.filter((c) => c.geometry?.type === 'BoxGeometry' && c.position.z > 9.8));
    solid(0, 14.0, 17, 4.0, 5.0);
    solid(0, 10.2, 17, 3.4, 3.42, 3.1);
    solid(2.0, 11.0, 2.4, 0.9, 1.0);
    perches.push({ x: -5, y: 3.5, z: 10.2 }, { x: 5, y: 3.5, z: 10.2 });
  }

  const CAFE_TABLES = [
    { x: -6.5, z: 5.5 }, { x: -2.0, z: 8.0 }, { x: 2.0, z: 5.0 },
    { x: 6.0, z: 8.2 }, { x: -0.5, z: 2.0 },
  ];
  const tableTops = CAFE_TABLES.map((t) => addTable(t.x, t.z).top);

  // The saltshaker pinning the café bill — a weighted object you must move first.
  const saltshaker = group(
    at(cyl(0.07, 0.09, 0.22, 6, PAL.stone, { up: PAL.stone }), 0, 0.11, 0),
    at(cyl(0.06, 0.07, 0.05, 6, PAL.steel, { up: PAL.steel }), 0, 0.24, 0),
  );
  saltshaker.position.set(CAFE_TABLES[3].x + 0.18, 0.81, CAFE_TABLES[3].z);
  saltshaker.userData.label = 'SALTSHAKER';
  root.add(saltshaker);

  // ══════════════════════════════════════════════════════════════════════════
  // CART CORNER
  // ══════════════════════════════════════════════════════════════════════════
  const CART = { x: 15, z: -5 };
  {
    const g = new THREE.Group();
    g.add(at(box(3.2, 1.3, 1.6, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 1.05, 0));
    g.add(at(box(3.3, 0.14, 1.7, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.75, 0));
    const griddle = at(box(1.0, 0.3, 0.8, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), -0.9, 1.95, 0);
    g.add(griddle);
    // A hot plate, not a lamp — deep orange and dimmer than anything on a pole.
    // Cart Corner is the endgame and the darkest district on the block.
    night.add(griddle, 0xd8632c, { peak: 0.50, warm: 4.0, delay: 1.2 });
    // Offset toward the serving side, so the vendor has somewhere lit to stand
    // and somewhere dark to be lured away from.
    night.addPool(root, CART.x - 0.4, CART.z + 1.6, 4.8, { profile: 'stall', peak: 0.70, warm: 4.0, delay: 1.2 });
    // Parasol
    g.add(at(cyl(0.06, 0.06, 2.2, 6, PAL.steelDark), 0.4, 2.9, 0));
    const shade = cone(1.9, 0.7, 8, PAL.cloth[0], { up: PAL.clothLit[0], down: PAL.shade });
    shade.position.set(0.4, 4.2, 0);
    g.add(shade);
    for (const s of [-1, 1]) {
      const w = cyl(0.42, 0.42, 0.14, 10, PAL.feather, { up: PAL.steelDark });
      w.rotation.z = Math.PI / 2;
      w.position.set(s * 1.1, 0.42, 0.86);
      g.add(w);
    }
    g.position.set(CART.x, 0, CART.z);
    root.add(g);
    solid(CART.x, CART.z, 3.3, 1.7, 1.82);
    solid(CART.x + 0.4, CART.z, 3.6, 3.6, 4.3, 3.9);
    perches.push({ x: CART.x, y: 1.82, z: CART.z }, { x: CART.x + 0.4, y: 4.35, z: CART.z });
  }

  // Newsstand
  {
    const g = new THREE.Group();
    g.add(at(box(3.4, 2.2, 1.8, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 0, 1.1, 0));
    // The canopy sits high enough to leave headroom over the counter. At its
    // old height its collider band swallowed the counter top, so anything
    // resting there could not be reached at all.
    g.add(at(box(3.8, 0.16, 2.6, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade }), 0, 3.05, 1.15));
    for (const px of [-1.7, 1.7]) {
      g.add(at(cyl(0.06, 0.06, 1.4, 5, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), px, 2.32, 2.3));
    }
    g.add(at(box(3.0, 0.1, 0.7, PAL.barkShade, { up: PAL.bark }), 0, 1.35, -1.0));
    // A clip-on stall light over the display side, which is the side the camera
    // sees and the side the money is on. There was no light source here at all.
    const stallLamp = at(ico(0.13, 0, PAL.goldLit, { shadow: false }), 0, 2.42, -0.95);
    stallLamp.material = mat(PAL.goldLit);
    g.add(stallLamp);
    night.add(stallLamp, PAL.goldLit, { peak: 0.95, warm: 1.4, delay: 1.9, flicker: true });
    // Without this the stall lamp read as a sticker on a dark box — the whole
    // reason tier 2 exists. Stall profile: a plateau, not a spike.
    night.addPool(root, 11, 9.5, 4.4, { profile: 'stall', peak: 0.72, warm: 1.4, delay: 1.9, flicker: true });
    // The till, moved off the hot dog cart.
    g.add(at(box(0.52, 0.26, 0.38, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 1.0, 2.33, -0.55));
    for (let i = 0; i < 5; i++) {
      const mag = box(0.42, 0.03, 0.58, PAL.cloth[i % 5], { shadow: false });
      mag.position.set(-1.2 + i * 0.6, 1.42, -1.0);
      mag.rotation.x = -0.35;
      g.add(mag);
    }
    g.position.set(11, 0, 7.5);
    g.rotation.y = Math.PI;
    root.add(g);
    solid(11, 7.5, 3.4, 1.8, 2.2);
    solid(11, 6.35, 3.8, 2.6, 3.13, 2.97);
    // The display counter, which had no collider at all. That omission is how
    // the newsagent came to be standing inside his own magazine rack.
    solid(11, 8.5, 3.0, 0.7, 1.40, 1.30);
    perches.push({ x: 11, y: 3.13, z: 6.35 }, { x: 11, y: 1.40, z: 8.5 });
  }

  // Bins
  addBin(26.5, 5, PAL.canopyShade);
  addBin(27.8, 6.6, PAL.steelDark);

  // Scaffolding — the aerial route the vendor cannot follow.
  {
    const g = new THREE.Group();
    const X0 = 17.5, X1 = 29.5, Z0 = -12, Z1 = -8.5;
    const decks = [3.4, 6.6];
    const beads = [];
    for (const zz of [Z0, Z1]) {
      for (let x = X0; x <= X1 + 0.01; x += 3) {
        g.add(at(cyl(0.09, 0.09, 8.6, 5, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), x, 4.3, zz));
      }
    }
    for (const y of decks) {
      const deck = box(X1 - X0 + 0.8, 0.16, Z1 - Z0 + 0.6, PAL.bark, { up: PAL.bark, down: PAL.barkShade });
      deck.position.set((X0 + X1) / 2, y, (Z0 + Z1) / 2);
      g.add(deck);
      for (let x = X0; x <= X1 + 0.01; x += 3) {
        g.add(at(cyl(0.05, 0.05, 1.0, 5, PAL.steel), x, y + 0.5, Z1 + 0.3));
      }
      const rail = box(X1 - X0 + 0.8, 0.08, 0.08, PAL.steel);
      rail.position.set((X0 + X1) / 2, y + 1.0, Z1 + 0.3);
      g.add(rail);
      // Amber warning beads on the rail. Free character, and they mark the
      // aerial route through the darkest corner of the block — building sites
      // have exactly these.
      for (const bxx of [X0 + 1.5, (X0 + X1) / 2, X1 - 1.5]) {
        const bead = at(ico(0.09, 0, PAL.gold, { shadow: false }), bxx, y + 1.0, Z1 + 0.3);
        bead.material = mat(PAL.gold);
        g.add(bead);
        beads.push(bead);
      }
      solid((X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0 + 0.8, Z1 - Z0 + 0.6, y + 0.08, y - 0.1);
      perches.push({ x: (X0 + X1) / 2, y: y + 0.08, z: (Z0 + Z1) / 2 });
    }
    // Netting, to read as a building site at a glance.
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(X1 - X0 + 0.8, 8.6),
      new THREE.MeshLambertMaterial({ color: PAL.cloth[2], transparent: true, opacity: 0.35, side: THREE.DoubleSide, flatShading: true }),
    );
    net.position.set((X0 + X1) / 2, 4.3, Z0 - 0.1);
    g.add(net);
    night.add(beads, PAL.gold, { peak: 0.80, warm: 0.9, delay: 2.4 });
    root.add(g);
  }

  // ── busker's pitch ────────────────────────────────────────────────────────
  const CASE = { x: -6.5, z: -8.0 };
  {
    const g = new THREE.Group();
    g.add(at(box(1.5, 0.16, 0.62, PAL.barkShade, { up: PAL.bark, down: PAL.shade }), 0, 0.08, 0));
    g.add(at(box(1.5, 0.34, 0.1, PAL.barkShade, { up: PAL.bark }), 0, 0.25, -0.3));
    g.position.set(CASE.x, 0, CASE.z);
    root.add(g);
    solid(CASE.x, CASE.z, 1.5, 0.62, 0.16);
  }

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: 0,
    nest: NEST,
    nestPlatform: 3.4,     // the cornice you land on
    nestFootprint: 1.5,    // the twig ring itself
    decks: { ground: 0 },
    cart: CART,
    cafeTables: tableTops,
    // The weighted object pinning the café bill. `pin` is the name the game
    // knows it by; level 2's is a candle lantern on a restaurant check.
    pin: saltshaker,
    kidBench,
    purseBench,
    cashbox: null,
    pickups: pickupPlacements({ FOUNTAIN, CART, CASE, tableTops }),
    humans: humanPlacements({ CART, CASE }),
    gulls: [],
    // Scattered rather than authored: on the block they are ambience, and the
    // only thing that has to be true of them is that they are near the plaza.
    pigeons: Array.from({ length: 7 }, () => ({
      x: -20 + Math.random() * 14, z: 4 + Math.random() * 8,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Placements
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value ladder, laid out on the block. Roughly $29 reachable in money plus
 * ~$3.75 obtainable by trading, against a $20 target — and only ~$4.50 of it is
 * unguarded, which is what makes the endgame the guarded stretch no matter what
 * order the player works in. docs/design-brief.html §3.
 */
function pickupPlacements({ FOUNTAIN, CART, CASE, tableTops }) {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  // — Fountain Plaza: free money, deliberately easy, teaches the loop —
  const scatter = [
    ['penny', -24, 7.5], ['penny', -18.5, 5.2], ['penny', -30.5, 2], ['penny', -24, -6.5],
    ['penny', -15, 2.2], ['penny', -20, 8.5], ['penny', -28.5, -3], ['penny', -13, 6],
    ['penny', -16.5, -3.5], ['penny', -22, 9.5],
  ];
  for (const [k, x, z] of scatter) add(k, 0.01, x, 0.06, z);
  for (const [x, z] of [[-27, 6], [-19.5, -7], [-13.5, -1.5], [-25, 10.5], [-30, 5.5]]) add('nickel', 0.05, x, 0.06, z);
  for (const [x, z] of [[-21, 11], [-29.5, -6], [-15.5, 8.5], [-11, 3]]) add('dime', 0.10, x, 0.06, z);

  // Wishing coins — on the fountain floor, so you have to go in.
  const WISHING = [[20, 3.0], [80, 3.6], [140, 3.0], [200, 3.6], [260, 4.3], [320, 3.6]];
  for (const [deg, r] of WISHING) {
    const a = (deg * Math.PI) / 180;
    add('quarter', 0.25, FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.rim - 0.28, FOUNTAIN.z + Math.sin(a) * r, { inWater: true });
  }

  // — Café Row —
  add('coins', 0.75, tableTops[0].x - 0.2, tableTops[0].y + 0.04, tableTops[0].z + 0.15, { owner: 'waiter' });
  add('coins', 0.55, tableTops[2].x + 0.15, tableTops[2].y + 0.04, tableTops[2].z - 0.1, { owner: 'waiter' });
  add('coins', 0.90, tableTops[4].x, tableTops[4].y + 0.04, tableTops[4].z + 0.2, { owner: 'waiter' });
  for (let i = 0; i < 3; i++) {
    add('bill1', 1.00, 2.0 + (i - 1) * 0.09, 1.06 + i * 0.02, 11.0, { owner: 'waiter', inJar: true });
  }
  // The café bill, pinned under the saltshaker.
  add('bill5', 5.00, tableTops[3].x - 0.1, tableTops[3].y + 0.03, tableTops[3].z, { owner: 'waiter', pinned: true });

  // — Busker —
  add('bill5', 5.00, CASE.x + 0.3, 0.20, CASE.z + 0.05, { owner: 'busker' });
  add('quarter', 0.25, CASE.x - 1.9, 0.06, CASE.z + 0.8, { owner: 'busker' });
  add('quarter', 0.25, CASE.x + 1.5, 0.06, CASE.z - 1.0, { owner: 'busker' });

  // — Cart Corner: the endgame —
  // Three takeables within one beak-length of each other made the cart a lucky
  // dip. The cart now tells one story — the ten, and the hot dog that gets you
  // to it — and the cash moved to the newsstand, which gives the newsagent
  // something worth guarding instead of a lone dollar.
  add('bill1', 1.00, 11.9, 2.28, 8.05, { owner: 'newsagent' });
  add('bill5', 5.00, 10.0, 2.50, 8.05, { owner: 'newsagent', label: 'CASH TIN' });
  // Hanging on the far end of the cart, not worn — the vendor walks away during
  // the pigeon distraction, and the ten has to stay put when he does. `hung`
  // says so out loud, because "every pickup is resting on something" is a rule
  // now and this is the one thing on either block that deliberately is not.
  add('bill10', 10.00, CART.x + 1.15, 1.18, CART.z + 0.94,
    { owner: 'vendor', label: 'APRON POCKET', hung: true });

  // — Shinies: worthless, tradeable —
  add('shiny', 0, -27.5, 0.07, 3.5, { shinyKind: 'cap' });
  add('shiny', 0, FOUNTAIN.x + 1.2, FOUNTAIN.rim - 0.28, FOUNTAIN.z - 1.0, { inWater: true, shinyKind: 'ring' });
  add('shiny', 0, tableTops[1].x + 0.2, tableTops[1].y + 0.04, tableTops[1].z - 0.15, { shinyKind: 'marble' });
  add('shiny', 0, 26.0, 0.07, 7.4, { shinyKind: 'key' });

  // — The hot dog: not money. The key to the whole Cart Corner puzzle. —
  add('hotdog', 0, CART.x - 0.9, 1.9, CART.z + 0.15, { owner: 'vendor', label: 'HOT DOG' });

  p.forEach((x, i) => { x.id = i; });
  return p;
}

function humanPlacements({ CART, CASE }) {
  return [
    {
      id: 'waiter', name: 'waiter', cloth: 0, skin: 1, hair: 0,
      pos: [-1, 0, 7.5], home: [-1, 0, 7.5],
      // (6.5, 9.0) was inside the café table at (6, 8.2) — harmless while
      // people were ghosts, a place to stand and shove once they were not.
      patrol: [[-7.5, 7.0], [3.5, 4.5], [7.4, 9.6], [-1.0, 10.5]],
      speed: 1.5, chaseSpeed: 4.3, viewDist: 9.5, viewCos: 0.35, guardRadius: 3.2, alertness: 1.0,
    },
    {
      id: 'vendor', name: 'hot dog vendor', cloth: 1, skin: 0, hair: 2,
      pos: [CART.x - 2.1, 0, CART.z + 0.9], home: [CART.x - 2.1, 0, CART.z + 0.9],
      patrol: null, speed: 1.3, chaseSpeed: 4.0, viewDist: 11, viewCos: 0.1, guardRadius: 4.2, alertness: 1.25,
      faces: [1, 0.4],
    },
    {
      id: 'busker', name: 'busker', cloth: 3, skin: 2, hair: 1,
      pos: [CASE.x, 0, CASE.z - 1.5], home: [CASE.x, 0, CASE.z - 1.5],
      patrol: null, speed: 1.1, chaseSpeed: 3.4, viewDist: 7, viewCos: 0.5, guardRadius: 2.6, alertness: 0.7,
      busker: true, faces: [0, 1],
    },
    {
      id: 'newsagent', name: 'newsagent', cloth: 4, skin: 3, hair: 3,
      // At the end of his counter, not inside it. He used to stand at
      // (12.3, 8.6), which is within the stand's body *and* its magazine rack,
      // so from the camera he read as a head growing out of the shelf.
      // Behind the stand is where a newsagent belongs, but the stand is 2.2
      // tall and he is 1.75 — from a fixed 38° camera he would be gone.
      pos: [13.5, 0, 8.0], home: [13.5, 0, 8.0],
      patrol: null, speed: 1.2, chaseSpeed: 3.6, viewDist: 8, viewCos: 0.3, guardRadius: 3.0, alertness: 0.9,
      faces: [-1, 0],
    },
    {
      id: 'phone', name: 'someone on their phone', cloth: 2, skin: 0, hair: 1,
      pos: [-10, 0, 12], home: [-10, 0, 12],
      // A lap of the block that goes *round* the fountain. The old route ran
      // due south down x=-24 and spent 15% of its length inside the basin,
      // which is how you got people wading through the water. Collision now
      // stops that anyway, but a route that walks into a wall every lap only
      // trades one bad look for another.
      patrol: [[-27, 12], [-29.5, 5], [-28, -6], [-17.5, -11], [-6, -12], [4, -6], [12, 1], [14, 7], [4.5, 11]],
      speed: 1.35, chaseSpeed: 3.2, viewDist: 3.0, viewCos: 0.8, guardRadius: 1.6, alertness: 0.25,
      oblivious: true,
    },
    {
      id: 'kid', name: 'kid on the bench', cloth: 2, skin: 2, hair: 2,
      pos: [-17.5, 0, 8.6], home: [-17.5, 0, 8.6],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1, guardRadius: 0, alertness: 0,
      kid: true, small: true, faces: [0, -1],
    },
  ];
}
