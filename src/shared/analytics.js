import { HOURS_PER_DAY } from './storage/schema.js';
import { shiftDateKey } from './dates.js';
import { totalMs } from './stats.js';

/**
 * Pure calculations behind the Analytics page. Nothing here touches storage or
 * the DOM, so every number on the page can be unit tested.
 */

const MINUTE = 60_000;

/** @param {{date: string, domainMs: Record<string, number>}[]} days */
export function dayTotals(days) {
  return days.map((day) => ({ dateKey: day.date, totalMs: totalMs(day) }));
}

/** @param {{totalMs: number}[]} totals */
export function sumTotals(totals) {
  return totals.reduce((sum, entry) => sum + entry.totalMs, 0);
}

/**
 * The hour with the most activity. Ties go to the earlier hour.
 * @param {number[]} hourlyMs
 * @returns {{hour: number, ms: number}|null} null when nothing was recorded
 */
export function busiestHour(hourlyMs) {
  let best = null;
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const ms = hourlyMs[hour] ?? 0;
    if (ms > 0 && (best === null || ms > best.ms)) best = { hour, ms };
  }
  return best;
}

/**
 * Number of hours with at least `minMs` of activity (default one minute), so a
 * stray few seconds does not make an hour count as "active".
 */
export function activeHourCount(hourlyMs, minMs = MINUTE) {
  return hourlyMs.filter((ms) => ms >= minMs).length;
}

/**
 * The day with the most activity. Ties go to the earlier day.
 * @param {{dateKey: string, totalMs: number}[]} totals
 */
export function busiestDay(totals) {
  let best = null;
  for (const entry of totals) {
    if (entry.totalMs > 0 && (best === null || entry.totalMs > best.totalMs)) best = entry;
  }
  return best;
}

/**
 * Mean over days that have data. Days with nothing recorded are not counted as
 * zero, because that would understate real usage.
 * @returns {{averageMs: number, daysCounted: number}}
 */
export function averageOverActiveDays(totals) {
  const active = totals.filter((entry) => entry.totalMs > 0);
  if (active.length === 0) return { averageMs: 0, daysCounted: 0 };
  return { averageMs: sumTotals(active) / active.length, daysCounted: active.length };
}

/**
 * @returns {{deltaMs: number, deltaPct: number|null}} deltaPct is null when the
 *          previous period has nothing to compare against
 */
export function comparePeriods(currentMs, previousMs) {
  const deltaMs = currentMs - previousMs;
  return { deltaMs, deltaPct: previousMs > 0 ? deltaMs / previousMs : null };
}

/** Every date key from `startKey` to `endKey`, inclusive, oldest first. */
export function dateKeysBetween(startKey, endKey) {
  if (startKey > endKey) return [];
  const keys = [];
  for (let key = startKey; key <= endKey; key = shiftDateKey(key, 1)) keys.push(key);
  return keys;
}

/**
 * The last `count` calendar months ending with the month of `now`, oldest first.
 * @param {number} now epoch ms
 * @param {number} count
 * @returns {{key: string, startKey: string}[]} key is YYYY-MM
 */
export function calendarMonths(now, count) {
  const current = new Date(now);
  return Array.from({ length: count }, (_, index) => {
    const first = new Date(current.getFullYear(), current.getMonth() - (count - 1 - index), 1);
    const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
    return { key, startKey: `${key}-01` };
  });
}

/**
 * Sums daily totals into the given calendar months.
 * @param {{dateKey: string, totalMs: number}[]} totals
 * @param {{key: string, startKey: string}[]} months from calendarMonths()
 * @param {string} currentMonthKey YYYY-MM of today; that month is still in progress
 * @returns {{key: string, startKey: string, totalMs: number, activeDays: number, partial: boolean}[]}
 */
export function totalsByMonth(totals, months, currentMonthKey) {
  return months.map((month) => {
    const inMonth = totals.filter((entry) => entry.dateKey.startsWith(`${month.key}-`));
    return {
      ...month,
      totalMs: sumTotals(inMonth),
      activeDays: inMonth.filter((entry) => entry.totalMs > 0).length,
      partial: month.key === currentMonthKey,
    };
  });
}
