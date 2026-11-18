import {
  BADGES,
  badgeProgress,
  badgeStats,
  focusTotals,
  goalStreaks,
} from '../shared/achievements.js';
import { shiftDateKey } from '../shared/dates.js';
import { getAchievements, getAllFocusDays, getFocusState } from '../shared/storage/focus-repo.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/**
 * Everything the Focus page shows, as plain data: the timer, today's numbers, streaks,
 * the last seven days, and every badge with its progress.
 *
 * @param {number} now epoch ms
 */
export async function loadFocusData(now) {
  const [state, settings, days, achievements] = await Promise.all([
    getFocusState(),
    getSettings(),
    getAllFocusDays(),
    getAchievements(),
  ]);

  const todayKey = toLocalDateKey(now);
  const totals = focusTotals(days, todayKey);
  const goal = goalStreaks(achievements.days, todayKey);
  const best = {
    focus: Math.max(achievements.best.focus, totals.bestFocusStreak),
    goal: Math.max(achievements.best.goal, goal.best),
  };
  const stats = badgeStats({ totals, goal, best });

  const byDate = new Map(days.map((day) => [day.date, day]));
  const today = byDate.get(todayKey);

  return {
    state,
    settings: {
      focusMinutes: settings.focusMinutes,
      shortBreakMinutes: settings.shortBreakMinutes,
      longBreakMinutes: settings.longBreakMinutes,
      longBreakEvery: settings.longBreakEvery,
      showAchievements: settings.showAchievements,
    },
    todayKey,
    today: { sessions: today?.sessions ?? 0, focusMs: today?.focusMs ?? 0 },
    allTime: { sessions: totals.totalSessions, focusMs: totals.totalFocusMs },
    streaks: {
      focus: { current: totals.currentFocusStreak, best: best.focus },
      goal: { current: goal.current, best: best.goal },
    },
    week: Array.from({ length: 7 }, (_, index) => {
      const dateKey = shiftDateKey(todayKey, index - 6);
      return { dateKey, sessions: byDate.get(dateKey)?.sessions ?? 0 };
    }),
    badges: BADGES.map((badge) => ({
      badge,
      earnedOn: Object.hasOwn(achievements.earned, badge.id) ? achievements.earned[badge.id] : null,
      progress: badgeProgress(badge, stats),
    })),
  };
}
