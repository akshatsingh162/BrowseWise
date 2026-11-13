import { CATEGORY_OVERRIDES_KEY } from './storage/category-repo.js';
import { GOALS_KEY } from './storage/goals-repo.js';
import { STORAGE_KEYS } from './storage/schema.js';

/**
 * Calls `callback` (debounced) whenever what a screen displays may have changed in
 * storage: any day's usage record, the user's category overrides, goals and limits,
 * or settings (including changes made in another dashboard tab or by the service worker). Returns an
 * unsubscribe function.
 *
 * @param {() => void} callback
 * @param {{debounceMs?: number}} [options]
 */
export function subscribeToUsageChanges(callback, { debounceMs = 300 } = {}) {
  let timer;

  const WATCHED_KEYS = new Set([CATEGORY_OVERRIDES_KEY, GOALS_KEY, STORAGE_KEYS.SETTINGS]);
  const isRelevant = (key) => key.startsWith(STORAGE_KEYS.USAGE_PREFIX) || WATCHED_KEYS.has(key);

  const listener = (changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some(isRelevant)) return;
    clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  };
}
