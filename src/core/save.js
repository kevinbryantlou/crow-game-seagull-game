/**
 * Small Change — what the game remembers between sessions.
 *
 * The only thing in this project that writes to a player's machine, which is
 * most of why it is shaped the way it is. See docs/menu-brief.html §8.
 *
 * Pure, and deliberately ignorant of two things: the DOM, so `smoke.mjs` can
 * test it without a browser — the same reason `words.js` and `rank.js` are
 * their own files — and the level registry, so the unlock rules can be tested
 * against invented ladders rather than only against the three blocks that
 * happen to exist. Anything here that needs to know about levels takes them as
 * an argument.
 *
 * Three rules hold the whole file up:
 *
 * 1. **A save may not be trusted.** It is a string on a stranger's machine. It
 *    can be hand-edited, truncated by a full disk, or written by a build that
 *    had five levels in it. Everything is parsed defensively and anything that
 *    does not survive is treated as "no progress" rather than as an error — a
 *    save file that crashes the title card is worse than no save file.
 * 2. **Storage may not be assumed.** `localStorage` throws on *access* in
 *    Safari private mode, throws on write when the quota is full, and is one of
 *    the things that behaves its own way inside a `WKWebView` — which is
 *    exactly the shell this game is being built to ship in. Failure degrades to
 *    an in-memory store: the menu works for the session and nothing survives
 *    the tab.
 * 3. **The version gate discards, it does not migrate.** There is one version
 *    and nothing to migrate from. When that stops being true, this is where the
 *    decision goes; until then, a blob from another version is worth less than
 *    the code it would take to interpret it.
 */

export const SAVE_KEY = 'smallchange.progress';

/**
 * Bump when the *shape* changes, not when a field is added that older readers
 * can ignore — a bump throws away real progress, so it is for changes that
 * would otherwise be misread rather than for changes that are merely new.
 */
export const SAVE_VERSION = 1;

/**
 * A Storage-shaped object that forgets everything when the tab closes.
 *
 * Not a stub for tests — this is the live fallback when the real one is
 * unavailable, so the level select still works for the length of a session on
 * a device that refuses to persist anything.
 */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    volatile: true,
  };
}

/**
 * `localStorage` if it is genuinely usable, an in-memory store otherwise.
 *
 * "Usable" is decided by a round trip rather than by a truthiness check,
 * because the failure mode that matters is a `localStorage` that exists,
 * answers `getItem`, and throws on `setItem` — which is what a full quota and
 * some private-browsing modes actually look like. Reading alone would pass and
 * the first write of the session would throw.
 */
