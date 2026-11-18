import { sanitizeAchievements } from '../achievements.js';
import { sanitizeFocusState } from '../focus.js';
import { withStorageLock } from './lock.js';
import { STORAGE_KEYS } from './schema.js';

/**
 * Storage for the focus timer: the running phase, one small record per day of completed
 * sessions, and the achievements summary. All are optional keys with safe defaults.
 *
 * The timer's state is written only by the service worker, so two writers can never
 * disagree. Everything that changes data here goes through the storage lock.
 */

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const focusDayKey = (dateKey) => `${STORAGE_KEYS.FOCUS_DAY_PREFIX}${dateKey}`;

export function emptyFocusDay(dateKey) {
  return { date: dateKey, sessions: 0, focusMs: 0, longestMs: 0 };
}

/** A clean day record from untrusted storage data. */
export function sanitizeFocusDay(raw, dateKey) {
  const count = (value, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
      ? Math.round(value)
      : 0;
  if (raw === null || typeof raw !== 'object') return emptyFocusDay(dateKey);
  return {
    date: dateKey,
    sessions: count(raw.sessions, 10_000),
    focusMs: count(raw.focusMs, 86_400_000 * 2),
    longestMs: count(raw.longestMs, 3 * 3_600_000),
  };
}

/** The timer's current phase, or null when there is none. Lock-free. */
export async function getFocusState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_STATE);
  return sanitizeFocusState(stored[STORAGE_KEYS.FOCUS_STATE]);
}

/** @returns {Promise<ReturnType<typeof sanitizeAchievements>>} */
export async function getAchievements() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ACHIEVEMENTS);
  return sanitizeAchievements(stored[STORAGE_KEYS.ACHIEVEMENTS]);
}

/** One day's record (empty if nothing was stored). */
export async function getFocusDay(dateKey) {
  const stored = await chrome.storage.local.get(focusDayKey(dateKey));
  return sanitizeFocusDay(stored[focusDayKey(dateKey)], dateKey);
}

/**
 * Every stored focus day, oldest first. Reads all of storage once; fine for the few
 * hundred small records this holds.
 */
export async function getAllFocusDays() {
  const everything = await chrome.storage.local.get(null);
  return focusDaysFrom(everything);
}

/** Focus days found in an already-read copy of storage. */
export function focusDaysFrom(everything) {
  return Object.keys(everything)
    .filter((key) => key.startsWith(STORAGE_KEYS.FOCUS_DAY_PREFIX))
    .map((key) => key.slice(STORAGE_KEYS.FOCUS_DAY_PREFIX.length))
    .filter((dateKey) => DATE_KEY_PATTERN.test(dateKey))
    .sort()
    .map((dateKey) => sanitizeFocusDay(everything[focusDayKey(dateKey)], dateKey))
    .filter((day) => day.sessions > 0);
}

/** Dates that have a stored focus record. */
export async function listFocusDateKeys() {
  return (await getAllFocusDays()).map((day) => day.date);
}

/** Deletes focus days older than the cutoff, and the goal results for those days. */
export function pruneFocusDaysBefore(cutoffDateKey) {
  return withStorageLock(async () => {
    const everything = await chrome.storage.local.get(null);
    const oldKeys = Object.keys(everything).filter(
      (key) =>
        key.startsWith(STORAGE_KEYS.FOCUS_DAY_PREFIX) &&
        key.slice(STORAGE_KEYS.FOCUS_DAY_PREFIX.length) < cutoffDateKey,
    );
    if (oldKeys.length > 0) await chrome.storage.local.remove(oldKeys);

    // Goal results older than the cutoff go too; earned badges and best streaks stay.
    const achievements = sanitizeAchievements(everything[STORAGE_KEYS.ACHIEVEMENTS]);
    const keptDays = {};
    let trimmed = false;
    for (const [date, result] of Object.entries(achievements.days)) {
      if (date < cutoffDateKey) trimmed = true;
      else
        Object.defineProperty(keptDays, date, {
          value: result,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    if (trimmed) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.ACHIEVEMENTS]: { ...achievements, days: keptDays },
      });
    }
    return oldKeys.length;
  });
}

/**
 * Deletes the focus history: every day's sessions, and the achievements (streaks and
 * badges are built from that history). The timer that is running right now is not touched.
 */
export function clearFocusHistory() {
  return withStorageLock(async () => {
    const everything = await chrome.storage.local.get(null);
    const keys = Object.keys(everything).filter(
      (key) => key.startsWith(STORAGE_KEYS.FOCUS_DAY_PREFIX) || key === STORAGE_KEYS.ACHIEVEMENTS,
    );
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  });
}

/**
 * Calls `callback` (debounced) when the timer, the focus history or the achievements change
 * in storage, including changes made by the service worker or another tab.
 * @param {() => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeToFocusChanges(callback, { debounceMs = 150 } = {}) {
  let timer;
  const isRelevant = (key) =>
    key === STORAGE_KEYS.FOCUS_STATE ||
    key === STORAGE_KEYS.ACHIEVEMENTS ||
    key.startsWith(STORAGE_KEYS.FOCUS_DAY_PREFIX);

  const listener = (changes, areaName) => {
    if (areaName !== 'local' || !Object.keys(changes).some(isRelevant)) return;
    clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  };
}
