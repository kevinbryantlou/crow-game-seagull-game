/**
 * HUD.
 *
 * Six elements, borrowing the block's own municipal-signage vocabulary.
 * Anything a seventh would say, the world says instead.
 * See docs/style-guide.html §7.
 */

import { moneyInWords } from './words.js';

const $ = (id) => document.getElementById(id);

/**
 * Spell the final amount across the ending headline, one word at a time.
 * Dollars on the first line, cents on the second in brass.
 */
export function setEndingTitle(total) {
  const el = $('ending-title');
  const { dollars, cents } = moneyInWords(total);
  el.textContent = '';

  let i = 0;
  const addLine = (text, cls) => {
    const line = document.createElement('span');
    line.className = `ln${cls ? ` ${cls}` : ''}`;
    const parts = text.split(' ');
    parts.forEach((word, idx) => {
      const w = document.createElement('span');
      // The unit word — "dollars" / "cents" — is brass; the number is not.
      w.className = idx === parts.length - 1 ? 'w u' : 'w';
      w.textContent = word;
      w.style.animationDelay = `${0.09 * i++}s`;
      line.append(w, document.createTextNode(' '));
    });
    el.append(line);
  };

  if (dollars) addLine(dollars);
  if (cents) addLine(cents, 'cents');

  // Everything below the headline waits for the words to finish landing.
  const after = `${0.09 * i + 0.25}s`;
  for (const id of ['rank', 'ending-body', 'ending-actions']) {
    const node = $(id);
    if (node) node.style.animationDelay = after;
  }
}

/**
 * Re-arm the ending screen's entrance animation.
 *
 * A CSS animation runs once per element per page life, and until now that was
 * exactly right: the only way to see a second ending was to reload. Now that
 * "Again!" rebuilds the level in place, the same nodes are shown again in the
 * same document, and every ending after the first would appear fully-formed
 * with no fade — visibly different from the first one, for no reason a player
 * could account for.
 *
 * Removing the class, forcing a reflow, and putting it back is the standard
 * way to restart one. Two things this depends on, both easy to get wrong:
 * the reflow read is load-bearing, because without it the browser coalesces
 * both style changes and nothing happens at all; and the screen has to be
 * *visible* already, because a reflow read on a `display: none` element
 * measures nothing and restarts nothing. Call it after the reveal.
 */
export function replayEndingAnimation() {
  const screen = $('ending');
  if (!screen) return;
  screen.classList.add('no-anim');
  void screen.offsetWidth;
  screen.classList.remove('no-anim');
}

export class Hud {
  constructor(goal, sessionSeconds) {
    this.sessionSeconds = sessionSeconds;
    this.goal = goal;
    this.amt = $('amt');
    // The target under the counter is markup, and it said "of $20.00" whatever
    // the level was actually asking for — the bar filled to the right place and
    // the number beside it lied. Write it from the goal.
    $('goal').textContent = `of $${goal.toFixed(2)}`;
    this.barFill = $('bar-fill');
    this.taskList = $('task-list');
    this.tasks = $('tasks');
    this.tasksToggle = $('tasks-toggle');
    this.tasksCount = $('tasks-count');
    this._doneIds = new Set();
    this._tasksT = 0;
    this._tasksAuto = false;
    this.prompt = $('prompt');
    this.toastEl = $('toast');
    this.carryEl = $('carry');
    this.sun = $('sun');
    this.sunDot = $('sun-dot');
    this.stam = $('stam');
    this.stamFill = $('stam-fill');
    this._shown = -1;
    this._taskEls = new Map();
    this._toastT = 0;
    this._projected = { x: 0, y: 0, visible: false };

    // Controls legend: open at the start, collapses itself once the player has
    // had time to read it, and is always one key away after that. No modal and
    // no pause — this is a game with no fail state, it should not stop.
    this.controls = $('controls');
    this.controlsToggle = $('controls-toggle');
    this._controlsT = 0;
    this.controlsToggle.addEventListener('click', () => this.toggleControls());
    this.tasksToggle.addEventListener('click', () => this.toggleTasks());
  }

  /**
   * Point the HUD at a different block, without rebuilding it.
   *
   * The DOM nodes and the two toggle listeners are bound once in the
   * constructor and the nodes are permanent, so a second `new Hud()` would
   * stack a second click handler on each toggle and every press would fire
   * twice. Everything that is actually per-run is reset here instead.
   *
   * The task list is the part that fails loudest if this is skipped:
   * `setTasks` keys off task id and only ever appends, so swapping to a block
   * with different ids leaves the previous block's rows in the list underneath
   * the new ones, with a count that describes neither.
   */
  reset(goal, sessionSeconds) {
    this.goal = goal;
    this.sessionSeconds = sessionSeconds;
    $('goal').textContent = `of $${goal.toFixed(2)}`;

    this.taskList.replaceChildren();
    this._taskEls.clear();
    this._doneIds.clear();
    this._tasksT = 0;
    this._tasksAuto = false;
    this.toggleTasks(true);

    this._shown = -1;
    this._toastT = 0;
    this.toastEl.classList.remove('on');
    this.setCarry(null);
    this.setPrompt(null, null);
    this.setNestPointer(null);
    this.setMoney(0);

    this._controlsT = 0;
    this.toggleControls(true);
  }

