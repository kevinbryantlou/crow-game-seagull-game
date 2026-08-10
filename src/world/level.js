/**
 * The block.
 *
 * One continuous space, authored by hand — no procedural generation. Three
 * districts flow into each other left to right, with money density falling and
 * guard density rising as you go. See docs/design-brief.html §6.
 *
 * Returns geometry plus the collision, pickup and NPC data the sim needs.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat, tint } from '../render/shapes.js';

export const BOUNDS = { minX: -31, maxX: 31, minZ: -15, maxZ: 15 };

/**
 * Level-design invariants. These are asserted by scripts/smoke.mjs against the
 * built level, so a future block cannot quietly break them.
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
};

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];

  /** Axis-aligned solid. `top` is landable; `bottom` lets the crow fly underneath. */
  const solid = (x, z, w, d, top, bottom = 0, opts = {}) => {
    colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      top, bottom, perch: opts.perch !== false,
      tag: opts.tag || null,
    });
  };

  // ── ground ────────────────────────────────────────────────────────────────
  const ground = plane(120, 90, PAL.paving, { receive: true });
  ground.position.y = 0;
  root.add(ground);

  // Paving variation — flat slabs a hair above the ground, purely to break up
  // a very large single colour.
  for (const [x, z, w, d, c] of [
    [-22, 0, 16, 16, PAL.pavingMid], [12, 2, 22, 14, PAL.pavingMid],
    [-2, 8, 20, 9, PAL.stoneMid], [24, -4, 14, 12, PAL.pavingMid],
  ]) {
    const s = plane(w, d, c, { receive: true });
    s.position.set(x, 0.012, z);
    root.add(s);
  }

  // Kerb along the near edge, so the block has an edge instead of just stopping.
  const kerb = box(120, 0.34, 1.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
  kerb.position.set(0, 0.17, 16.4);
  root.add(kerb);
  solid(0, 16.4, 120, 1.2, 0.34);

  // ── backdrop skyline (far side, never occludes) ───────────────────────────
  const skyline = [
    [-34, 14, 22, PAL.terracotta], [-18, 11, 17, PAL.stoneMid], [-5, 13, 26, PAL.terracotta],
    [10, 10, 20, PAL.bark], [22, 15, 24, PAL.stoneMid], [37, 12, 19, PAL.terracotta],
  ];
  let bx = -46;
  for (const [, w, h, c] of skyline) {
    const b = box(w, h, 12, c, { up: PAL.stone, down: PAL.shade, receive: false });
    b.position.set(bx + w / 2, h / 2, -24);
    root.add(b);
    // Windows: a grid of small dark quads, cheap and enough at this distance.
    const cols = Math.floor(w / 3), rows = Math.floor(h / 3.4);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (Math.random() < 0.22) continue;
        const win = box(1.5, 1.9, 0.2, Math.random() < 0.3 ? PAL.goldLit : PAL.shade, { shadow: false, receive: false });
        win.position.set(bx + 2 + i * 3, 2.4 + j * 3.4, -18.05);
        root.add(win);
      }
    }
    bx += w + 1.5;
  }
  solid(0, -20, 120, 10, 24);

  // Invisible bounds so the crow cannot leave the block.
  solid(BOUNDS.minX - 2, 0, 4, 90, 30, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 90, 30, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 120, 4, 30, 0, { perch: false });

  // ══════════════════════════════════════════════════════════════════════════
  // FOUNTAIN PLAZA
  // ══════════════════════════════════════════════════════════════════════════
  const FOUNTAIN = { x: -22, z: 0, r: 5.2, rim: 0.62, floor: 0.06 };
  {
    const g = new THREE.Group();
    // The basin has to be genuinely hollow — a solid cylinder would cap the
    // interior and hide both the water and the coins the player dives for.
    const R = FOUNTAIN.r, RI = FOUNTAIN.r - 0.6, SEG = 20;

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.3, R + 0.3, FOUNTAIN.rim, SEG, 1, true),
      mat(PAL.stoneMid, { side: THREE.DoubleSide }),
    );
    wall.position.y = FOUNTAIN.rim / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);

    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(RI, RI, FOUNTAIN.rim, SEG, 1, true),
      mat(PAL.pavingMid, { side: THREE.DoubleSide }),
    );
    innerWall.position.y = FOUNTAIN.rim / 2;
    innerWall.receiveShadow = true;
    g.add(innerWall);

    const rimTop = new THREE.Mesh(
      new THREE.RingGeometry(RI, R + 0.3, SEG).rotateX(-Math.PI / 2),
      mat(PAL.stone),
    );
    rimTop.position.y = FOUNTAIN.rim;
    rimTop.receiveShadow = true;
    g.add(rimTop);

    const basinFloor = new THREE.Mesh(
      new THREE.CircleGeometry(RI, SEG).rotateX(-Math.PI / 2),
      mat(PAL.stoneMid),
    );
    basinFloor.position.y = FOUNTAIN.floor;
    basinFloor.receiveShadow = true;
    g.add(basinFloor);

    // Sits well below the rim, so the coins on the floor read through it.
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(RI - 0.03, SEG).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: PAL.water, transparent: true, opacity: 0.62, flatShading: true }),
    );
    water.position.y = FOUNTAIN.rim - 0.20;
    g.add(water);

    const pedestal = cyl(0.5, 0.85, 1.9, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
    pedestal.position.y = FOUNTAIN.rim + 0.95;
    g.add(pedestal);
    const bowl = cyl(1.5, 0.4, 0.42, 12, PAL.stone, { up: PAL.stone, down: PAL.shade });
    bowl.position.y = FOUNTAIN.rim + 2.0;
    g.add(bowl);

    g.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
    root.add(g);

    // The rim is a ring of solids so the crow can perch on it and hop in.
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      solid(FOUNTAIN.x + Math.cos(a) * (FOUNTAIN.r - 0.28), FOUNTAIN.z + Math.sin(a) * (FOUNTAIN.r - 0.28),
        1.6, 1.6, FOUNTAIN.rim, 0, { tag: 'fountain-rim' });
    }
    perches.push({ x: FOUNTAIN.x, y: FOUNTAIN.rim + 2.3, z: FOUNTAIN.z });
    g.userData.water = water;
    root.userData.fountainWater = water;
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
    const nest = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const r = 0.62 + Math.random() * 0.12;
      const twig = box(0.5 + Math.random() * 0.35, 0.07, 0.07, i % 3 ? PAL.bark : PAL.barkShade);
      twig.position.set(Math.cos(a) * r, 0.06 + (i % 3) * 0.07, Math.sin(a) * r);
      twig.rotation.y = -a + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      twig.rotation.z = (Math.random() - 0.5) * 0.3;
      nest.add(twig);
    }
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

  // ══════════════════════════════════════════════════════════════════════════
  // shared prop builders
  // ══════════════════════════════════════════════════════════════════════════
  const addTree = (x, z, scale = 1) => {
    const g = new THREE.Group();
    const trunkH = 3.0 * scale;
    g.add(at(cyl(0.18 * scale, 0.3 * scale, trunkH, 6, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, trunkH / 2, 0));
    const blobs = [[0, trunkH + 0.7, 0, 1.7], [0.9, trunkH + 0.25, 0.4, 1.2], [-0.8, trunkH + 0.4, -0.5, 1.25], [0.2, trunkH + 1.5, -0.3, 1.05]];
    for (const [bxx, by, bz, r] of blobs) {
      const b = ico(r * scale, 0, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
      b.position.set(bxx * scale, by * scale, bz * scale);
      b.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(b);
    }
    g.position.set(x, 0, z);
    root.add(g);
    solid(x, z, 0.6, 0.6, trunkH);
    solid(x, z, 2.8, 2.8, (trunkH + 1.9) * scale, (trunkH + 0.6) * scale);
    perches.push({ x, y: (trunkH + 2.0) * scale, z });
    if (z > 6) occluders.push(...g.children);
    return g;
  };

  const addBench = (x, z, ry = 0) => {
    const g = new THREE.Group();
    g.add(at(box(2.6, 0.12, 0.62, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.55, 0));
    g.add(at(box(2.6, 0.5, 0.1, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.86, -0.28));
    for (const s of [-1, 1]) {
      g.add(at(box(0.14, 0.55, 0.5, PAL.steelDark), s * 1.1, 0.28, 0));
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    root.add(g);
    solid(x, z, ry ? 0.9 : 2.7, ry ? 2.7 : 0.9, 0.67);
    perches.push({ x, y: 0.67, z });
    return g;
  };

  const addLamp = (x, z) => {
    const g = new THREE.Group();
    g.add(at(cyl(0.09, 0.13, 4.6, 6, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), 0, 2.3, 0));
    g.add(at(box(0.5, 0.14, 0.5, PAL.steelDark), 0, 0.07, 0));
    g.add(at(cyl(0.34, 0.16, 0.5, 6, PAL.steelDark, { up: PAL.steel }), 0, 4.75, 0));
    const bulb = at(ico(0.22, 0, PAL.goldLit, { shadow: false }), 0, 4.52, 0);
    bulb.material = mat(PAL.goldLit);
    g.add(bulb);
    g.position.set(x, 0, z);
    root.add(g);
    solid(x, z, 0.3, 0.3, 4.6);
    perches.push({ x, y: 5.0, z });
    return g;
  };

  const addPlanter = (x, z) => {
    const g = new THREE.Group();
    g.add(at(box(1.8, 0.7, 1.8, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 0.35, 0));
    for (let i = 0; i < 4; i++) {
      const b = ico(0.42, 0, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
      b.position.set((Math.random() - 0.5) * 1.1, 0.85 + Math.random() * 0.2, (Math.random() - 0.5) * 1.1);
      g.add(b);
    }
    g.position.set(x, 0, z);
    root.add(g);
    solid(x, z, 1.8, 1.8, 0.7);
    return g;
  };

  addTree(-28, -7);
  addTree(-27.5, 9, 0.9);
  addTree(-14, 11, 1.05);
  addTree(4, -9, 0.95);
  addTree(21, 10.5);
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
    for (const wx of [-6, 3.4, 6.4]) {
      const win = box(2.6, 1.9, 0.2, PAL.water, { shadow: false });
      win.position.set(wx, 2.1, 11.92);
      g.add(win);
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
  const tableTops = [];
  for (const t of CAFE_TABLES) {
    const g = new THREE.Group();
    g.add(at(cyl(0.06, 0.28, 0.72, 8, PAL.steelDark, { up: PAL.steel }), 0, 0.36, 0));
    g.add(at(cyl(0.62, 0.62, 0.09, 12, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.76, 0));
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.6;
      const ch = new THREE.Group();
      ch.add(at(box(0.5, 0.07, 0.5, PAL.awning, { up: PAL.awningLit, down: PAL.shade }), 0, 0.44, 0));
      ch.add(at(box(0.5, 0.55, 0.06, PAL.awning, { up: PAL.awningLit, down: PAL.shade }), 0, 0.72, -0.22));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ch.add(at(box(0.05, 0.44, 0.05, PAL.steelDark), sx * 0.2, 0.22, sz * 0.2));
      }
      ch.position.set(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05);
      ch.rotation.y = -a + Math.PI / 2;
      g.add(ch);
    }
    g.position.set(t.x, 0, t.z);
    root.add(g);
    solid(t.x, t.z, 1.24, 1.24, 0.81, 0.66);
    solid(t.x, t.z, 0.5, 0.5, 0.66);
    perches.push({ x: t.x, y: 0.81, z: t.z });
    tableTops.push({ x: t.x, y: 0.81, z: t.z });
  }

  // The saltshaker pinning the café bill — a weighted object you must move first.
  const saltshaker = group(
    at(cyl(0.07, 0.09, 0.22, 6, PAL.stone, { up: PAL.stone }), 0, 0.11, 0),
    at(cyl(0.06, 0.07, 0.05, 6, PAL.steel, { up: PAL.steel }), 0, 0.24, 0),
  );
  saltshaker.position.set(CAFE_TABLES[3].x + 0.18, 0.81, CAFE_TABLES[3].z);
  root.add(saltshaker);

  // ══════════════════════════════════════════════════════════════════════════
  // CART CORNER
  // ══════════════════════════════════════════════════════════════════════════
  const CART = { x: 15, z: -5 };
  {
    const g = new THREE.Group();
    g.add(at(box(3.2, 1.3, 1.6, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 1.05, 0));
    g.add(at(box(3.3, 0.14, 1.7, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.75, 0));
    g.add(at(box(1.0, 0.3, 0.8, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), -0.9, 1.95, 0));
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
    g.add(at(box(3.8, 0.16, 2.6, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade }), 0, 3.05, 0.4));
    for (const px of [-1.7, 1.7]) {
      g.add(at(cyl(0.06, 0.06, 1.4, 5, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), px, 2.32, 1.6));
    }
    g.add(at(box(3.0, 0.1, 0.7, PAL.barkShade, { up: PAL.bark }), 0, 1.35, -1.0));
    // The till, moved off the hot dog cart.
    g.add(at(box(0.52, 0.26, 0.38, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 1.0, 2.33, 0.55));
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
    solid(11, 6.5, 3.8, 2.6, 3.13, 2.97);
    perches.push({ x: 11, y: 3.13, z: 6.9 });
  }

  // Bins
  for (const [x, z, c] of [[26.5, 5, PAL.canopyShade], [27.8, 6.6, PAL.steelDark]]) {
    const g = new THREE.Group();
    g.add(at(cyl(0.62, 0.55, 1.5, 8, c, { up: PAL.steel, down: PAL.shade }), 0, 0.75, 0));
    g.add(at(cyl(0.68, 0.68, 0.12, 8, PAL.steelDark, { up: PAL.steel }), 0, 1.56, 0));
    g.position.set(x, 0, z);
    root.add(g);
    solid(x, z, 1.3, 1.3, 1.62);
    perches.push({ x, y: 1.62, z });
  }

  // Scaffolding — the aerial route the vendor cannot follow.
  {
    const g = new THREE.Group();
    const X0 = 17.5, X1 = 29.5, Z0 = -12, Z1 = -8.5;
    const decks = [3.4, 6.6];
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
    fountain: FOUNTAIN,
    nest: NEST,
    nestPlatform: 3.4,     // the cornice you land on
    nestFootprint: 1.5,    // the twig ring itself
    cart: CART,
    cafeTables: tableTops,
    saltshaker,
    kidBench,
    purseBench,
    cashbox: null,
    pickups: pickupPlacements({ FOUNTAIN, CART, CASE, tableTops }),
    humans: humanPlacements({ CART, CASE }),
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
    ['penny', -26, 3.5], ['penny', -18.5, 5.2], ['penny', -29, 1], ['penny', -24, -6.5],
    ['penny', -15, 2.2], ['penny', -20, 8.5], ['penny', -28.5, -3], ['penny', -13, 6],
    ['penny', -16.5, -3.5], ['penny', -22, 9.5],
  ];
  for (const [k, x, z] of scatter) add(k, 0.01, x, 0.06, z);
  for (const [x, z] of [[-27, 6], [-19.5, -7], [-13.5, -1.5], [-25, 10.5], [-30, 5.5]]) add('nickel', 0.05, x, 0.06, z);
  for (const [x, z] of [[-21, 11], [-29.5, -6], [-15.5, 8.5], [-11, 3]]) add('dime', 0.10, x, 0.06, z);

  // Wishing coins — on the fountain floor, so you have to go in.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const r = 1.4 + (i % 3) * 1.1;
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
  add('bill1', 1.00, 11.6, 2.28, 6.7, { owner: 'newsagent' });
  add('bill5', 5.00, 10.0, 2.50, 6.95, { owner: 'newsagent', label: 'CASH TIN' });
  // Hanging on the far end of the cart, not worn — the vendor walks away during
  // the pigeon distraction, and the ten has to stay put when he does.
  add('bill10', 10.00, CART.x + 1.15, 1.18, CART.z + 0.94, { owner: 'vendor', label: 'APRON POCKET' });

  // — Shinies: worthless, tradeable —
  add('shiny', 0, -27.5, 0.07, 3.5, { shinyKind: 'cap' });
  add('shiny', 0, FOUNTAIN.x - 1.5, FOUNTAIN.rim - 0.28, FOUNTAIN.z + 1.8, { inWater: true, shinyKind: 'ring' });
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
      patrol: [[-7.5, 7.0], [3.5, 4.5], [6.5, 9.0], [-1.0, 10.5]],
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
      pos: [11, 0, 8.6], home: [11, 0, 8.6],
      patrol: null, speed: 1.2, chaseSpeed: 3.6, viewDist: 8, viewCos: 0.3, guardRadius: 2.8, alertness: 0.9,
      faces: [0, -1],
    },
    {
      id: 'phone', name: 'someone on their phone', cloth: 2, skin: 0, hair: 1,
      pos: [-10, 0, 12], home: [-10, 0, 12],
      patrol: [[-24, 13], [-24, -1], [-9, -2], [6, 1], [14, 6], [2, 13]],
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
