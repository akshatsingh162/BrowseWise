import { mergeDays } from '../shared/aggregate.js';
import { computeLimitStatus } from '../shared/limits.js';
import { hasNotificationsPermission } from '../shared/notifications-permission.js';
import { dateKeysForRange } from '../shared/range.js';
import { rankDomains } from '../shared/stats.js';
import { getGoals } from '../shared/storage/goals-repo.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { getUsageForRange } from '../shared/storage/usage-repo.js';

/** How many recently used websites are offered as suggestions in the limit form. */
export const SUGGESTION_COUNT = 20;

/**
 * Everything the Goals & limits page shows.
 * @param {number} now epoch ms
 * @param {{hasPermission?: () => Promise<boolean>}} [options] injectable for tests
 */
export async function loadGoalsData(now, { hasPermission = hasNotificationsPermission } = {}) {
  const keys = dateKeysForRange('30d', now); // the last key is today
  const [goals, settings, granted, days] = await Promise.all([
    getGoals(),
    getSettings(),
    hasPermission(),
    getUsageForRange(keys),
  ]);

  const today = days.at(-1);
  return {
    goals,
    status: computeLimitStatus(goals, today.domainMs),
    notifications: { enabled: settings.notificationsEnabled, granted },
    suggestions: rankDomains(mergeDays(days))
      .slice(0, SUGGESTION_COUNT)
      .map((site) => site.domain),
  };
}
