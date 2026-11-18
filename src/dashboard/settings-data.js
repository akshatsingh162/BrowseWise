import { exportRangeStartKey, filterDaysFrom } from '../shared/export.js';
import { hasNotificationsPermission } from '../shared/notifications-permission.js';
import { countDaysBefore, retentionCutoffKey } from '../shared/retention.js';
import { getStorageUsage } from '../shared/storage-usage.js';
import { getAchievements, getAllFocusDays } from '../shared/storage/focus-repo.js';
import { getCategoryOverrides } from '../shared/storage/category-repo.js';
import { getGoals } from '../shared/storage/goals-repo.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { getUsageForRange, listUsageDateKeys } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/**
 * Everything the Settings page shows.
 * @param {{hasPermission?: () => Promise<boolean>, getUsage?: () => Promise<number|null>}}
 *        [options] injectable for tests
 */
export async function loadSettingsData({
  hasPermission = hasNotificationsPermission,
  getUsage = getStorageUsage,
} = {}) {
  const [settings, keys, bytesInUse, granted] = await Promise.all([
    getSettings(),
    listUsageDateKeys(),
    getUsage(),
    hasPermission(),
  ]);

  return {
    settings,
    summary: {
      dayCount: keys.length,
      firstKey: keys[0] ?? null,
      lastKey: keys.at(-1) ?? null,
      bytesInUse,
    },
    notifications: { enabled: settings.notificationsEnabled, granted },
  };
}

/**
 * Everything an export needs: the days in the chosen range plus the user's category
 * choices, goals and settings.
 *
 * @param {string} rangeId one of EXPORT_RANGES
 * @param {number} now epoch ms
 */
export async function collectExportData(rangeId, now) {
  const startKey = exportRangeStartKey(rangeId, toLocalDateKey(now));
  const keys = await listUsageDateKeys();
  const [allDays, categoryOverrides, goals, settings, allFocusDays, achievements] =
    await Promise.all([
      getUsageForRange(keys),
      getCategoryOverrides(),
      getGoals(),
      getSettings(),
      getAllFocusDays(),
      getAchievements(),
    ]);

  return {
    days: filterDaysFrom(allDays, startKey),
    categoryOverrides,
    goals,
    settings,
    focusDays: allFocusDays.filter((day) => startKey === null || day.date >= startKey),
    achievements,
  };
}

/**
 * How many recorded days a shorter retention would delete. Read fresh each time, so
 * the number in the confirmation is the number that will actually go.
 *
 * @param {number} retentionDays the retention being considered
 * @param {number} now epoch ms
 */
export async function countDaysToDelete(retentionDays, now) {
  // A day counts once, even if it has both browsing time and focus sessions.
  const dates = new Set(await listUsageDateKeys());
  for (const day of await getAllFocusDays()) dates.add(day.date);
  return countDaysBefore([...dates], retentionCutoffKey(toLocalDateKey(now), retentionDays));
}
