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
    /** Which of the pianist's pieces comes next. See `piano()`. */
    this.songIndex = 0;
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
   * The lounge pianist's repertoire — three pieces, played in order.
   *
   * Everything else in this file is one gesture: a caw, a coin, a wingbeat.
   * These are the only *music* in the game, and they are scheduled against the
   * audio clock in one go rather than driven from the frame loop — which is why
   * a fourteen-second piece costs nothing per frame. The Web Audio graph runs on
   * its own thread and has been given every note's start time before the first
   * one sounds.
   *
   * **In order, not at random**, and the reason is not performance — selection
   * is one array index either way, about a five-hundredth of the work in the
   * call that schedules two hundred audio nodes. It is that three songs picked
   * at random repeat immediately one time in three, and a repeat reads as "it is
   * just the one tune", which quietly kills the only thing this easter egg has
   * to offer. A cursor also makes it assertable: `smoke` walks the rotation and
   * `shoot` tips four times and checks it wrapped. Randomness would cost that
   * too — see the note in CLAUDE.md about `addSkyline` and bounds.
   *
   * Semitones are offsets from F3. `[semi, beat, dur]`.
   */
  static SONGS = [
    {
      // The standard: a warm ii–V–I in F, the second pass an octave up and
      // quieter, like somebody noodling. Resolves onto a held tonic.
      name: 'the standard',
      beat: 0.46, beats: 8, passes: 2, octaveUp: true, gains: [0.085, 0.055],
      notes: [
        [0, 0, 1.4], [7, 0.5, 1.2], [12, 1.0, 1.6], [16, 1.5, 2.0],
        [-2, 2.0, 1.4], [5, 2.5, 1.2], [9, 3.0, 1.6], [14, 3.5, 2.0],
        [-4, 4.0, 1.6], [3, 4.5, 1.4], [7, 5.0, 1.8], [12, 5.5, 2.2],
        [-5, 6.0, 2.0], [2, 6.5, 1.8], [7, 7.0, 2.2], [11, 7.5, 2.6],
      ],
      tail: { semis: [-5, 0, 4, 7], dur: 3.0, gain: 0.05 },
    },
    {
      /**
       * The melancholy one, and every choice in it is doing that job.
       *
       * D minor over a **lament bass** — D, C, B♭, A, the oldest sad figure
       * there is — under a melody that climbs to the fourth and then falls the
       * whole way back down it. The E over the C is a suspension that never
       * resolves the way it wants to.
       *
       * Two things make it *yearning* rather than merely sad. The second pass
       * does not go up an octave like the standard's; it repeats at pitch and
       * quieter, which reads as a thought recurring rather than a tune
       * developing. And it ends on **A major** — the dominant, with a C♯ that
       * appears nowhere else in the piece — so the last chord is a question.
       * Resolving it to D minor would have been the same notes and a different
       * feeling entirely.
       */
      name: 'the sad one',
      beat: 0.48, beats: 8, passes: 2, octaveUp: false, gains: [0.08, 0.05],
      notes: [
        // the lament bass, one note per two beats, held under everything
        [-3, 0.0, 2.4], [-5, 2.0, 2.4], [-7, 4.0, 2.4], [-8, 6.0, 2.6],
        // the melody: up to the fourth, then all the way back down
        [4, 0.0, 1.6], [9, 1.0, 1.4], [12, 2.0, 1.8], [11, 3.0, 2.2],
        [9, 4.0, 1.6], [7, 5.0, 1.6], [5, 6.0, 2.0], [4, 7.0, 2.8],
      ],
      // A major: the question it goes out on.
      tail: { semis: [-8, -1, 4, 8], dur: 3.0, gain: 0.045 },
    },
    {
      // The brisk one, to sit as far from the sad one as the standard does.
      // Stride bass on the even beats, a bright tune above it, and it lands.
      name: 'the brisk one',
      beat: 0.42, beats: 12, passes: 2, octaveUp: false, gains: [0.075, 0.06],
      notes: [
        [-12, 0.0, 0.8], [-5, 2.0, 0.8], [-10, 4.0, 0.8],
        [-3, 6.0, 0.8], [-12, 8.0, 0.8], [-5, 10.0, 0.8],
        [12, 0.0, 0.7], [16, 1.0, 0.5], [19, 2.0, 0.7], [17, 3.0, 0.5],
        [16, 4.0, 0.9], [14, 5.0, 0.5], [12, 6.0, 0.9], [14, 7.0, 0.5],
        [16, 8.0, 0.7], [12, 9.0, 0.5], [11, 10.0, 0.9], [12, 11.0, 1.4],
      ],
      tail: { semis: [0, 4, 7, 12], dur: 2.2, gain: 0.05 },
    },
  ];

  /**
   * Play the next piece and say how long it runs.
   *
   * The cursor advances even when there is no context and even when muted, so
   * a muted player and a headless test see the same rotation a listening player
   * does — otherwise turning the sound off would silently park the pianist on
   * one song.
   *
   * @returns {number} how long the piece lasts, in seconds
   */
  piano() {
    const song = Audio.SONGS[this.songIndex % Audio.SONGS.length];
    this.songIndex++;

    let span = 0;
    for (let pass = 0; pass < song.passes; pass++) {
      for (const [, beat, dur] of song.notes) {
        span = Math.max(span, (pass * song.beats + beat) * song.beat + dur);
      }
    }
    const total = span + song.beat + song.tail.dur;
    if (!this.ctx || this.muted) return total;

    const t0 = this.t + 0.15;
    const F3 = 174.61;
    // Two detuned triangles and a sine an octave down, fast attack, long decay.
    // It is not a piano and is not trying to be; it is the same register and
    // the same envelope, which at this volume is what "piano" means.
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

    for (let pass = 0; pass < song.passes; pass++) {
      for (const [semi, beat, dur] of song.notes) {
        note(semi + (song.octaveUp ? pass * 12 : 0),
          t0 + (pass * song.beats + beat) * song.beat, dur,
          song.gains[Math.min(pass, song.gains.length - 1)]);
      }
    }
    for (const semi of song.tail.semis) {
      note(semi, t0 + span + song.beat, song.tail.dur, song.tail.gain);
    }
    return total;
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