export function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return memoryStorage();
    const probe = `${SAVE_KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

/** Whole cents, so a save file never contains a float. */
const toCents = (dollars) => Math.max(0, Math.round(Number(dollars) * 100) || 0);
const toDollars = (cents) => cents / 100;

/** A finite, non-negative integer, or null. Everything read from disk goes through here. */
function posInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * The saved state, and the questions the interface asks of it.
 *
 * @param {object}   [storage]  anything Storage-shaped; defaults to localStorage-or-memory
 * @param {number[]} [knownIds] level ids this build recognises. Ids outside it are
 *   dropped on read — a save written by a five-level build must load clean on a
 *   three-level one, and an unknown id would otherwise unlock a chip for a block
 *   that cannot be built.
 */
export class Progress {
  constructor(storage = defaultStorage(), knownIds = null) {
    this.storage = storage;
    this.knownIds = knownIds ? new Set(knownIds.map(Number)) : null;
    this.cleared = [];
    /** id → { cents, secs }. Written from day one; displayed by nothing yet. */
    this.best = {};
    this.load();
  }

  /** True when nothing written here will outlive the tab. */
  get volatile() { return this.storage.volatile === true; }

  _known(id) { return this.knownIds ? this.knownIds.has(Number(id)) : true; }

  /**
   * Read, and survive anything.
   *
   * Every branch that fails lands on the same result — an empty progress — so
   * a corrupt save is indistinguishable from a new player, which is the correct
   * behaviour for both.
   */
  load() {
    this.cleared = [];
    this.best = {};

    let raw = null;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      return this;   // reading threw: treat as new player, do not escalate
    }
    if (!raw) return this;

    let blob;
    try {
      blob = JSON.parse(raw);
    } catch {
      return this;   // truncated or hand-mangled
    }
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return this;
    if (posInt(blob.v) !== SAVE_VERSION) return this;

    if (Array.isArray(blob.cleared)) {
      const seen = new Set();
      for (const entry of blob.cleared) {
        const id = posInt(entry);
        if (id === null || seen.has(id) || !this._known(id)) continue;
        seen.add(id);
        this.cleared.push(id);
      }
    }

    if (blob.best && typeof blob.best === 'object' && !Array.isArray(blob.best)) {
      for (const [key, value] of Object.entries(blob.best)) {
        const id = posInt(key);
        if (id === null || !this._known(id) || !value || typeof value !== 'object') continue;
        const cents = posInt(value.cents);
        const secs = posInt(value.secs);
        if (cents === null || secs === null) continue;
        this.best[id] = { cents, secs };
      }
    }

    return this;
  }

  /**
   * Write, and survive anything.
   *
   * A failed write is not reported upward. Nothing the player is doing should
   * stop because a disk is full — the run continues, the menu continues, and
   * the only cost is that this session is not remembered.
   */
  save() {
    const blob = { v: SAVE_VERSION, cleared: [...this.cleared], best: {} };
    for (const [id, b] of Object.entries(this.best)) blob.best[id] = { ...b };
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(blob));
      return true;
    } catch {
      return false;
    }
  }

  isCleared(id) { return this.cleared.includes(Number(id)); }

  /** Best run on a block, in dollars and seconds, or null. */
  bestFor(id) {
    const b = this.best[Number(id)];
    return b ? { total: toDollars(b.cents), secs: b.secs } : null;
  }

  /**
   * Record the end of a run.
   *
   * Only a win clears a block — losing is a complete and legitimate way to
   * finish a session, it just does not open the next door. The best is written
   * on a win too, and "best" is decided by money first: this game's goal is an
   * amount, and a faster run that banked less is not a better one. Time breaks
   * the tie, which is the only place the clock is competitive at all.
   */
  recordRun(id, { won, total = 0, secs = 0 } = {}) {
    const levelId = Number(id);
    if (!won || !this._known(levelId)) return false;

    if (!this.isCleared(levelId)) this.cleared.push(levelId);

    const cents = toCents(total);
    const seconds = Math.max(0, Math.round(secs));
    const prev = this.best[levelId];
    if (!prev || cents > prev.cents || (cents === prev.cents && seconds < prev.secs)) {
      this.best[levelId] = { cents, secs: seconds };
    }

    this.save();
    return true;
  }

  /** Wipe it, on disk as well as in memory. */
  forget() {
    this.cleared = [];
    this.best = {};
    try { this.storage.removeItem(SAVE_KEY); } catch { /* nothing to do about it */ }
    return this;
  }

  // ── the questions the menu asks ────────────────────────────────────────────

  /**
   * Which blocks are playable.
   *
   * The first level in the registry is always open — a game whose front door is
   * locked has no front door. Everything else is opened by clearing whatever
   * names it in `next`, which means the ladder is defined in exactly one place
   * and this function never needs to know the shape of it. A block reachable
   * from two predecessors is fine and needs no special case.
   *
   * @param {Array<{id:number,next:?number}>} levels the registry, in order
   */
  unlockedIds(levels) {
    const open = new Set();
    if (levels.length) open.add(Number(levels[0].id));
    for (const id of this.cleared) {
      const level = levels.find((l) => Number(l.id) === Number(id));
      if (level && level.next != null) open.add(Number(level.next));
    }
    // A cleared block stays open even if the ladder was rewritten under it.
    for (const id of this.cleared) open.add(Number(id));
    return [...open].filter((id) => levels.some((l) => Number(l.id) === id));
  }

  isUnlocked(id, levels) { return this.unlockedIds(levels).includes(Number(id)); }

  /**
   * What `Continue` continues: the furthest block you have *opened*, in
   * registry order — not the last one you played.
   *
   * Those differ only when you have gone back to replay something, and there
   * the ladder is the more useful default: a player who wants the older block
   * is one click away on the Levels screen, and a player mid-ladder should
   * never be sent backwards by a button whose whole promise is forward. The
   * button carries the block's name so the promise is never ambiguous.
   */
  continueId(levels) {
    const open = new Set(this.unlockedIds(levels));
    let furthest = levels.length ? Number(levels[0].id) : null;
    for (const level of levels) if (open.has(Number(level.id))) furthest = Number(level.id);
    return furthest;
  }

  /** Has this player finished anything? Decides whether the menu exists at all. */
  get isNewPlayer() { return this.cleared.length === 0; }
}