  toggleControls(force) {
    const collapsed = force === undefined
      ? !this.controls.classList.contains('collapsed')
      : !force;
    this.controls.classList.toggle('collapsed', collapsed);
    this.controlsToggle.setAttribute('aria-expanded', String(!collapsed));
    this._controlsT = 0;   // an explicit choice is not overridden by the timer
  }

  /** Start the auto-collapse countdown when play actually begins. */
  beginControlsCountdown(seconds = 25) {
    this._controlsT = seconds;
  }

  setMoney(total) {
    const v = `$${total.toFixed(2)}`;
    if (this.amt.textContent !== v) {
      this.amt.textContent = v;
      this.amt.classList.add('pop');
      setTimeout(() => this.amt.classList.remove('pop'), 130);
    }
    this.barFill.style.width = `${Math.min(100, (total / this.goal) * 100)}%`;
  }

  setTasks(tasks) {
    let done = 0;
    let newlyDone = false;
    for (const t of tasks) {
      let el = this._taskEls.get(t.id);
      if (!el) {
        el = document.createElement('li');
        el.textContent = t.text;
        this.taskList.appendChild(el);
        this._taskEls.set(t.id, el);
      }
      el.classList.toggle('done', !!t.done);
      if (t.done) {
        done++;
        if (!this._doneIds.has(t.id)) { this._doneIds.add(t.id); newlyDone = true; }
      }
    }
    this.tasksCount.textContent = `${done}/${tasks.length}`;

    // Ticking something off while collapsed is worth seeing, so the list opens
    // for a moment and then gets out of the way again.
    if (newlyDone && this._tasksAuto) this.toggleTasks(true, 4);
  }

  /**
   * @param {boolean} [open]     force a state; omit to flip
   * @param {number}  [recollapse] seconds until it auto-collapses again
   */
  toggleTasks(open, recollapse) {
    const collapsed = open === undefined
      ? !this.tasks.classList.contains('collapsed')
      : !open;
    this.tasks.classList.toggle('collapsed', collapsed);
    this.tasksToggle.setAttribute('aria-expanded', String(!collapsed));
    this._tasksT = collapsed ? 0 : (recollapse ?? 0);
  }

  /**
   * Auto-collapse only where the space actually matters. On a phone the list is
   * a meaningful share of the screen; on a desktop it costs nothing.
   */
  enableTaskAutoCollapse(seconds = 12) {
    this._tasksAuto = true;
    this._tasksT = seconds;
  }

  setCarry(label) {
    if (label) {
      this.carryEl.textContent = `Carrying — ${label}`;
      this.carryEl.classList.add('on');
    } else {
      this.carryEl.classList.remove('on');
    }
  }

  /**
   * The prompt carries the key that performs it, so the primary verb is taught
   * exactly where and when it is needed rather than in a menu.
   * @param {{verb:string,noun:string}|null} action
   */
  /**
   * Ease a tracked HUD position, and snap it to whole pixels.
   *
   * The projected point is noisier than the thing it is tracking. The crow's
   * *world* position advances smoothly — measured coefficient of variation 0.08
   * at constant velocity — while its *screen* position came out at 6.28, ±1–2px
   * of frame-to-frame noise around a mean motion of 0.06px. The noise was six
   * times the signal.
   *
   * That is not a bug in the camera, which eases correctly frame-rate
   * independently. It is that the screen position is the *difference* between
   * the crow and a camera that follows it, so the crow sits near the middle of
   * the frame and the quantity being drawn is a small difference of two large
   * ones. Any variation in frame time lands on it whole.
   *
   * So: a short low-pass, at 40ms — well under the camera's own 133ms of lag,
   * so nothing feels detached — and then a round, because a fractional pixel is
   * what makes the browser re-rasterise the text.
   *
   * @param {{x:number,y:number}|null} at  last eased position, or null to jump
   */
  static _ease(at, x, y, dt) {
    /**
     * A big jump is a teleport, a level swap, or the tracked point crossing
     * behind the camera. Easing across one of those draws a line between two
     * unrelated places, so it is taken whole.
     *
     * Two things about this condition are deliberate.
     *
     * The threshold is a fraction of the viewport diagonal, not a constant. It
     * was 220px, which is fine on a desktop and exactly wrong on a 360px
     * Android: the nest pointer's clamp rectangle is `innerWidth - 140` wide,
     * so a pointer flipping from one edge to the other there moves *exactly*
     * 220px, `> 220` is false by a hair, and it slides across the whole screen
     * instead of cutting. A viewport-relative bound cannot land on that edge.
     *
     * And it is written as `!(d <= T)` rather than `d > T` so that NaN takes
     * the snap branch. `Math.hypot(NaN, NaN) > 220` is *false*, which sent a
     * NaN straight into the filter, and once `at` held NaN every later frame
     * stayed NaN — because NaN never exceeds a threshold either. The transform
     * string then became `translate3d(NaNpx, …)`, which the CSSOM silently
     * ignores, so the element froze at its last good position for the rest of
     * the run. The old code wrote `left: NaNpx` and was equally ignored, but it
     * healed on the next good frame; the filter is what made it permanent.
     */
    // Defaulted so the function is pure enough to unit test, and so a NaN
    // viewport cannot poison the threshold it is supposed to enforce.
    const vw = globalThis.innerWidth || 1280;
    const vh = globalThis.innerHeight || 800;
    const T = 0.2 * Math.hypot(vw, vh);
    if (!at || !(Math.hypot(x - at.x, y - at.y) <= T) || !(dt > 0)) return { x, y };
    const k = 1 - Math.exp(-25 * dt);
    return { x: at.x + (x - at.x) * k, y: at.y + (y - at.y) * k };
  }

