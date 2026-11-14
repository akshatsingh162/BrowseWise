import { retentionCutoffKey } from '../shared/retention.js';
import { withStorageLock } from '../shared/storage/lock.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { pruneUsageBefore } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/**
 * Housekeeping: delete days older than the retention setting.
 *
 * It runs at most once per local day, which keeps it to a single cheap storage read
 * on every other heartbeat. It is forced when settings change, so shortening the
 * retention takes effect straight away. Today is never deleted: the retention
 * cannot be shorter than 7 days.
 */

export const MAINTENANCE_KEY = 'maintenance';

/**
 * @param {object} [options]
 * @param {number} [options.now] epoch ms
 * @param {boolean} [options.force] run even if it already ran today
 * @returns {Promise<{ran: boolean, removedDays: number}>}
 */
export async function runMaintenance({ now = Date.now(), force = false } = {}) {
  const todayKey = toLocalDateKey(now);

  if (!force) {
    const stored = await chrome.storage.local.get(MAINTENANCE_KEY);
    if (stored[MAINTENANCE_KEY]?.lastRunDate === todayKey) return { ran: false, removedDays: 0 };
  }

  const { retentionDays } = await getSettings();
  const removedDays = await pruneUsageBefore(retentionCutoffKey(todayKey, retentionDays));

  await withStorageLock(() =>
    chrome.storage.local.set({ [MAINTENANCE_KEY]: { lastRunDate: todayKey } }),
  );
  return { ran: true, removedDays };
}
