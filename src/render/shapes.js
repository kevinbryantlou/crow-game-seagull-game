/**
 * Shape kit.
 *
 * Everything in the game is generated from primitives — there is no asset
 * pipeline and nothing to 404. The important function here is `tint()`, which
 * implements the style guide's three-tone rule literally: a lit value on
 * upward-facing triangles, a shade value on downward-facing ones, base
 * everywhere else. That is what makes untextured geometry read as carved.
 */

import * as THREE from 'three';

const _matCache = new Map();
/**
 * The same materials again, by identity.
 *
 * Tearing a block down means freeing its GPU resources, and every geometry in
 * the game is safe to free because no two meshes share one. Materials are the
 * exact opposite: `mat()` hands one object to every mesh of a colour — 38 of
 * them share `goldLit` — so a teardown that walks the scene disposing what it
 * finds would free materials the *next* block is about to use, and the level
 * after a replay would render undefined.
 *
 * "Do not dispose a cached material" is a rule you can hold in your head right
 * up until someone adds a fourth kind of surface. This set makes it a question
 * the code can ask: see `isSharedMaterial`, used by the teardown in main.js.
 */
const _sharedMats = new Set();

/** Is this material owned by the cache — i.e. will another block need it? */
export const isSharedMaterial = (m) => _sharedMats.has(m);

/**
 * Flat-shaded Lambert. Cached, because the block reuses maybe a dozen materials.
 *
 * `decal` is for anything lying flat on top of something else — the paving
 * variation on the ground, the road beyond the kerb, the deck surfaces on the
 * roofs. Those sit twelve millimetres above the thing they cover, which is
 * plenty of separation at the near plane and not remotely enough sixty metres
 * out at a grazing angle: the boundary breaks into a staircase of depth-test
 * coin flips, and it reads as textures clipping through each other.
 *
 * `polygonOffset` is the fix rather than more clearance, because it biases depth
 * in proportion to the polygon's own depth slope — which is exactly the term
 * that blows up on a large plane seen almost edge-on. Raising the geometry
 * instead would mean a visible step at the edge of every slab.
 *
 * The offset is part of the cache key. It has to be: `mat()` hands the same
 * object to every mesh of a colour, and quietly turning polygon offset on for
 * all 38 users of `goldLit` because one paving slab asked for it is the same
 * class of bug as the emissive one nightlights.js has a note about.
 */
export function mat(color, {
  vertexColors = false, transparent = false, opacity = 1, side, decal = false,
} = {}) {
  const key = `${color}|${vertexColors}|${transparent}|${opacity}|${side ?? 'f'}|${decal ? 'd' : ''}`;
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color, flatShading: true, vertexColors, transparent, opacity,
      side: side ?? THREE.FrontSide,
      polygonOffset: decal,
      polygonOffsetFactor: decal ? -4 : 0,
      polygonOffsetUnits: decal ? -4 : 0,
    });
    _matCache.set(key, m);
    _sharedMats.add(m);
  }
  return m;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _n = new THREE.Vector3();

/**
 * Paint per-face colours based on which way each triangle points.
 * Returns a non-indexed geometry carrying a `color` attribute.
 */
export function tint(geometry, base, up = null, down = null, upThresh = 0.35, downThresh = -0.25) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  const cBase = new THREE.Color(base);
  const cUp = new THREE.Color(up ?? base);
  const cDown = new THREE.Color(down ?? base);

  for (let i = 0; i < count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    _ab.subVectors(_b, _a);
    _ac.subVectors(_c, _a);
    _n.crossVectors(_ab, _ac).normalize();

    const c = _n.y > upThresh ? cUp : _n.y < downThresh ? cDown : cBase;
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function finish(geo, colors, opts) {
  const { up, down, shadow = true, receive = true, transparent, opacity, side, decal } = opts;
  let material;
  let geometry = geo;
  if (up != null || down != null) {
    // tint() returns a non-indexed CLONE for indexed inputs, so the result has
    // to replace the original. Dropping it leaves a mesh with vertexColors on
    // and no color attribute, which the shader reads as pure black.
    geometry = tint(geo, colors, up, down);
    material = mat(0xffffff, { vertexColors: true, transparent, opacity, side, decal });
  } else {
    material = mat(colors, { transparent, opacity, side, decal });
  }
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = receive;
  return m;
}

export function box(w, h, d, color, opts = {}) {
  return finish(new THREE.BoxGeometry(w, h, d), color, opts);
}

export function cyl(rTop, rBot, h, seg, color, opts = {}) {
  return finish(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, opts);
}

export function cone(r, h, seg, color, opts = {}) {
  return finish(new THREE.ConeGeometry(r, h, seg), color, opts);
}

export function ico(r, detail, color, opts = {}) {
  return finish(new THREE.IcosahedronGeometry(r, detail), color, opts);
}

export function sphere(r, wSeg, hSeg, color, opts = {}) {
  return finish(new THREE.SphereGeometry(r, wSeg, hSeg), color, opts);
}

export function plane(w, d, color, opts = {}) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  return finish(geo, color, { shadow: false, ...opts });
}

/** Convenience: position a mesh and return it, so builders read as one expression. */
export function at(mesh, x, y, z, ry = 0) {
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  return mesh;
}

export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}
