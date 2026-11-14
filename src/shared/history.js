import { averageOverActiveDays, busiestDay, dateKeysBetween } from './analytics.js';
import { shiftDateKey } from './dates.js';

/**
 * Pure calculations behind the History page: grouping days into weeks and building
 * the series for a single website. No storage, no DOM.
 */

/** Monday, the default first day of the week in the History page. */
export const MONDAY = 1;

/**
 * The first day of the week that contains `dateKey`.
 * @param {string} dateKey YYYY-MM-DD
 * @param {number} [weekStartsOn] 0 = Sunday ... 6 = Saturday (default Monday)
 */
export function weekStartKey(dateKey, weekStartsOn = MONDAY) {
  const [year, month, day] = dateKey.split('-').map(Number);
  // Noon keeps the weekday correct whatever daylight-saving changes happen that day.
  const weekday = new Date(year, month - 1, day, 12).getDay();
  const daysSinceStart = (weekday - weekStartsOn + 7) % 7;
  return shiftDateKey(dateKey, -daysSinceStart);
}

/**
 * Groups daily totals into weeks. Days with no recorded time are left out, and so
 * are weeks that end up empty. The average is taken over days that have data, not
 * over seven days, so a week with two active days is not understated.
 *
 * @param {{dateKey: string, totalMs: number}[]} totals any order
 * @param {number} [weekStartsOn]
 * @returns {{weekStart: string, weekEnd: string, totalMs: number, activeDays: number,
 *            averageMs: number}[]} newest week first
 */
export function groupByWeek(totals, weekStartsOn = MONDAY) {
  const weeks = new Map();

  for (const entry of totals) {
    if (!(entry.totalMs > 0)) continue;
    const start = weekStartKey(entry.dateKey, weekStartsOn);
    const week = weeks.get(start) ?? { weekStart: start, totalMs: 0, activeDays: 0 };
    week.totalMs += entry.totalMs;
    week.activeDays += 1;
    weeks.set(start, week);
  }

  return [...weeks.values()]
    .map((week) => ({
      ...week,
      weekEnd: shiftDateKey(week.weekStart, 6),
      averageMs: week.totalMs / week.activeDays,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/**
 * Time on one website for each day in `days`, in the same order.
 * @param {{date: string, domainMs: Record<string, number>}[]} days
 * @param {string} domain
 * @returns {{dateKey: string, totalMs: number}[]}
 */
export function siteSeries(days, domain) {
  return days.map((day) => ({
    dateKey: day.date,
    // Domains are object keys: read only own properties so "__proto__" stays harmless.
    totalMs: Object.hasOwn(day.domainMs, domain) ? day.domainMs[domain] : 0,
  }));
}

/**
 * Headline numbers for a series. "Visit days" are days with any time on the site.
 * @param {{dateKey: string, totalMs: number}[]} series
 */
export function summarizeSeries(series) {
  const { averageMs, daysCounted } = averageOverActiveDays(series);
  return {
    totalMs: series.reduce((sum, entry) => sum + entry.totalMs, 0),
    daysVisited: daysCounted,
    averageMs,
    busiestDay: busiestDay(series),
  };
}

/**
 * One entry per calendar day from `startKey` to `endKey`, filled from `series` (days
 * missing from it count as zero). Used so a trend chart has no gaps in its time axis.
 */
export function fillDays(series, startKey, endKey) {
  const byDate = new Map(series.map((entry) => [entry.dateKey, entry.totalMs]));
  return dateKeysBetween(startKey, endKey).map((dateKey) => ({
    dateKey,
    totalMs: byDate.get(dateKey) ?? 0,
  }));
}