  setPrompt(action, screen, showKey = false, dt = 0) {
    if (!action || !screen || !screen.visible) {
      this.prompt.classList.remove('on');
      // Dropped rather than kept: easing in from where the prompt was last time
      // it was up would slide it across the block on its way back.
      this._promptAt = null;
      return;
    }
    const key = showKey && action.kind ? '<kbd>J</kbd>' : '';
    const html = `${key}<b>${action.verb}</b> — ${action.noun}`;
    // Rebuilding this every frame reparses the HTML and destroys and recreates
    // the child nodes sixty times a second, for a string that changes when the
    // player walks up to a different object.
    if (html !== this._promptHtml) {
      this.prompt.innerHTML = html;
      this._promptHtml = html;
    }
    this._promptAt = Hud._ease(this._promptAt, screen.x, screen.y - 14, dt);
    this.prompt.style.transform =
      `translate3d(${Math.round(this._promptAt.x)}px, ${Math.round(this._promptAt.y)}px, 0) translate(-50%, -100%)`;
    this.prompt.classList.add('on');
  }

  /** @param {{x:number,y:number,angle:number}|null} s */
  setNestPointer(s, dt = 0) {
    if (!this.nestPtr) {
      this.nestPtr = $('nestptr');
      this.nestArrow = $('nestptr-arrow');
    }
    if (!s) { this.nestPtr.classList.remove('on'); this._nestAt = null; return; }
    this.nestPtr.classList.add('on');
    this._nestAt = Hud._ease(this._nestAt, s.x, s.y, dt);
    this.nestPtr.style.transform =
      `translate3d(${Math.round(this._nestAt.x)}px, ${Math.round(this._nestAt.y)}px, 0) translate(-50%, -50%)`;
    // The arrow spins to point at the nest; it is its own element so this does
    // not fight the wrapper's transform.
    const angle = `${s.angle.toFixed(1)}deg`;
    if (angle !== this._nestAngle) {
      this.nestArrow.style.rotate = angle;
      this._nestAngle = angle;
    }
  }

  setStamina(v, visible) {
    this.stam.classList.toggle('on', visible);
    this.stamFill.style.width = `${Math.max(0, v) * 100}%`;
    this.stam.classList.toggle('low', v < 0.25);
  }

  /**
   * @param {number} t        time of day, 0..1 — where the sun is drawn
   * @param {number} elapsed  seconds since this run began
   *
   * The two are not the same number any more. Level 2 starts in the late
   * afternoon, so its `t` is already past 0.4 on the first frame; deriving
   * elapsed from it would show the clock immediately, which is exactly the
   * class of bug that made this line `30 / (18 * 60)` in the first place.
   */
  setTime(t, elapsed = t * this.sessionSeconds) {
    // Hidden for the first 30 seconds — let the player look at the block before
    // being handed a clock. Thirty *seconds*, not a fraction of a hardcoded
    // session: this was `30 / (18 * 60)` and would have silently become
    // thirteen seconds when the day was shortened to eight minutes.
    this.sun.classList.toggle('on', elapsed > 30);
    const a = Math.PI - t * Math.PI;
    this.sunDot.setAttribute('cx', (54 + Math.cos(a) * 46).toFixed(1));
    this.sunDot.setAttribute('cy', (52 - Math.sin(a) * 46).toFixed(1));
  }

  toast(text, seconds = 2.0) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this._toastT = seconds;
  }

  update(dt) {
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.toastEl.classList.remove('on');
    }
    if (this._controlsT > 0) {
      this._controlsT -= dt;
      if (this._controlsT <= 0) {
        this.controls.classList.add('collapsed');
        this.controlsToggle.setAttribute('aria-expanded', 'false');
      }
    }
    if (this._tasksT > 0) {
      this._tasksT -= dt;
      if (this._tasksT <= 0) {
        this.tasks.classList.add('collapsed');
        this.tasksToggle.setAttribute('aria-expanded', 'false');
      }
    }
  }
}
