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
