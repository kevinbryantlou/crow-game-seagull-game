/**
 * The crow.
 *
 * A wedge with a hinge in it. The head is ~30% oversized and the beak is
 * unreasonably large because the beak is the cursor — every interaction happens
 * at its tip. Animation is procedural on a rig of nested groups; there are no
 * skeletons and no imported clips. See docs/style-guide.html §4.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, at, group, mat } from '../render/shapes.js';
import { overlaps } from '../world/collide.js';

const GRAVITY = 19.0;
const WALK_SPEED = 3.4;
const AIR_SPEED = 7.2;
const FLAP_ACCEL = 27.0;
const FLAP_MAX_RISE = 6.4;
const GLIDE_GRAVITY = 6.2;
const STAMINA_MAX = 1.0;
const STAMINA_DRAIN = 0.42;   // per second of flapping
const STAMINA_REGEN = 0.62;   // per second on the ground
const RADIUS = 0.34;
/**
 * Wet wings still work, just badly — but they have to actually work.
 *
 * This must stay above GRAVITY / FLAP_ACCEL = 0.704. Below that ratio a flap in
 * water is net *downward*, and the only thing lifting the crow is the buoyancy
 * impulse under y = rim−0.34. It sat at 0.62 for a while, and the fountain was
 * consequently escapable only by catching the right phase of the bob: scripted
 * tests got out every time and a person holding the key never did.
 */
const WATER_FLAP = 0.80;
/**
 * The floor a single wingbeat puts under the crow while it is in water.
 *
 * Raising WATER_FLAP fixes holding the key and does nothing for tapping it,
 * because tapping is a duty cycle: at ~40% on, the average acceleration is
 * 0.4 × 27 × 0.80 = 9 m/s² against gravity's 19, and no sane flap power closes
 * that — it would need WATER_FLAP above 1.69. So in water a beat is an impulse
 * rather than an acceleration: a bird in a foot of water heaves itself up in
 * discrete lunges, which is both the honest animal and the mechanic that makes
 * every input pattern work.
 */
const WATER_HEAVE = 3.6;
/**
 * How high a ledge the crow will scramble onto instead of being stopped by it.
 *
 * Deliberately small, and it does the fountain's asymmetry for free rather than
 * by special-casing it: floating inside the basin the crow measures from the
 * water surface, 0.20 below the rim, so it can always climb out; standing on dry
 * paving outside it measures from 0, so the 0.62 rim is still a wall and you
 * still go in over the top. It also picks up the kerb and the busker's case,
 * which were invisible walls, and leaves benches, planters and the memorial
 * (0.5 and up) exactly as they were.
 */
const STEP_UP = 0.34;
const SUPPORT = RADIUS * 0.7;   // the footprint the Y pass uses to find a floor

/**
 * Exposed so smoke.mjs can assert the *relationships* between these, not only
 * their effects. Every outcome test passed while WATER_FLAP was below the
 * gravity ratio; a test of the ratio itself would not have.
 */
export const TUNING = { GRAVITY, FLAP_ACCEL, FLAP_MAX_RISE, WATER_FLAP, WATER_HEAVE, STEP_UP, RADIUS };

export class Crow {
  constructor(stage) {
    this.stage = stage;
    this.pos = new THREE.Vector3(-24, 0, 6);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.grounded = true;
    this.stamina = STAMINA_MAX;
    this.inWater = false;
    this.carried = null;
    this.stunned = 0;
    this.wet = 0;

    this._walkPhase = 0;
    this._flapPhase = 0;
    this._flapping = 0;
    this._idleTick = 2 + Math.random() * 3;
    this._headTick = 0;
    this._stepTimer = 0;
    this._beatT = 0;
    this._bob = 0;

    this.root = new THREE.Group();
    this._build();
    this.root.position.copy(this.pos);
  }

