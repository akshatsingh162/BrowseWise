import { describe, expect, it } from 'vitest';
import {
  fillDays,
  groupByWeek,
  siteSeries,
  summarizeSeries,
  weekStartKey,
} from '../src/shared/history.js';

const MIN = 60_000;
const day = (date, domainMs) => ({ date, hourlyMs: new Array(24).fill(0), domainMs });
const total = (dateKey, minutes) => ({ dateKey, totalMs: minutes * MIN });

describe('weekStartKey', () => {
  it('starts weeks on Monday by default', () => {
    // 2026-11-02 is a Monday.
    expect(weekStartKey('2026-11-02')).toBe('2026-11-02');
    expect(weekStartKey('2026-11-04')).toBe('2026-11-02');
    expect(weekStartKey('2026-11-08')).toBe('2026-11-02'); // Sunday belongs to the week before
    expect(weekStartKey('2026-11-09')).toBe('2026-11-09');
  });

  it('can start weeks on another day', () => {
    expect(weekStartKey('2026-11-04', 0)).toBe('2026-11-01'); // Sunday start
    expect(weekStartKey('2026-11-01', 0)).toBe('2026-11-01');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStartKey('2027-01-01')).toBe('2026-12-28'); // a Friday
    expect(weekStartKey('2026-03-01')).toBe('2026-02-23');
  });

  it('is not thrown off by daylight-saving days', () => {
    // US clocks changed on 2026-03-08 and 2026-11-01; the weekday must still be right.
    expect(weekStartKey('2026-03-08')).toBe('2026-03-02');
    expect(weekStartKey('2026-11-01')).toBe('2026-10-26');
  });
});

describe('groupByWeek', () => {
  it('groups days into Monday to Sunday weeks, newest first', () => {
    const weeks = groupByWeek([
      total('2026-10-27', 30),
      total('2026-11-02', 60),
      total('2026-11-08', 30), // Sunday: same week as 11-02
      total('2026-11-09', 10),
    ]);

    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-11-09', '2026-11-02', '2026-10-26']);
    expect(weeks[1]).toMatchObject({
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
      totalMs: 90 * MIN,
      activeDays: 2,
      averageMs: 45 * MIN,
    });
  });

  it('leaves out days and weeks with no time, and does not need sorted input', () => {
    const weeks = groupByWeek([
      total('2026-11-09', 10),
      total('2026-11-03', 0),
      total('2026-10-20', 5),
    ]);
    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-11-09', '2026-10-19']);
  });

  it('averages over days with data only', () => {
    const [week] = groupByWeek([total('2026-11-02', 60), total('2026-11-06', 120)]);
    expect(week.averageMs).toBe(90 * MIN); // not 180 / 7
  });

  it('returns nothing for no data', () => {
    expect(groupByWeek([])).toEqual([]);
    expect(groupByWeek([total('2026-11-02', 0)])).toEqual([]);
  });
});

describe('siteSeries', () => {
  const days = [
    day('2026-11-05', { 'github.com': 10 * MIN, 'youtube.com': 5 * MIN }),
    day('2026-11-06', { 'youtube.com': 20 * MIN }),
    day('2026-11-07', {}),
  ];

  it('returns one entry per day, in order, with zero for days without the site', () => {
    expect(siteSeries(days, 'youtube.com')).toEqual([
      { dateKey: '2026-11-05', totalMs: 5 * MIN },
      { dateKey: '2026-11-06', totalMs: 20 * MIN },
      { dateKey: '2026-11-07', totalMs: 0 },
    ]);
    expect(siteSeries(days, 'github.com').map((entry) => entry.totalMs)).toEqual([10 * MIN, 0, 0]);
  });

  it('is not fooled by names that exist on every object', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(siteSeries(days, name).every((entry) => entry.totalMs === 0)).toBe(true);
    }
  });

  it('finds a site that is really called __proto__', () => {
    const hostile = {};
    Object.defineProperty(hostile, '__proto__', { value: 7 * MIN, enumerable: true });
    expect(siteSeries([day('2026-11-05', hostile)], '__proto__')[0].totalMs).toBe(7 * MIN);
  });
});

describe('summarizeSeries', () => {
  it('summarises total, visit days, average and busiest day', () => {
    const summary = summarizeSeries([
      total('2026-11-05', 10),
      total('2026-11-06', 0),
      total('2026-11-07', 50),
    ]);
    expect(summary.totalMs).toBe(60 * MIN);
    expect(summary.daysVisited).toBe(2);
    expect(summary.averageMs).toBe(30 * MIN); // days with time only
    expect(summary.busiestDay).toEqual(total('2026-11-07', 50));
  });

  it('copes with a series that has no time', () => {
    expect(summarizeSeries([total('2026-11-05', 0)])).toEqual({
      totalMs: 0,
      daysVisited: 0,
      averageMs: 0,
      busiestDay: null,
    });
    expect(summarizeSeries([]).daysVisited).toBe(0);
  });
});

describe('fillDays', () => {
  it('returns every calendar day and fills the gaps with zero', () => {
    expect(fillDays([total('2026-11-02', 5)], '2026-11-01', '2026-11-03')).toEqual([
      total('2026-11-01', 0),
      total('2026-11-02', 5),
      total('2026-11-03', 0),
    ]);
  });
});
