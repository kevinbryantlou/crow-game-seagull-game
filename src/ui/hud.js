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
  for (const id of ['rank', 'ending-body', 'again']) {
    const node = $(id);
    if (node) node.style.animationDelay = after;
  }
}

export class Hud {
  constructor(goal, sessionSeconds) {
    this.sessionSeconds = sessionSeconds;
    this.goal = goal;
    this.amt = $('amt');
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
  setPrompt(action, screen, showKey = false) {
    if (!action || !screen || !screen.visible) {
      this.prompt.classList.remove('on');
      return;
    }
    const key = showKey && action.kind ? '<kbd>J</kbd>' : '';
    this.prompt.innerHTML = `${key}<b>${action.verb}</b> — ${action.noun}`;
    this.prompt.style.left = `${screen.x}px`;
    this.prompt.style.top = `${screen.y - 14}px`;
    this.prompt.classList.add('on');
  }

  /** @param {{x:number,y:number,angle:number}|null} s */
  setNestPointer(s) {
    if (!this.nestPtr) {
      this.nestPtr = $('nestptr');
      this.nestArrow = $('nestptr-arrow');
    }
    if (!s) { this.nestPtr.classList.remove('on'); return; }
    this.nestPtr.classList.add('on');
    this.nestPtr.style.left = `${s.x}px`;
    this.nestPtr.style.top = `${s.y}px`;
    this.nestArrow.style.rotate = `${s.angle}deg`;
  }

  setStamina(v, visible) {
    this.stam.classList.toggle('on', visible);
    this.stamFill.style.width = `${Math.max(0, v) * 100}%`;
    this.stam.classList.toggle('low', v < 0.25);
  }

  setTime(t) {
    // Hidden for the first 30 seconds — let the player look at the block before
    // being handed a clock. Thirty *seconds*, not a fraction of a hardcoded
    // session: this was `30 / (18 * 60)` and would have silently become
    // thirteen seconds when the day was shortened to eight minutes.
    this.sun.classList.toggle('on', t * this.sessionSeconds > 30);
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
