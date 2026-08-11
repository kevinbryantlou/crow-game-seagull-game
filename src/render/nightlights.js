/**
 * Things that come on after sundown.
 *
 * Emissive only. None of these illuminate anything else — a lit window does not
 * brighten the wall beside it — and that is the whole point: emissive is a
 * constant term in a fragment shader that already runs, so the entire file adds
 * no per-frame lighting work and no lights to the scene. What it buys is the
 * read. A dark block with forty warm points in it is a city at night; the same
 * block with none is a bug. See docs/lighting-brief.html §3 (technique A) and
 * §6 (tier 1).
 *
 * Two traps this exists to contain:
 *
 * 1. `shapes.mat()` caches materials by colour, and 38 meshes share the single
 *    cached `goldLit` one — four lamp bulbs and every lit window in the skyline.
 *    Setting `.emissive` on it lights all thirty-eight at once. That is a gift
 *    for the skyline and useless for a staggered lamp, so anything that needs
 *    its own schedule gets its own clone, and everything that comes up together
 *    shares exactly one.
 * 2. The ramp is driven in *seconds*, not in time-of-day. Six seconds is 0.0056
 *    of an eighteen-minute day and 0.1 of a sixty-second test day; a schedule
 *    written in `t` would flicker for a tenth of a second in one and six
 *    seconds in the other.
 */

import * as THREE from 'three';

const smooth = (k) => k * k * (3 - 2 * k);

/**
 * A sodium lamp catching: a blip, a die, a second blip, then the slow warm.
 * Everyone recognises it and nobody could describe it.
 */
function stutter(s) {
  if (s < 0.06) return 0.85;
  if (s < 0.14) return 0.03;
  if (s < 0.19) return 0.95;
  return 0.03;
}
const STUTTER_FOR = 0.30;

/**
 * PROTOTYPE — tier 2. Not a decision, not committed.
 *
 * The pool texture: one soft radial falloff, generated once into a canvas at
 * boot and shared by every pool. Same technique as the pickup glint, which has
 * shipped since the beginning — which is the point. It is the honest version of
 * "pre-baked light textures": precomputed, no asset, no UVs, no per-light
 * shader work.
 */
let _poolTex = null;
function poolTexture() {
  if (_poolTex) return _poolTex;
  const S = 128;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const c = cvs.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,238,196,0.95)');
  g.addColorStop(0.30, 'rgba(242,207,116,0.42)');
  g.addColorStop(0.62, 'rgba(224,179,72,0.13)');
  g.addColorStop(1.00, 'rgba(224,179,72,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  _poolTex = new THREE.CanvasTexture(cvs);
  return _poolTex;
}

export class NightLights {
  /** @param {number} trigger time-of-day at which the block starts coming on */
  constructor(trigger = 0.72) {
    this.trigger = trigger;
    this.items = [];
    this.since = 0;
  }

  /**
   * Register meshes that light up together.
   *
   * They share one cloned material, so a hundred skyline windows cost one
   * assignment per frame rather than a hundred. Pass a single mesh for anything
   * that needs its own schedule.
   */
  add(meshes, color, opts = {}) {
    const list = Array.isArray(meshes) ? meshes : [meshes];
    if (!list.length) return null;

    const material = list[0].material.clone();
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = 0;
    for (const m of list) m.material = material;

    const item = {
      material,
      peak: opts.peak ?? 1,
      delay: opts.delay ?? 0,
      warm: opts.warm ?? 2.4,
      flicker: opts.flicker ?? false,
      level: 0,
    };
    this.items.push(item);
    return item;
  }

  /**
   * PROTOTYPE — tier 2. A pool of light on the paving.
   *
   * A flat additive quad, no depth write, unlit and unfogged: it is light, not
   * geometry that light falls on. It sits at y=0.05 to clear the paving slabs
   * at 0.012, and because the crow stands on top of it and writes depth, the
   * bird stays a silhouette in the pool rather than being lit by it — which is
   * the whole reason this technique survives "the crow is the darkest thing on
   * screen" where a real point light would not.
   */
  addPool(parent, x, z, radius, opts = {}) {
    const material = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    mesh.renderOrder = 2;
    parent.add(mesh);

    const item = {
      material, pool: true,
      peak: opts.peak ?? 0.34,
      delay: opts.delay ?? 0,
      warm: opts.warm ?? 2.4,
      flicker: opts.flicker ?? false,
      level: 0,
    };
    this.items.push(item);
    return item;
  }

  /** Level 0..1 for one light, `s` seconds after the block started coming on. */
  static levelAt(item, s) {
    const own = s - item.delay;
    if (own <= 0) return 0;
    if (item.flicker && own < STUTTER_FOR) return stutter(own);
    const warmStart = item.flicker ? STUTTER_FOR : 0;
    return smooth(Math.min(1, (own - warmStart) / item.warm));
  }

  /**
   * @param {number} t  time of day, 0..1
   * @param {number} dt real seconds since the last frame
   */
  update(t, dt) {
    // Before the trigger the clock sits at zero, so scrubbing time backwards in
    // a test or a debug session re-arms the whole sequence rather than leaving
    // the block lit in daylight.
    this.since = t >= this.trigger ? this.since + dt : 0;
    for (const item of this.items) {
      const level = NightLights.levelAt(item, this.since);
      if (level === item.level) continue;
      item.level = level;
      if (item.pool) item.material.opacity = level * item.peak;
      else item.material.emissiveIntensity = level * item.peak;
    }
  }
}
