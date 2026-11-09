import { averageDailyMs, mergeDays } from '../shared/aggregate.js';
import { shiftDateKey } from '../shared/dates.js';
import { dateKeysForRange } from '../shared/range.js';
import { buildOverview, rankDomains, totalMs } from '../shared/stats.js';
import { getCategoryOverrides } from '../shared/storage/category-repo.js';
import { getUsageForRange } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/** How many earlier days feed the "daily average" figure. */
export const AVERAGE_WINDOW_DAYS = 7;

/**
 * Everything the Overview page shows.
 * The average covers the previous 7 days (today is excluded because it is still
 * in progress and would drag the average down).
 *
 * @param {number} now epoch ms
 */
export async function loadOverviewData(now) {
  const todayKey = toLocalDateKey(now);
  const previousKeys = Array.from({ length: AVERAGE_WINDOW_DAYS }, (_, index) =>
    shiftDateKey(todayKey, -(index + 1)),
  );

  const [[today, ...previous], overrides] = await Promise.all([
    getUsageForRange([todayKey, ...previousKeys]),
    getCategoryOverrides(),
  ]);
  return {
    overview: buildOverview({ today, yesterday: previous[0], now }),
    average: averageDailyMs(previous),
    overrides,
  };
}

/**
 * Ranked website usage for a range (today, 7 days, 30 days).
 *
 * @param {string} rangeId
 * @param {number} now epoch ms
 */
export async function loadWebsiteUsage(rangeId, now) {
  const keys = dateKeysForRange(rangeId, now);
  const [days, overrides] = await Promise.all([getUsageForRange(keys), getCategoryOverrides()]);
  const merged = mergeDays(days);

  return {
    rangeId,
    overrides,
    ranked: rankDomains(merged),
    totalMs: totalMs(merged),
    dayCount: keys.length,
    daysWithData: days.filter((day) => totalMs(day) > 0).length,
  };
}
