/**
 * Synthesised audio — no files, same argument as the geometry.
 * See docs/style-guide.html §8.
 */

// Pentatonic, so a good run is musical rather than noisy.
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._coinStep = 0;
  }

  /** Must be called from a user gesture — browsers and iOS both insist. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this._startTrafficBed();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  get t() { return this.ctx.currentTime; }

  _env(node, t0, attack, decay, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** Distant traffic — a filtered noise bed, very quiet, runs forever. */
  _startTrafficBed() {
    const src = this._noise(4);
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();

    // Slow swell so it does not sit perfectly still.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.014;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start();
  }

  /**
   * The signature sound. Three filtered-noise bursts with a pitch drop,
   * randomised each time so it never reads as a sample.
   */
  caw() {
    if (!this.ctx || this.muted) return;
    const t0 = this.t;
    const bursts = 2 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < bursts; i++) {
      const t = t0 + i * (0.13 + Math.random() * 0.04);
      const base = 620 + Math.random() * 140 - i * 40;

      const src = this._noise(0.24);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 5.5;
      bp.frequency.setValueAtTime(base * 1.5, t);
      bp.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.16);

      const form = this.ctx.createBiquadFilter();
      form.type = 'peaking';
      form.frequency.value = 1900 + Math.random() * 400;
      form.Q.value = 3;
      form.gain.value = 9;

      src.connect(bp); bp.connect(form);
      this._env(form, t, 0.012, 0.15, 0.42);
      src.start(t); src.stop(t + 0.3);

      // A little tonal body under the noise keeps it from sounding like static.
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 0.55, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.3, t + 0.16);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      osc.connect(lp);
      this._env(lp, t, 0.012, 0.14, 0.12);
      osc.start(t); osc.stop(t + 0.3);
    }
  }

  wingbeat() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const src = this._noise(0.18);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.14);
    src.connect(lp);
    this._env(lp, t, 0.02, 0.12, 0.16);
    src.start(t); src.stop(t + 0.2);
  }

  step() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const src = this._noise(0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 600;
    bp.Q.value = 2;
    src.connect(bp);
    this._env(bp, t, 0.004, 0.04, 0.07);
    src.start(t); src.stop(t + 0.08);
  }

  /**
   * Coin chime. Climbs the pentatonic as the total approaches twenty, which
   * turns the money counter into something you hear as well as read.
   */
  coin(progress = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const idx = Math.min(PENTATONIC.length - 1,
      Math.floor(progress * (PENTATONIC.length - 2)) + (this._coinStep++ % 2));
    const freq = 523.25 * Math.pow(2, PENTATONIC[idx] / 12);
    for (const [mult, gain, dur] of [[1, 0.16, 0.5], [2.01, 0.07, 0.34], [3.02, 0.03, 0.22]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      this._env(osc, t, 0.004, dur, gain);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
  }

  /** Money in the nest — heavier, lands. */
  bank(progress = 0) {
    if (!this.ctx || this.muted) return;
    this.coin(progress);
    const t = this.t + 0.04;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    this._env(osc, t, 0.006, 0.24, 0.2);
    osc.start(t); osc.stop(t + 0.3);
  }

  plop() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.13);
    this._env(osc, t, 0.005, 0.14, 0.22);
    osc.start(t); osc.stop(t + 0.2);
  }

  /** Getting shooed — a graceless tumble. */
  fumble() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const src = this._noise(0.3);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    bp.Q.value = 1.2;
    src.connect(bp);
    this._env(bp, t, 0.01, 0.26, 0.3);
    src.start(t); src.stop(t + 0.35);
  }

  /** Human notices you. */
  alert() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.setValueAtTime(440, t + 0.07);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    osc.connect(lp);
    this._env(lp, t, 0.006, 0.14, 0.09);
    osc.start(t); osc.stop(t + 0.2);
  }

  /** Task ticked off. */
  ding() {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    [880, 1318.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      this._env(osc, t + i * 0.09, 0.005, 0.3, 0.1);
      osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.4);
    });
  }

  /**
   * The lounge pianist's party piece, and the only piece of *music* in a game
   * that is otherwise entirely foley.
   *
   * Everything else in this file is one gesture — a caw, a coin, a wingbeat.
   * This is sixteen bars of ii–V–I in F, scheduled in one go against the audio
   * clock rather than driven from the frame loop, which is the whole reason a
   * fifteen-second cue costs nothing per frame: the Web Audio graph runs on its
   * own thread and `_env` has already been given every note's start time before
   * the first one sounds.
   *
   * The timbre is two detuned triangles and a sine an octave down, with a fast
   * attack and a long decay. It is not a piano and is not trying to be; it is
   * the same register and the same envelope, which at this volume through a
   * laptop speaker is what "piano" means.
   *
   * @returns {number} how long the piece lasts, in seconds
   */
  piano() {
    const BARS = [
      // [semitone from F3, beat, duration] — ii, V, I, vi over four bars, twice,
      // with the melody an octave up on the repeat.
      [[0, 0, 1.4], [7, 0.5, 1.2], [12, 1.0, 1.6], [16, 1.5, 2.0]],
      [[-2, 2.0, 1.4], [5, 2.5, 1.2], [9, 3.0, 1.6], [14, 3.5, 2.0]],
      [[-4, 4.0, 1.6], [3, 4.5, 1.4], [7, 5.0, 1.8], [12, 5.5, 2.2]],
      [[-5, 6.0, 2.0], [2, 6.5, 1.8], [7, 7.0, 2.2], [11, 7.5, 2.6]],
    ];
    const BEAT = 0.46;
    if (!this.ctx || this.muted) return BARS.length * 2 * BEAT * 2 + 1.6;

    const t0 = this.t + 0.15;
    const F3 = 174.61;
    const note = (semi, at, dur, gain) => {
      const f = F3 * Math.pow(2, semi / 12);
      for (const [type, mul, det, g] of [
        ['triangle', 1, 0, gain], ['triangle', 1, 3.5, gain * 0.6], ['sine', 0.5, 0, gain * 0.5],
      ]) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f * mul;
        osc.detune.value = det;
        this._env(osc, at, 0.012, dur, g);
        osc.start(at); osc.stop(at + dur + 0.2);
      }
    };

    let end = t0;
    for (let pass = 0; pass < 2; pass++) {
      for (const bar of BARS) {
        for (const [semi, beat, dur] of bar) {
          const at = t0 + (pass * 8 + beat) * BEAT;
          // The repeat goes up an octave and quieter, like somebody noodling.
          note(semi + pass * 12, at, dur, pass ? 0.055 : 0.085);
          end = Math.max(end, at + dur);
        }
      }
    }
    // A last chord, held.
    for (const semi of [-5, 0, 4, 7]) note(semi, end + BEAT, 3.0, 0.05);
    return (end + BEAT + 3.0) - this.t;
  }

  /** The transformation. */
  transform() {
    if (!this.ctx || this.muted) return;
    const t0 = this.t;
    [0, 4, 7, 11, 12, 16, 19].forEach((semi, i) => {
      const t = t0 + i * 0.11;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 261.6 * Math.pow(2, semi / 12);
      this._env(osc, t, 0.02, 1.1 - i * 0.06, 0.13);
      osc.start(t); osc.stop(t + 1.4);
    });
  }
}
