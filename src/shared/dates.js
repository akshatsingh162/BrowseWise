import { toLocalDateKey } from './time.js';

/**
 * Moves a YYYY-MM-DD key by a number of local calendar days (negative = earlier).
 * Built from calendar fields at noon, so daylight-saving shifts can never skip
 * or repeat a day.
 *
 * @param {string} dateKey
 * @param {number} days
 * @returns {string}
 */
export function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days, 12).getTime());
}

/**
 * Whether `value` is a real calendar date written as YYYY-MM-DD (so "2026-02-31" and
 * "2026-1-5" are not). Used for dates that arrive from a link in the address bar.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // A date that rolls over (February 31st becomes March 3rd) will not round-trip.
  return shiftDateKey(value, 0) === value;
}
