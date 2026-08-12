/**
 * Stage — renderer, the fixed camera, and the light rig that carries the sunset.
 *
 * The camera never rotates. 38° of pitch, 25° of yaw, and a long lens so the
 * block reads as a diorama on a table. See docs/design-brief.html §8.
 */

import * as THREE from 'three';
import { PAL, SKY_RAMP } from './palette.js';

const PITCH = THREE.MathUtils.degToRad(38);
const YAW = THREE.MathUtils.degToRad(25);
const DIST_GROUND = 46;
const DIST_MAX = 60;   // camera eases out as the crow climbs

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.sunHaze);
    this.scene.fog = new THREE.Fog(PAL.sunHaze, 48, 118);

    this.camera = new THREE.PerspectiveCamera(20, 1, 1, 260);

    // Key light. The only shadow caster in the game.
    this.key = new THREE.DirectionalLight(PAL.keyAfternoon, 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 160;
    /**
     * Shadow bias, and why it is not 0.03 any more.
     *
     * A 64-metre building casts a very long shadow across a very large ground
     * plane, and inside that cast shadow the depth comparison was failing in
     * bands — irregular horizontal smears along the whole frontage of level 2,
     * which reads exactly like z-fighting and is not. It only appears at certain
     * sun angles, which is why it survived a shipping pass: the block looked
     * clean at noon and striped at four o'clock.
     *
     * `normalBias` is the one that matters here — it offsets the lookup along
     * the surface normal, which is what fixes a large flat receiver the light
     * is raking across. It came from 0.03 to 0.15; the acne is gone by 0.10 and
     * the rest is margin. Shadows still touch the things casting them, which is
     * the failure mode on the other side of this knob.
     */
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.15;
    const sc = this.key.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    // Hemisphere fill. The ground-bounce colour IS the shadow colour — this is
    // what stops shade from going grey.
    this.fill = new THREE.HemisphereLight(PAL.sunHaze, PAL.shade, 0.85);
    this.scene.add(this.fill);

    // The sky itself: a big inverted sphere with a vertical gradient, cheaper
    // and more controllable than a shader on the background.
    this.sky = this._buildSky();
    this.scene.add(this.sky);

    this.target = new THREE.Vector3();
    this._smoothed = new THREE.Vector3(0, 0, 0);
    this._camPos = new THREE.Vector3();
    this._occluders = [];
    this._ray = new THREE.Raycaster();

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(200, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(PAL.skyHigh) },
        bottom: { value: new THREE.Color(PAL.sunHaze) },
      },
      vertexShader: `
        varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vH = normalize(wp.xyz).y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying float vH;
        void main() {
          float t = smoothstep(-0.08, 0.62, vH);
          gl_FragColor = vec4(mix(bottom, top, t), 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  /** Meshes that should fade to a silhouette when they get between us and the crow. */
  registerOccluders(list) {
    this._occluders = list;
    for (const o of list) {
      o.userData.fade = 0;
      o.material = o.material.clone();
      o.material.transparent = true;
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a wider lens or the block will not fit across.
    this.camera.fov = h > w ? 26 : 20;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param {THREE.Vector3} focus  where the crow is
   * @param {number} dt
   */
  follow(focus, dt) {
    // Soft dead zone plus ~0.2s of lag. Look ahead and up as the crow climbs so
    // that gaining altitude literally shows you more of the board.
    const lift = THREE.MathUtils.clamp(focus.y / 14, 0, 1);
    this.target.set(focus.x, focus.y * 0.45 + 0.6, focus.z);

    const k = 1 - Math.exp(-7.5 * dt);
    this._smoothed.lerp(this.target, k);

    const dist = THREE.MathUtils.lerp(DIST_GROUND, DIST_MAX, lift);
    const hor = Math.cos(PITCH) * dist;
    this._camPos.set(
      this._smoothed.x + Math.sin(YAW) * hor,
      this._smoothed.y + Math.sin(PITCH) * dist,
      this._smoothed.z + Math.cos(YAW) * hor,
    );
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._smoothed);

    // Keep the shadow frustum centred on the action.
    this.key.target.position.copy(this._smoothed);
    this.key.target.updateMatrixWorld();
    this.sky.position.copy(this._camPos);
  }

  /** Camera-relative movement basis, so "up" on the stick always means "away". */
  basis() {
    const f = new THREE.Vector3().subVectors(this._smoothed, this._camPos);
    f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return { forward: f, right: r };
  }

  /** Time of day, 0 → 1, drives the whole light rig. */
  setTimeOfDay(t) {
    let a = SKY_RAMP[0], b = SKY_RAMP[SKY_RAMP.length - 1], f = 0;
    for (let i = 0; i < SKY_RAMP.length - 1; i++) {
      if (t >= SKY_RAMP[i].t && t <= SKY_RAMP[i + 1].t) {
        a = SKY_RAMP[i]; b = SKY_RAMP[i + 1];
        f = (t - a.t) / (b.t - a.t);
        break;
      }
    }
    const lerpC = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);

    const high = lerpC(a.high, b.high);
    const low = lerpC(a.low, b.low);
    this.sky.material.uniforms.top.value.copy(high);
    this.sky.material.uniforms.bottom.value.copy(low);
    this.scene.fog.color.copy(low);
    this.scene.background.copy(low);

    this.key.color.copy(lerpC(a.key, b.key));
    this.key.intensity = THREE.MathUtils.lerp(a.keyI, b.keyI, f);
    this.fill.intensity = THREE.MathUtils.lerp(a.amb, b.amb, f);
    // The colour of shade. Deliberately not `low` — see the note on SKY_RAMP.
    this.fill.color.copy(lerpC(a.fill, b.fill));

    // Sun swings ~20° across the block and drops toward the horizon.
    const elev = THREE.MathUtils.lerp(a.elev, b.elev, f);
    const az = THREE.MathUtils.degToRad(-118 - t * 20);
    const d = 60;
    this.key.position.set(
      this._smoothed.x + Math.cos(az) * Math.cos(elev * Math.PI) * d,
      this._smoothed.y + Math.sin(elev * Math.PI) * d,
      this._smoothed.z + Math.sin(az) * Math.cos(elev * Math.PI) * d,
    );
  }

  /** Fade anything sitting between the camera and the crow. */
  _updateOccluders(focus, dt) {
    if (!this._occluders.length) return;
    const dir = new THREE.Vector3().subVectors(focus, this.camera.position);
    const len = dir.length();
    dir.normalize();
    this._ray.set(this.camera.position, dir);
    this._ray.far = len - 0.5;
    const hits = new Set(this._ray.intersectObjects(this._occluders, false).map((h) => h.object));

    for (const o of this._occluders) {
      const want = hits.has(o) ? 1 : 0;
      const cur = o.userData.fade;
      const next = cur + (want - cur) * (1 - Math.exp(-9 * dt));
      o.userData.fade = next;
      o.material.opacity = 1 - next * 0.78;
      o.material.transparent = next > 0.01;
    }
  }

  render(focus, dt) {
    this._updateOccluders(focus, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** World point → CSS pixels, for the beak prompt. */
  project(v3, out) {
    const p = v3.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * innerHeight;
    out.visible = p.z < 1;
    return out;
  }
}
