import {
  dateKeysBetween,
  calendarMonths,
  busiestDay,
  busiestHour,
  activeHourCount,
  averageOverActiveDays,
  comparePeriods,
  dayTotals,
  sumTotals,
  totalsByMonth,
} from '../shared/analytics.js';
import { mergeDays } from '../shared/aggregate.js';
import { shiftDateKey } from '../shared/dates.js';
import { rankDomains, totalMs } from '../shared/stats.js';
import { getCategoryOverrides } from '../shared/storage/category-repo.js';
import { getUsageForRange } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/** Months shown in the "by month" chart. */
export const MONTHS_SHOWN = 6;

/**
 * One day: hour-by-hour activity and the websites used.
 * @param {string} dateKey day to show
 * @param {number} now epoch ms
 */
export async function loadDailyAnalytics(dateKey, now) {
  const [[day], overrides] = await Promise.all([
    getUsageForRange([dateKey]),
    getCategoryOverrides(),
  ]);
  const ranked = rankDomains(day);

  return {
    dateKey,
    overrides,
    isToday: dateKey === toLocalDateKey(now),
    hourlyMs: day.hourlyMs,
    ranked,
    totalMs: totalMs(day),
    siteCount: ranked.length,
    busiestHour: busiestHour(day.hourlyMs),
    activeHours: activeHourCount(day.hourlyMs),
  };
}

/**
 * The last 7 days (ending today) compared day-by-day with the 7 days before.
 * @param {number} now epoch ms
 */
export async function loadWeeklyAnalytics(now) {
  const todayKey = toLocalDateKey(now);
  const currentKeys = dateKeysBetween(shiftDateKey(todayKey, -6), todayKey);
  const previousKeys = dateKeysBetween(shiftDateKey(todayKey, -13), shiftDateKey(todayKey, -7));

  const [days, overrides] = await Promise.all([
    getUsageForRange([...previousKeys, ...currentKeys]),
    getCategoryOverrides(),
  ]);
  const previousDays = days.slice(0, 7);
  const currentDays = days.slice(7);

  const current = dayTotals(currentDays);
  const previous = dayTotals(previousDays);
  const currentMs = sumTotals(current);
  const previousMs = sumTotals(previous);

  return {
    overrides,
    current,
    previous,
    totalMs: currentMs,
    previousMs,
    average: averageOverActiveDays(current),
    busiestDay: busiestDay(current),
    comparison: comparePeriods(currentMs, previousMs),
    ranked: rankDomains(mergeDays(currentDays)),
  };
}

/**
 * The last 30 days (ending today), the 30 before for comparison, and the last
 * six calendar months. One storage read covers all of it.
 * @param {number} now epoch ms
 */
export async function loadMonthlyAnalytics(now) {
  const todayKey = toLocalDateKey(now);
  const months = calendarMonths(now, MONTHS_SHOWN);
  const keys = dateKeysBetween(months[0].startKey, todayKey);

  const [days, overrides] = await Promise.all([getUsageForRange(keys), getCategoryOverrides()]);
  const totals = dayTotals(days);

  // Six calendar months always span well over 60 days, so both 30-day windows fit.
  const currentDays = days.slice(-30);
  const previousDays = days.slice(-60, -30);
  const current = totals.slice(-30);
  const previous = totals.slice(-60, -30);
  const currentMs = sumTotals(current);
  const previousMs = sumTotals(previous);

  return {
    overrides,
    current,
    previousMs,
    totalMs: currentMs,
    previousDayCount: previousDays.length,
    average: averageOverActiveDays(current),
    busiestDay: busiestDay(current),
    comparison: comparePeriods(currentMs, previousMs),
    ranked: rankDomains(mergeDays(currentDays)),
    months: totalsByMonth(totals, months, todayKey.slice(0, 7)),
  };
}
