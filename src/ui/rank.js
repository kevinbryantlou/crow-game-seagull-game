/**
 * Ranks.
 *
 * The first version graded on the clock alone, with thresholds picked before
 * anyone had played the game. A competent run turned out to take about two
 * minutes, so "under five minutes" was not a distinction — it was the default,
 * and every informed run collected the top title.
 *
 * Two fixes, both here. The clock is retuned to the real data. And the title is
 * now mostly about *how* you did it, because a twelve-minute run in which you
 * were never once caught is a better story than a fast, clumsy one, and it used
 * to score worse.
 *
 * Ordered most-notable first; the first match wins. Each title answers a
 * different question, so replaying differently earns a different name rather
 * than a higher number.
 */

export const RANKS = [
  {
    title: 'Model Citizen',
    why: 'Never once shooed.',
    test: (s) => s.caught === 0,
  },
  {
    title: 'Corvid Prodigy',
    why: 'Home in under two and a half minutes.',
    test: (s) => s.elapsed < 150,
  },
  {
    title: 'Career Criminal',
    why: 'Never traded with the kid — every cent of it stolen.',
    test: (s) => !s.traded,
  },
  {
    title: 'Thorough Bird',
    why: 'Did everything on the list.',
    test: (s) => s.tasksDone >= s.totalTasks,
  },
  {
    title: 'Accomplished Thief',
    why: 'Home inside five and a half minutes.',
    test: (s) => s.elapsed < 330,
  },
  {
    title: 'Persistent Bird',
    why: 'Caught six times or more, and got there anyway.',
    test: (s) => s.caught >= 6,
  },
  {
    title: 'Bird About Town',
    why: 'Got the money. Took a while. No notes.',
    test: () => true,
  },
];

/** Dusk arrived and the crow is still a crow. */
export const UNFINISHED = 'Still A Crow';

/**
 * @param {{won:boolean, elapsed:number, caught:number, traded:boolean,
 *          tasksDone:number, totalTasks:number}} state
 */
export function rankFor(state) {
  if (!state.won) return UNFINISHED;
  return RANKS.find((r) => r.test(state)).title;
}

/** The eyebrow line: what you were, how long it took, and how it went. */
export function formatRankLine(state) {
  const title = rankFor(state);
  const m = Math.floor(state.elapsed / 60);
  const s = Math.floor(state.elapsed % 60);
  const caught = state.caught === 0 ? 'never caught' : `caught ×${state.caught}`;
  return `${title} · ${m}m ${String(s).padStart(2, '0')}s · ${caught}`;
}
