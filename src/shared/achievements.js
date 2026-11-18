import { shiftDateKey } from './dates.js';

/**
 * Streaks and badges, as pure functions.
 *
 * Design rules:
 *  - Everything is built from things the user chose to do: completing focus sessions, and
 *    staying within a daily goal they set themselves. Using the browser more or less is
 *    never scored as good or bad.
 *  - A streak that ends is shown neutrally, next to the best one. There is no warning,
 *    no loss message, and no reminder.
 *  - Badges are earned once and kept. Streak badges use the best streak, so they cannot be
 *    taken away by a bad week.
 *  - The whole feature can be hidden in Settings (showAchievements).
 */

export const GOAL_RESULTS = Object.freeze({ MET: 'met', OVER: 'over', SKIPPED: 'skipped' });

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isDateKey = (value) => typeof value === 'string' && DATE_KEY.test(value);
const isResult = (value) => Object.values(GOAL_RESULTS).includes(value);

/** Tiers are shown as words as well as colours, so they never depend on colour alone. */
export const TIERS = Object.freeze({ BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold' });

/**
 * @typedef {{id: string, title: string, description: string, icon: string, tier: string,
 *            stat: string, target: number, unit: string}} Badge
 * `stat` names a value from badgeStats(); the badge is earned when it reaches `target`.
 */

/** @type {readonly Badge[]} */
export const BADGES = Object.freeze(
  [
    {
      id: 'first-session',
      title: 'First focus',
      description: 'Complete a focus session.',
      icon: 'sprout',
      tier: 'bronze',
      stat: 'totalSessions',
      target: 1,
      unit: 'sessions',
    },
    {
      id: 'sessions-10',
      title: 'Finding a rhythm',
      description: 'Complete 10 focus sessions.',
      icon: 'timer',
      tier: 'bronze',
      stat: 'totalSessions',
      target: 10,
      unit: 'sessions',
    },
    {
      id: 'sessions-50',
      title: 'In the zone',
      description: 'Complete 50 focus sessions.',
      icon: 'zap',
      tier: 'silver',
      stat: 'totalSessions',
      target: 50,
      unit: 'sessions',
    },
    {
      id: 'sessions-200',
      title: 'Deep work',
      description: 'Complete 200 focus sessions.',
      icon: 'crown',
      tier: 'gold',
      stat: 'totalSessions',
      target: 200,
      unit: 'sessions',
    },
    {
      id: 'hours-1',
      title: 'First hour',
      description: 'Focus for 1 hour in total.',
      icon: 'clock',
      tier: 'bronze',
      stat: 'totalFocusHours',
      target: 1,
      unit: 'hours',
    },
    {
      id: 'hours-10',
      title: 'Ten hours',
      description: 'Focus for 10 hours in total.',
      icon: 'hourglass',
      tier: 'silver',
      stat: 'totalFocusHours',
      target: 10,
      unit: 'hours',
    },
    {
      id: 'hours-50',
      title: 'Fifty hours',
      description: 'Focus for 50 hours in total.',
      icon: 'mountain',
      tier: 'gold',
      stat: 'totalFocusHours',
      target: 50,
      unit: 'hours',
    },
    {
      id: 'full-set',
      title: 'Full set',
      description: 'Complete 4 focus sessions in one day.',
      icon: 'award',
      tier: 'silver',
      stat: 'bestDaySessions',
      target: 4,
      unit: 'sessions in a day',
    },
    {
      id: 'long-haul',
      title: 'Long haul',
      description: 'Complete one focus session of 45 minutes or more.',
      icon: 'rocket',
      tier: 'silver',
      stat: 'longestSessionMinutes',
      target: 45,
      unit: 'minutes',
    },
    {
      id: 'streak-3',
      title: 'Three in a row',
      description: 'Complete a focus session on 3 days in a row.',
      icon: 'flame',
      tier: 'bronze',
      stat: 'bestFocusStreak',
      target: 3,
      unit: 'days',
    },
    {
      id: 'streak-7',
      title: 'A full week',
      description: 'Complete a focus session on 7 days in a row.',
      icon: 'flame',
      tier: 'silver',
      stat: 'bestFocusStreak',
      target: 7,
      unit: 'days',
    },
    {
      id: 'streak-30',
      title: 'A month of focus',
      description: 'Complete a focus session on 30 days in a row.',
      icon: 'flame',
      tier: 'gold',
      stat: 'bestFocusStreak',
      target: 30,
      unit: 'days',
    },
    {
      id: 'goal-7',
      title: 'A week within your goal',
      description: 'Stay within your daily goal on 7 days in a row.',
      icon: 'target',
      tier: 'silver',
      stat: 'bestGoalStreak',
      target: 7,
      unit: 'days',
    },
    {
      id: 'goal-30',
      title: 'A month within your goal',
      description: 'Stay within your daily goal on 30 days in a row.',
      icon: 'medal',
      tier: 'gold',
      stat: 'bestGoalStreak',
      target: 30,
      unit: 'days',
    },
  ].map((badge) => Object.freeze(badge)),
);

const BADGE_IDS = new Set(BADGES.map((badge) => badge.id));

/* ---------- stored shape ---------- */

/**
 * @typedef {object} Achievements
 * @property {Record<string, string>} earned badge id -> date it was earned
 * @property {{focus: number, goal: number}} best best streaks ever reached
 * @property {Record<string, string>} days finished day -> 'met' | 'over' | 'skipped'
 * @property {string|null} lastClosed the last day whose goal result was recorded
 */

/** Builds a clean record from untrusted storage data. Unknown ids and bad dates are dropped. */
export function sanitizeAchievements(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {};
  const earned = {};
  const days = {};

  for (const [id, date] of Object.entries(input.earned ?? {})) {
    // Defined with defineProperty so no key can ever change the object's prototype.
    if (BADGE_IDS.has(id) && isDateKey(date)) defineEntry(earned, id, date);
  }
  for (const [date, result] of Object.entries(input.days ?? {})) {
    if (isDateKey(date) && isResult(result)) defineEntry(days, date, result);
  }

  const count = (value) => (Number.isInteger(value) && value >= 0 && value < 100_000 ? value : 0);
  return {
    earned,
    best: { focus: count(input.best?.focus), goal: count(input.best?.goal) },
    days,
    lastClosed: isDateKey(input.lastClosed) ? input.lastClosed : null,
  };
}

function defineEntry(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/* ---------- streaks ---------- */

/**
 * Longest run, and the run that ends today (or yesterday, if today is still to come), of
 * consecutive days in `activeDates`.
 *
 * Today having no session yet does not end a streak; only a whole day without one does.
 *
 * @param {Iterable<string>} activeDates YYYY-MM-DD days that count
 * @param {string} todayKey
 * @returns {{current: number, best: number}}
 */
export function streaksFromDays(activeDates, todayKey) {
  const active = new Set(activeDates);
  const sorted = [...active].sort();

  let best = 0;
  let run = 0;
  let previous = null;
  for (const date of sorted) {
    run = previous !== null && shiftDateKey(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  let cursor = active.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current, best };
}

/**
 * Streaks of days within the goal. Only finished days count. A day with no recorded time,
 * or no goal set at the time, is skipped: it neither extends the streak nor ends it. Going
 * over the goal ends it.
 *
 * @param {Record<string, string>} results finished day -> 'met' | 'over' | 'skipped'
 * @param {string} todayKey
 */
export function goalStreaks(results, todayKey) {
  const dates = Object.keys(results)
    .filter((date) => date < todayKey)
    .sort();

  let best = 0;
  let run = 0;
  for (const date of dates) {
    if (results[date] === GOAL_RESULTS.MET) {
      run += 1;
      best = Math.max(best, run);
    } else if (results[date] === GOAL_RESULTS.OVER) {
      run = 0;
    }
  }

  let current = 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const result = results[dates[i]];
    if (result === GOAL_RESULTS.OVER) break;
    if (result === GOAL_RESULTS.MET) current += 1;
  }
  return { current, best };
}

/* ---------- stats and badges ---------- */

/**
 * Totals from the stored focus days.
 * @param {{date: string, sessions: number, focusMs: number, longestMs: number}[]} days
 * @param {string} todayKey
 */
export function focusTotals(days, todayKey) {
  const withSessions = days.filter((day) => day.sessions > 0);
  const streaks = streaksFromDays(
    withSessions.map((day) => day.date),
    todayKey,
  );
  return {
    totalSessions: withSessions.reduce((sum, day) => sum + day.sessions, 0),
    totalFocusMs: withSessions.reduce((sum, day) => sum + day.focusMs, 0),
    bestDaySessions: withSessions.reduce((max, day) => Math.max(max, day.sessions), 0),
    longestSessionMs: withSessions.reduce((max, day) => Math.max(max, day.longestMs), 0),
    currentFocusStreak: streaks.current,
    bestFocusStreak: streaks.best,
  };
}

/**
 * The values badges are measured against. Best streaks also take the stored best, because
 * older days may have been deleted by the retention setting.
 */
export function badgeStats({ totals, goal, best }) {
  return {
    totalSessions: totals.totalSessions,
    totalFocusHours: totals.totalFocusMs / 3_600_000,
    bestDaySessions: totals.bestDaySessions,
    longestSessionMinutes: totals.longestSessionMs / 60_000,
    bestFocusStreak: Math.max(totals.bestFocusStreak, best.focus),
    bestGoalStreak: Math.max(goal.best, best.goal),
  };
}

/** Badges whose target is reached and which were not earned before. */
export function newlyEarned(stats, earned) {
  return BADGES.filter(
    (badge) => !Object.hasOwn(earned, badge.id) && stats[badge.stat] >= badge.target,
  );
}

/**
 * How close a badge is, for the progress bar on a locked one.
 * @param {Badge} badge
 * @param {Record<string, number>} stats
 */
export function badgeProgress(badge, stats) {
  const current = Math.min(stats[badge.stat] ?? 0, badge.target);
  return { current, target: badge.target, fraction: current / badge.target };
}
