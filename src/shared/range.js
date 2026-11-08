import { shiftDateKey } from './dates.js';
import { toLocalDateKey } from './time.js';

/** Time ranges offered by the dashboard. `days` counts today as the first day. */
export const RANGES = Object.freeze([
  Object.freeze({ id: 'today', label: 'Today', days: 1 }),
  Object.freeze({ id: '7d', label: '7 days', days: 7 }),
  Object.freeze({ id: '30d', label: '30 days', days: 30 }),
]);

export const DEFAULT_RANGE_ID = 'today';

export function isRangeId(value) {
  return RANGES.some((range) => range.id === value);
}

/**
 * Local date keys covered by a range, oldest first, ending today.
 * An unknown range id falls back to the default rather than throwing.
 *
 * @param {string} rangeId
 * @param {number} now epoch ms
 * @returns {string[]}
 */
export function dateKeysForRange(rangeId, now) {
  const range =
    RANGES.find((r) => r.id === rangeId) ?? RANGES.find((r) => r.id === DEFAULT_RANGE_ID);
  const todayKey = toLocalDateKey(now);
  return Array.from({ length: range.days }, (_, index) =>
    shiftDateKey(todayKey, index - (range.days - 1)),
  );
}
