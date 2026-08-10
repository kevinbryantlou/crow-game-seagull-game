/**
 * HUD.
 *
 * Six elements, borrowing the block's own municipal-signage vocabulary.
 * Anything a seventh would say, the world says instead.
 * See docs/style-guide.html §7.
 */

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(goal) {
    this.goal = goal;
    this.amt = $('amt');
    this.barFill = $('bar-fill');
    this.taskList = $('task-list');
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
    for (const t of tasks) {
      let el = this._taskEls.get(t.id);
      if (!el) {
        el = document.createElement('li');
        el.textContent = t.text;
        this.taskList.appendChild(el);
        this._taskEls.set(t.id, el);
      }
      el.classList.toggle('done', !!t.done);
    }
  }

  setCarry(label) {
    if (label) {
      this.carryEl.textContent = `Carrying — ${label}`;
      this.carryEl.classList.add('on');
    } else {
      this.carryEl.classList.remove('on');
    }
  }

  /** @param {{verb:string,noun:string}|null} action */
  setPrompt(action, screen) {
    if (!action || !screen || !screen.visible) {
      this.prompt.classList.remove('on');
      return;
    }
    this.prompt.innerHTML = `<b>${action.verb}</b> — ${action.noun}`;
    this.prompt.style.left = `${screen.x}px`;
    this.prompt.style.top = `${screen.y - 14}px`;
    this.prompt.classList.add('on');
  }

  setStamina(v, visible) {
    this.stam.classList.toggle('on', visible);
    this.stamFill.style.width = `${Math.max(0, v) * 100}%`;
    this.stam.classList.toggle('low', v < 0.25);
  }

  setTime(t) {
    // Hidden for the first 30 seconds — let the player look at the block first.
    this.sun.classList.toggle('on', t > 0.0001);
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
  }
}
