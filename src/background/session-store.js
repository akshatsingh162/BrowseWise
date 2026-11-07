import { sanitizeState } from './tracker.js';

/**
 * Persists the tracker state so it survives service-worker suspension.
 *
 * Chrome can stop the worker at any time and every in-memory variable is lost.
 * The state is tiny (a few fields), so we save it after every event.
 */

export const TRACKER_STATE_KEY = 'tracker:state';

/** @returns {Promise<import('./tracker.js').TrackerState|null>} null if absent or corrupt */
export async function loadTrackerState() {
  const stored = await chrome.storage.local.get(TRACKER_STATE_KEY);
  return sanitizeState(stored[TRACKER_STATE_KEY]);
}

/** @param {import('./tracker.js').TrackerState} state */
export function saveTrackerState(state) {
  return chrome.storage.local.set({ [TRACKER_STATE_KEY]: state });
}

export function clearTrackerState() {
  return chrome.storage.local.remove(TRACKER_STATE_KEY);
}
