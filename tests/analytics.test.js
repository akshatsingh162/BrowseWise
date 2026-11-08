import { describe, expect, it } from 'vitest';
import {
  activeHourCount,
  averageOverActiveDays,
  busiestDay,
  busiestHour,
  calendarMonths,
  comparePeriods,
  dateKeysBetween,
  dayTotals,
  sumTotals,
  totalsByMonth,
} from '../src/shared/analytics.js';

const MIN = 60_000;
const totals = (...entries) =>
  entries.map(([dateKey, minutes]) => ({ dateKey, totalMs: minutes * MIN }));

describe('dayTotals and sumTotals', () => {
  it('turns day records into dated totals', () => {
    const days = [
      { date: '2026-11-06', domainMs: { 'a.com': 5 * MIN, 'b.com': 5 * MIN } },
      { date: '2026-11-07', domainMs: {} },
    ];
    expect(dayTotals(days)).toEqual([
      { dateKey: '2026-11-06', totalMs: 10 * MIN },
      { dateKey: '2026-11-07', totalMs: 0 },
    ]);
    expect(sumTotals(dayTotals(days))).toBe(10 * MIN);
    expect(sumTotals([])).toBe(0);
  });
});

describe('busiestHour', () => {
  const hourly = (entries) => {
    const hours = new Array(24).fill(0);
    for (const [hour, minutes] of Object.entries(entries)) hours[Number(hour)] = minutes * MIN;
    return hours;
  };

  it('finds the hour with the most activity', () => {
    expect(busiestHour(hourly({ 9: 20, 14: 45, 20: 10 }))).toEqual({ hour: 14, ms: 45 * MIN });
  });

  it('prefers the earlier hour on a tie', () => {
    expect(busiestHour(hourly({ 9: 30, 15: 30 })).hour).toBe(9);
  });

  it('returns null when nothing was recorded', () => {
    expect(busiestHour(hourly({}))).toBeNull();
  });
});

describe('activeHourCount', () => {
  it('counts hours with at least a minute, ignoring stray seconds', () => {
    const hours = new Array(24).fill(0);
    hours[9] = 30 * MIN;
    hours[10] = MIN;
    hours[11] = 59_999;
    expect(activeHourCount(hours)).toBe(2);
  });
});

describe('busiestDay', () => {
  it('finds the busiest day, earlier day winning ties', () => {
    expect(busiestDay(totals(['2026-11-01', 10], ['2026-11-02', 50], ['2026-11-03', 50]))).toEqual({
      dateKey: '2026-11-02',
      totalMs: 50 * MIN,
    });
  });

  it('returns null when every day is empty', () => {
    expect(busiestDay(totals(['2026-11-01', 0]))).toBeNull();
    expect(busiestDay([])).toBeNull();
  });
});

describe('averageOverActiveDays', () => {
  it('does not count empty days as zero', () => {
    const result = averageOverActiveDays(totals(['a', 60], ['b', 0], ['c', 30], ['d', 0]));
    expect(result).toEqual({ averageMs: 45 * MIN, daysCounted: 2 });
  });

  it('is zero with no data', () => {
    expect(averageOverActiveDays(totals(['a', 0]))).toEqual({ averageMs: 0, daysCounted: 0 });
  });
});

describe('comparePeriods', () => {
  it('gives the difference and a percentage', () => {
    expect(comparePeriods(150 * MIN, 100 * MIN)).toEqual({ deltaMs: 50 * MIN, deltaPct: 0.5 });
    expect(comparePeriods(50 * MIN, 100 * MIN)).toEqual({ deltaMs: -50 * MIN, deltaPct: -0.5 });
  });

  it('has no percentage when there is nothing to compare with', () => {
    expect(comparePeriods(10 * MIN, 0)).toEqual({ deltaMs: 10 * MIN, deltaPct: null });
  });
});

describe('dateKeysBetween', () => {
  it('lists every day inclusively, across month and year ends', () => {
    expect(dateKeysBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(dateKeysBetween('2026-11-07', '2026-11-07')).toEqual(['2026-11-07']);
  });

  it('is empty when the range is reversed', () => {
    expect(dateKeysBetween('2026-11-08', '2026-11-07')).toEqual([]);
  });
});

describe('calendarMonths', () => {
  const now = new Date(2026, 10, 7, 12).getTime();

  it('lists the last N months ending with the current one', () => {
    expect(calendarMonths(now, 6).map((month) => month.key)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(calendarMonths(now, 1)).toEqual([{ key: '2026-11', startKey: '2026-11-01' }]);
  });

  it('crosses year boundaries', () => {
    const january = new Date(2027, 0, 15, 12).getTime();
    expect(calendarMonths(january, 3).map((month) => month.key)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });
});

describe('totalsByMonth', () => {
  it('sums daily totals into months and flags the one in progress', () => {
    const months = [
      { key: '2026-10', startKey: '2026-10-01' },
      { key: '2026-11', startKey: '2026-11-01' },
    ];
    const result = totalsByMonth(
      totals(['2026-10-05', 30], ['2026-10-31', 10], ['2026-11-01', 0], ['2026-11-07', 20]),
      months,
      '2026-11',
    );
    expect(result).toEqual([
      { key: '2026-10', startKey: '2026-10-01', totalMs: 40 * MIN, activeDays: 2, partial: false },
      { key: '2026-11', startKey: '2026-11-01', totalMs: 20 * MIN, activeDays: 1, partial: true },
    ]);
  });
});
