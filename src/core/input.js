/**
 * Unified input.
 *
 * Keyboard and touch both write into one abstract state object; the game never
 * asks which device is driving. This is the thing that makes the iOS port a
 * config change rather than a rewrite — see docs/design-brief.html §9.
 */

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'flap',
  KeyJ: 'beak', KeyE: 'beak', Enter: 'beak',
  KeyK: 'caw', KeyQ: 'caw',
};

export class Input {
  constructor() {
    /** @type {{x:number, y:number}} analogue move, -1..1, y negative is "away from camera" */
    this.move = { x: 0, y: 0 };
    this.flap = false;
    /** edge-triggered, consumed by the game each tick */
    this.beakPressed = false;
    this.cawPressed = false;
    this.anyPressed = false;

    this.hasTouch = false;

    this._keys = new Set();
    this._stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this._buttons = { flap: false };

    this._bindKeyboard();
    this._bindTouch();

    // Detect a touch device up front. The touch surface is display:none until
    // `body.touch` is set, so waiting for a touch event to set it would be
    // circular — the events can never arrive while the surface is hidden.
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) this._markTouch();
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      const a = KEY_MAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this._keys.has(a)) {
        if (a === 'beak') this.beakPressed = true;
        if (a === 'caw') this.cawPressed = true;
        this.anyPressed = true;
      }
      this._keys.add(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEY_MAP[e.code];
      if (a) this._keys.delete(a);
    });
    addEventListener('blur', () => this._keys.clear());
  }

  _bindTouch() {
    const stickEl = document.getElementById('stick');
    const knobEl = document.getElementById('stick-knob');
    const RADIUS = 56;

    const onTouchStart = (e) => {
      this._markTouch();
      for (const t of e.changedTouches) {
        // Buttons handle their own events; the stick claims the left half.
        if (t.target.closest('.btn')) continue;
        if (this._stick.active) continue;
        if (t.clientX > innerWidth * 0.5) continue;
        this._stick.active = true;
        this._stick.id = t.identifier;
        this._stick.ox = t.clientX;
        this._stick.oy = t.clientY;
        stickEl.style.left = `${t.clientX}px`;
        stickEl.style.top = `${t.clientY}px`;
        stickEl.classList.add('on');
      }
    };
    const onTouchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._stick.id) continue;
        let dx = t.clientX - this._stick.ox;
        let dy = t.clientY - this._stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
        this._stick.x = dx / RADIUS;
        this._stick.y = dy / RADIUS;
        knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
    };
    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._stick.id) continue;
        this._stick.active = false;
        this._stick.id = null;
        this._stick.x = this._stick.y = 0;
        knobEl.style.transform = 'translate(-50%, -50%)';
        stickEl.classList.remove('on');
      }
    };

    const surface = document.getElementById('touch');
    surface.addEventListener('touchstart', onTouchStart, { passive: true });
    surface.addEventListener('touchmove', onTouchMove, { passive: true });
    surface.addEventListener('touchend', onTouchEnd, { passive: true });
    surface.addEventListener('touchcancel', onTouchEnd, { passive: true });

    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => { e.preventDefault(); this._markTouch(); on(); el.classList.add('down'); };
      const up = (e) => { e.preventDefault(); off && off(); el.classList.remove('down'); };
      el.addEventListener('touchstart', down);
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', down);
      addEventListener('mouseup', up);
    };

    hold('btn-flap', () => { this._buttons.flap = true; this.anyPressed = true; },
                     () => { this._buttons.flap = false; });
    hold('btn-beak', () => { this.beakPressed = true; this.anyPressed = true; });
    hold('btn-caw',  () => { this.cawPressed = true; this.anyPressed = true; });
  }

  _markTouch() {
    if (this.hasTouch) return;
    this.hasTouch = true;
    document.body.classList.add('touch');
  }

  /** Fold every source into the abstract state. Called once per frame, before the tick. */
  sample() {
    let x = 0, y = 0;
    if (this._keys.has('left')) x -= 1;
    if (this._keys.has('right')) x += 1;
    if (this._keys.has('up')) y -= 1;
    if (this._keys.has('down')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }

    if (this._stick.active) { x = this._stick.x; y = this._stick.y; }

    // Small dead zone so a resting thumb does not drift the crow.
    if (Math.hypot(x, y) < 0.14) { x = 0; y = 0; }

    this.move.x = x;
    this.move.y = y;
    this.flap = this._keys.has('flap') || this._buttons.flap;
  }

  /** Clear edge-triggered flags at the end of a tick. */
  flush() {
    this.beakPressed = false;
    this.cawPressed = false;
    this.anyPressed = false;
  }
}