  _build() {
    // body pivot — everything that bobs hangs off this
    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = ico(0.26, 0, PAL.feather, { up: PAL.featherSheen, down: PAL.featherShade });
    torso.scale.set(1.65, 1.0, 1.0);
    torso.position.y = 0.30;
    this.body.add(torso);

    const chest = ico(0.19, 0, PAL.feather, { up: PAL.featherSheen, down: PAL.featherShade });
    chest.scale.set(1.1, 1.0, 1.0);
    chest.position.set(0.16, 0.30, 0);
    this.body.add(chest);

    // tail — a flattened wedge pointing back
    const tail = cone(0.17, 0.44, 4, PAL.feather, { up: PAL.featherSheen, down: PAL.featherShade });
    tail.rotation.z = Math.PI / 2 + 0.22;
    tail.scale.set(1, 1, 0.42);
    tail.position.set(-0.52, 0.30, 0);
    this.body.add(tail);
    this.tail = tail;

    // head on a neck pivot, so it can counter-bob and tick independently
    this.neck = new THREE.Group();
    this.neck.position.set(0.30, 0.42, 0);
    this.body.add(this.neck);

    const head = ico(0.165, 0, PAL.feather, { up: PAL.featherSheen, down: PAL.featherShade });
    head.scale.set(1.15, 1.05, 1.0);
    this.neck.add(head);

    const beak = cone(0.072, 0.30, 4, PAL.beak, { up: PAL.beak, down: PAL.featherShade });
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.26, -0.015, 0);
    this.neck.add(beak);
    this.beak = beak;

    // The one bright value on the bird.
    for (const s of [-1, 1]) {
      const white = ico(0.052, 0, PAL.eye, { shadow: false });
      white.position.set(0.10, 0.045, s * 0.115);
      this.neck.add(white);
      const pupil = ico(0.028, 0, PAL.featherShade, { shadow: false });
      pupil.position.set(0.135, 0.045, s * 0.128);
      this.neck.add(pupil);
    }

