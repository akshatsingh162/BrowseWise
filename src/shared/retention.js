import { shiftDateKey } from './dates.js';

/**
 * Retention: how many days of history are kept.
 *
 * With `days` = 30 the history holds today plus the 29 days before it. Days older
 * than the cutoff returned here are the ones to delete. Today is never older than
 * the cutoff, because the minimum retention is far above one day.
 */

/**
 * The oldest day that is still kept.
 * @param {string} todayKey local YYYY-MM-DD
 * @param {number} days retention in days (at least 1)
 * @returns {string} YYYY-MM-DD
 */
export function retentionCutoffKey(todayKey, days) {
  return shiftDateKey(todayKey, -(days - 1));
}

/**
 * How many of the recorded days are older than the cutoff.
 * @param {string[]} dateKeys recorded day keys, in any order
 * @param {string} cutoffKey from retentionCutoffKey()
 */
export function countDaysBefore(dateKeys, cutoffKey) {
  return dateKeys.filter((key) => key < cutoffKey).length;
}
