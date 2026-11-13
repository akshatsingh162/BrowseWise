import { computeLimitStatus, findNewlyExceeded } from '../shared/limits.js';
import { showLimitNotification } from '../shared/notifier.js';
import { getGoals, getNotices, markNotified } from '../shared/storage/goals-repo.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { getUsageForDate } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/**
 * Checks today's usage against the goal and site limits, and notifies (once per day
 * per limit) when one is reached. Called by the service worker after each tracking
 * update. It reads very little and returns early when nothing needs checking.
 *
 * A notification is recorded as sent only after it was actually shown, so a missing
 * permission or a failed attempt is retried on the next check.
 *
 * @param {object} request
 * @param {number} request.now epoch ms
 * @param {typeof showLimitNotification} [request.notify] injectable for tests
 * @returns {Promise<object[]>} the items that were notified
 */
export async function checkLimits({ now, notify = showLimitNotification }) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return [];

  const goals = await getGoals();
  if (goals.dailyGoalMs === null && Object.keys(goals.siteLimits).length === 0) return [];

  const dateKey = toLocalDateKey(now);
  const [day, notices] = await Promise.all([getUsageForDate(dateKey), getNotices(dateKey)]);
  const pending = findNewlyExceeded(computeLimitStatus(goals, day.domainMs), notices);

  const sent = [];
  for (const item of pending) {
    if (await notify(item, dateKey)) {
      await markNotified(dateKey, item);
      sent.push(item);
    }
  }
  return sent;
}
