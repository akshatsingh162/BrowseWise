import { STORAGE_KEYS } from './storage/schema.js';

/**
 * Calls `callback` (debounced) whenever any day's usage record changes in
 * storage, including changes made by the service worker. Returns an
 * unsubscribe function.
 *
 * @param {() => void} callback
 * @param {{debounceMs?: number}} [options]
 */
export function subscribeToUsageChanges(callback, { debounceMs = 300 } = {}) {
  let timer;

  const listener = (changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some((key) => key.startsWith(STORAGE_KEYS.USAGE_PREFIX))) return;
    clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  };
}