    // wings, pivoting at the shoulder
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.02, 0.36, s * 0.16);
      const wing = box(0.52, 0.055, 0.30, PAL.feather, { up: PAL.featherSheen, down: PAL.featherShade });
      wing.position.set(-0.06, 0, s * 0.17);
      pivot.add(wing);
      const tip = box(0.28, 0.045, 0.20, PAL.featherShade, { up: PAL.featherSheen, down: PAL.featherShade });
      tip.position.set(-0.28, -0.01, s * 0.30);
      pivot.add(tip);
      pivot.userData.side = s;
      this.body.add(pivot);
      this.wings.push(pivot);
    }

    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.04, 0.19, s * 0.09);
      const shin = cyl(0.026, 0.026, 0.20, 5, PAL.beak, { shadow: false });
      shin.position.y = -0.10;
      pivot.add(shin);
      const foot = box(0.15, 0.03, 0.10, PAL.beak, { shadow: false });
      foot.position.set(0.03, -0.20, 0);
      pivot.add(foot);
      this.body.add(pivot);
      this.legs.push(pivot);
    }

    // where a carried item hangs
    this.grip = new THREE.Group();
    this.grip.position.set(0.42, -0.03, 0);
    this.neck.add(this.grip);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  get beakWorld() {
    const v = new THREE.Vector3(0.44, 0, 0);
    this.neck.localToWorld(v);
    return v;
  }

  /** Knocked out of the air by a human. Drops whatever is in the beak. */
  fumble(fromX, fromZ) {
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / d) * 6.5, 5.0, (dz / d) * 6.5);
    this.grounded = false;
    this.stunned = 0.75;
  }

  update(dt, input, world, audio) {
    const wasGrounded = this.grounded;

    if (this.stunned > 0) this.stunned -= dt;
    const canControl = this.stunned <= 0;

    // ── horizontal intent, in camera space ──────────────────────────────────
    const { forward, right } = this.stage.basis();
    const wish = new THREE.Vector3();
    if (canControl) {
      wish.addScaledVector(right, input.move.x);
      wish.addScaledVector(forward, -input.move.y);
      if (wish.lengthSq() > 1) wish.normalize();
    }

    // Water is thick: the fountain slows you and soaks you.
    const wetPenalty = this.inWater ? 0.45 : (this.wet > 0 ? 0.82 : 1);
    const targetSpeed = (this.grounded ? WALK_SPEED : AIR_SPEED) * wetPenalty;
    const accel = this.grounded ? 26 : 13;

    const desiredX = wish.x * targetSpeed;
    const desiredZ = wish.z * targetSpeed;
    this.vel.x += (desiredX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (desiredZ - this.vel.z) * Math.min(1, accel * dt);

    // ── flap / glide ────────────────────────────────────────────────────────
    const wantFlap = canControl && input.flap;
    // Flapping in water is free, and is not gated on having anything left.
    // Water already costs 20% of flap power and 55% of ground speed; charging
    // stamina on top of that only ever produced one outcome, which was a player
    // stuck in a fountain with an empty bar.
    if (wantFlap && (this.stamina > 0.02 || this.inWater)) {
      const power = this.inWater ? WATER_FLAP : 1;
      if (!this.inWater) this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.vel.y < FLAP_MAX_RISE * power) this.vel.y += FLAP_ACCEL * power * dt;
      if (this.inWater) this.vel.y = Math.max(this.vel.y, WATER_HEAVE);
      this.grounded = false;
      this._flapping = 1;
      // One beat per wing cycle, not one per takeoff.
      this._beatT -= dt;
      if (this._beatT <= 0) { audio.wingbeat(); this._beatT = 0.36; }
    } else {
      this._flapping = Math.max(0, this._flapping - dt * 3);
      this._beatT = 0;
    }

    if (!this.grounded) {
      // Gliding — holding no flap while moving forward and falling slowly.
      const gliding = !wantFlap && this.vel.y < 0.5 && wish.lengthSq() > 0.1;
      this.vel.y -= (gliding ? GLIDE_GRAVITY : GRAVITY) * dt;
      if (this.vel.y < -14) this.vel.y = -14;
    }

    // Regen used to require `grounded`, and buoyancy means a crow in the
    // fountain is never grounded — so the basin only ever took stamina. Opening
    // the rim was not enough on its own: the wall was climbable, but nobody
    // arrived at it with anything left to climb with.
    //
    // In water it regenerates even while flapping, unlike on the ground. The
    // crow is heaving off a basin floor a foot beneath it, not hovering, and
    // net +0.20/s means you cannot strand yourself in ankle-deep water whatever
    // you do with the key — including holding it down on an empty bar, which is
    // exactly what a player does when they think they are stuck.
    if (this.grounded || this.inWater) {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
    }

    // ── integrate + collide ─────────────────────────────────────────────────
    this._move(dt, world);

    // ── water ───────────────────────────────────────────────────────────────
    // `fountain` is whichever water body the level has — a plaza fountain on the
    // block, a plunge pool on the roof terrace. The name is the field the crow
    // and the pickups both read; the fiction is the level's business.
    const f = world.fountain;
    const inRing = Math.hypot(this.pos.x - f.x, this.pos.z - f.z) < f.r - 0.7;
    // Bounded below as well as above. The upper test alone says "anywhere under
    // the surface", which is true of the whole column of air beneath a pool that
    // is not at ground level — a crow in the yard would have been swimming in a
    // pool five metres over its head. Costs nothing at y = 0, where the floor is
    // 0.06 and the bound is -0.54.
    const nowInWater = inRing && this.pos.y < f.rim - 0.05 && this.pos.y > f.floor - 0.6;
    if (nowInWater && !this.inWater) audio.plop();
    this.inWater = nowInWater;
    if (nowInWater) {
      this.wet = 3.0;
      // Buoyancy, so you bob rather than sink and get stuck.
      if (this.pos.y < f.rim - 0.34) this.vel.y += 26 * dt;
    }
    if (this.wet > 0) this.wet -= dt;

    // ── facing ──────────────────────────────────────────────────────────────
    const speed2 = Math.hypot(this.vel.x, this.vel.z);
    if (speed2 > 0.35) {
      const want = Math.atan2(-this.vel.z, this.vel.x);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, 13 * dt);
    }
    this.root.rotation.y = this.heading;
    this.root.position.copy(this.pos);

    this._animate(dt, speed2, audio);

    if (!wasGrounded && this.grounded && this.vel.y <= 0) audio.step();
  }

  _move(dt, world) {
    const p = this.pos;
    const cols = world.colliders;

    // Scrambling only happens from a standing or floating start — no grabbing
    // ledges out of the air. Afloat, the crow pushes off the water surface
    // rather than off whatever height the bob has it at this instant, so
    // climbing out of the basin does not depend on catching the bob right.
    const afloat = this.inWater;
    const canScramble = this.grounded || afloat;
    const from = afloat ? Math.max(p.y, world.fountain.rim - 0.20) : p.y;
    /**
     * A ledge can be scrambled onto if its base is at or below your feet and its
     * top is within a step.
     *
     * The base test used to be `c.bottom <= 0.01`, which is the same statement
     * as long as your feet are on the ground and a lie the moment they are not.
     * On level 2 the plunge pool's rim sits on a terrace five metres up, so its
     * `bottom` is 5.4 — and a crow floating in that pool could not climb out of
     * it at any heading. The basin was a lobster pot again, for the second time,
     * for a completely different reason.
     *
     * What it is really guarding against is climbing onto something with air
     * underneath it: a café awning, a scaffold deck. Measured from the crow's own
     * feet, that still holds, and it holds on every floor.
     */
    const scrambles = (c) => canScramble && c.bottom <= from + 0.01 && c.top - from <= STEP_UP;
    let stepTo = -Infinity;

    /**
     * Head bonk, resolved before the lateral passes rather than after them.
     *
     * The X and Z passes decide which colliders the crow is level with using its
     * *current* y, so a crow rising into the underside of a platform spends one
     * frame reading as "inside" and gets shoved sideways out of it instead of
     * stopped underneath it. On a fire escape — three landings 0.25m thick,
     * stacked, with air under each — that fired on nearly every climb and threw
     * the bird a metre and a half across the yard.
     *
     * Only things with air beneath them can be bonked, which is the correct set:
     * landings, the cradle, café awnings, scaffold decks, tabletops, the water
     * tank on its legs. Anything sitting on a floor has `bottom` at or below it
     * and is never a ceiling.
     */
    if (this.vel.y > 0) {
      const nextY = p.y + this.vel.y * dt;
      for (const c of cols) {
        if (!c.perch || c.shape === 'ring' || c.bottom <= 0.01) continue;
        if (p.y + 0.42 > c.bottom || nextY + 0.42 <= c.bottom) continue;
        if (overlaps(c, p.x, p.z, SUPPORT)) { this.vel.y = 0; break; }
      }
    }

    // X then Z then Y, resolved separately — cheap, stable, and good enough for
    // a block made almost entirely of axis-aligned boxes.
    //
    // Each axis only resolves overlaps *it* caused. Without that, a crow moving
    // purely along z would enter a box's footprint, and the x pass — which runs
    // first and sees a full 2-D overlap — would shove it sideways out of a wall
    // it had not touched, by however far the nearer face happened to be. That is
    // the "clipping through the fire escape" report: three stacked landings,
    // approached head-on, each one flinging the bird a metre across the yard.
    const x0 = p.x, z0 = p.z;
    const heldX = (c) => x0 + RADIUS > c.minX && x0 - RADIUS < c.maxX;
    const heldZ = (c) => z0 + RADIUS > c.minZ && z0 - RADIUS < c.maxZ;

    p.x += this.vel.x * dt;
    for (const c of cols) {
      if (c.shape === 'ring') continue;
      if (p.y >= c.top - 0.02 || p.y + 0.5 <= c.bottom) continue;
      if (p.x + RADIUS > c.minX && p.x - RADIUS < c.maxX && p.z + RADIUS > c.minZ && p.z - RADIUS < c.maxZ) {
        if (heldX(c)) continue;      // x was already inside; z is the culprit
        if (scrambles(c)) {
          // Carry on over it, but far enough in that the Y pass will find a
          // floor. Stopping at the face leaves the crow overhanging its own
          // support and it drops straight back off.
          stepTo = Math.max(stepTo, c.top);
          p.x = this.vel.x > 0
            ? Math.max(p.x, c.minX - SUPPORT + 0.02)
            : Math.min(p.x, c.maxX + SUPPORT - 0.02);
          continue;
        }
        // Out through the nearer face, not the one the sign of the velocity
        // implies. Those are the same face whenever the crow walked into a wall,
        // and wildly different when it rose into the *side* of something thin
        // with no lateral speed at all: `vel.x > 0` is then false, so the crow
        // was ejected east however deep inside it was and whichever side it came
        // from. On the fire escape — three stacked landings 0.25m thick — that
        // fired constantly and threw the bird up to 3.2m sideways, sometimes
        // straight through the block's edge. resolveWalk has always picked the
        // shallowest axis for exactly this reason; this is the same rule.
        p.x = p.x - (c.minX - RADIUS) < (c.maxX + RADIUS) - p.x
          ? c.minX - RADIUS
          : c.maxX + RADIUS;
        this.vel.x = 0;
      }
    }

    p.z += this.vel.z * dt;
    for (const c of cols) {
      if (c.shape === 'ring') continue;
      if (p.y >= c.top - 0.02 || p.y + 0.5 <= c.bottom) continue;
      if (p.x + RADIUS > c.minX && p.x - RADIUS < c.maxX && p.z + RADIUS > c.minZ && p.z - RADIUS < c.maxZ) {
        if (heldZ(c)) continue;      // z was already inside; x was the culprit
        if (scrambles(c)) {
          stepTo = Math.max(stepTo, c.top);
          p.z = this.vel.z > 0
            ? Math.max(p.z, c.minZ - SUPPORT + 0.02)
            : Math.min(p.z, c.maxZ + SUPPORT - 0.02);
          continue;
        }
        p.z = p.z - (c.minZ - RADIUS) < (c.maxZ + RADIUS) - p.z
          ? c.minZ - RADIUS
          : c.maxZ + RADIUS;
        this.vel.z = 0;
      }
    }

    // Rings resolve radially, after both axes. A circular wall has no axis to
    // slide along, and the ring of boxes that used to stand in for one is
    // exactly how the fountain ended up with three doors and no exits.
    for (const c of cols) {
      if (c.shape !== 'ring') continue;
      if (p.y >= c.top - 0.02 || p.y + 0.5 <= c.bottom) continue;
      const dx = p.x - c.cx, dz = p.z - c.cz;
      const d = Math.hypot(dx, dz);
      if (d + RADIUS <= c.rInner || d - RADIUS >= c.rOuter) continue;
      const s = d || 1e-6;
      // Climbing out of the fountain. Only ever reachable from the inside: out
      // on the paving `from` is 0 and a 0.62 rim is far out of range, so the
      // wall still holds against anyone walking at it.
      if (scrambles(c)) {
        stepTo = Math.max(stepTo, c.top);
        const onStone = c.rInner - SUPPORT + 0.02;
        if (d < onStone) {
          p.x = c.cx + (dx / s) * onStone;
          p.z = c.cz + (dz / s) * onStone;
        }
        continue;
      }
      // Nearer face wins, so you are let out of the basin as readily as in.
      const to = d < (c.rInner + c.rOuter) / 2 ? c.rInner - RADIUS : c.rOuter + RADIUS;
      p.x = c.cx + (dx / s) * to;
      p.z = c.cz + (dz / s) * to;
      // Kill only the radial part of the velocity — you keep sliding round it.
      const nx = dx / s, nz = dz / s;
      const radial = this.vel.x * nx + this.vel.z * nz;
      this.vel.x -= radial * nx;
      this.vel.z -= radial * nz;
    }

    // Apply the scramble before the vertical pass, so `prevY` is the ledge top
    // and the Y pass lands the crow on it rather than treating it as a fall.
    if (stepTo > p.y) {
      p.y = stepTo;
      if (this.vel.y < 0) this.vel.y = 0;
    }

    const prevY = p.y;
    p.y += this.vel.y * dt;
    this.grounded = false;

    let floor = 0;
    for (const c of cols) {
      if (!c.perch) continue;
      if (overlaps(c, p.x, p.z, RADIUS * 0.7)) {
        // Land only when falling onto it from above.
        if (prevY >= c.top - 0.06 && c.top > floor) floor = c.top;
        // Head bonk on an underside.
        if (this.vel.y > 0 && prevY + 0.42 <= c.bottom && p.y + 0.42 > c.bottom) {
          p.y = c.bottom - 0.42;
          this.vel.y = 0;
        }
      }
    }

    if (p.y <= floor) {
      p.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    }

    // The fountain floor is below its rim — but only for a crow that is actually
    // in the basin, not for one directly under a raised one.
    const f = world.fountain;
    if (Math.hypot(p.x - f.x, p.z - f.z) < f.r - 0.7 && p.y < f.floor && p.y > f.floor - 0.6) {
      p.y = f.floor;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    }
  }

  _animate(dt, speed2, audio) {
    const moving = this.grounded && speed2 > 0.4;

    // Walk: legs alternate, body bobs, head counter-bobs so it stays level.
    // The head staying still while the body moves is the entire read.
    if (moving) {
      this._walkPhase += dt * speed2 * 3.1;
      this._stepTimer -= dt;
      if (this._stepTimer <= 0) {
        this._stepTimer = Math.max(0.16, 1.2 / Math.max(1, speed2));
        audio.step();
      }
    } else {
      this._walkPhase += dt * 1.2;
    }

    const bobT = moving ? Math.sin(this._walkPhase * 2) * 0.035 : Math.sin(this._walkPhase) * 0.012;
    this._bob += (bobT - this._bob) * Math.min(1, 16 * dt);
    this.body.position.y = this._bob;
    this.neck.position.y = 0.42 - this._bob * 0.85;

    // Forward tilt: indignant on the ground, nose-up on the downstroke.
    const tiltTarget = this.grounded
      ? (moving ? 0.16 : 0.06)
      : THREE.MathUtils.clamp(-this.vel.y * 0.045, -0.35, 0.45);
    this.body.rotation.z += (tiltTarget - this.body.rotation.z) * Math.min(1, 9 * dt);

    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      if (this.grounded) {
        const ph = this._walkPhase + i * Math.PI;
        leg.rotation.z = moving ? Math.sin(ph) * 0.65 : 0;
        leg.position.y = 0.19 + (moving ? Math.max(0, Math.cos(ph)) * 0.05 : 0);
      } else {
        // Tucked in flight.
        leg.rotation.z += (1.15 - leg.rotation.z) * Math.min(1, 10 * dt);
      }
    }

    // Wings: fast attack, slow release when flapping; held flat when gliding.
    if (this._flapping > 0.02) this._flapPhase += dt * 17;
    const gliding = !this.grounded && this._flapping <= 0.02;
    for (const w of this.wings) {
      const s = w.userData.side;
      let target;
      if (this._flapping > 0.02) {
        const raw = Math.sin(this._flapPhase);
        target = (raw > 0 ? raw * 1.15 : raw * 0.55) * this._flapping;
      } else if (gliding) {
        target = 0.18;
      } else {
        target = -0.06 + Math.sin(this._walkPhase * 0.7) * 0.02;
      }
      w.rotation.x += (target * -s - w.rotation.x) * Math.min(1, 22 * dt);
      w.rotation.y += ((gliding ? -0.12 : 0) - w.rotation.y) * Math.min(1, 8 * dt);
    }

    this.tail.rotation.z = Math.PI / 2 + 0.22 - (this.grounded ? 0 : 0.25);

    // Idle head tick. This one beat does more for making the bird feel alive
    // than everything else put together.
    this._idleTick -= dt;
    if (this._idleTick <= 0 && this.grounded && !moving) {
      this._idleTick = 1.6 + Math.random() * 3.4;
      this._headTick = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
    }
    this._headTick *= Math.max(0, 1 - dt * 7);
    this.neck.rotation.y = this._headTick;
    this.neck.rotation.z = this._headTick * 0.25;

    // Carried item swings with a lag spring.
    if (this.carried) {
      const g = this.grip;
      g.rotation.z += (-this.body.rotation.z * 0.7 - g.rotation.z) * Math.min(1, 10 * dt);
    }
  }
}
