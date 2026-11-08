import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  loadDailyAnalytics,
  loadMonthlyAnalytics,
  loadWeeklyAnalytics,
} from '../src/dashboard/analytics-data.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const seg = (dateKey, hour, ms) => ({ dateKey, hour, ms });

beforeEach(() => {
  vi.stubGlobal('chrome', createChromeMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadDailyAnalytics', () => {
  it('summarises one day', async () => {
    await addUsage('github.com', [seg('2026-11-07', 9, 40 * MIN), seg('2026-11-07', 14, 20 * MIN)]);
    await addUsage('youtube.com', [seg('2026-11-07', 14, 10 * MIN)]);
    await addUsage('github.com', [seg('2026-11-06', 9, 99 * MIN)]);

    const data = await loadDailyAnalytics('2026-11-07', NOW);

    expect(data.isToday).toBe(true);
    expect(data.totalMs).toBe(70 * MIN);
    expect(data.siteCount).toBe(2);
    expect(data.ranked[0].domain).toBe('github.com');
    expect(data.busiestHour).toEqual({ hour: 9, ms: 40 * MIN });
    expect(data.activeHours).toBe(2);
    expect(data.hourlyMs).toHaveLength(24);
  });

  it('knows when the chosen day is not today, and copes with an empty day', async () => {
    const data = await loadDailyAnalytics('2026-10-01', NOW);
    expect(data.isToday).toBe(false);
    expect(data.totalMs).toBe(0);
    expect(data.busiestHour).toBeNull();
    expect(data.ranked).toEqual([]);
  });
});

describe('loadWeeklyAnalytics', () => {
  beforeEach(async () => {
    await addUsage('github.com', [seg('2026-11-07', 9, 30 * MIN)]);
    await addUsage('youtube.com', [seg('2026-11-05', 9, 20 * MIN)]);
    await addUsage('github.com', [seg('2026-10-31', 9, 40 * MIN)]);
    await addUsage('github.com', [seg('2026-10-20', 9, 500 * MIN)]); // outside both weeks
  });

  it('covers the last 7 days and the 7 before, aligned weekday by weekday', async () => {
    const data = await loadWeeklyAnalytics(NOW);
    expect(data.current.map((d) => d.dateKey)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(data.previous).toHaveLength(7);
    expect(data.previous[0].dateKey).toBe('2026-10-25');
    expect(data.previous[6].dateKey).toBe('2026-10-31');
  });

  it('computes totals, comparison, average, and busiest day', async () => {
    const data = await loadWeeklyAnalytics(NOW);
    expect(data.totalMs).toBe(50 * MIN);
    expect(data.previousMs).toBe(40 * MIN);
    expect(data.comparison).toEqual({ deltaMs: 10 * MIN, deltaPct: 0.25 });
    expect(data.average).toEqual({ averageMs: 25 * MIN, daysCounted: 2 });
    expect(data.busiestDay.dateKey).toBe('2026-11-07');
    expect(data.ranked.map((site) => site.domain)).toEqual(['github.com', 'youtube.com']);
  });
});

describe('loadMonthlyAnalytics', () => {
  beforeEach(async () => {
    await addUsage('github.com', [seg('2026-11-07', 9, 60 * MIN)]);
    await addUsage('github.com', [seg('2026-10-10', 9, 30 * MIN)]); // inside the last 30 days
    await addUsage('github.com', [seg('2026-10-05', 9, 100 * MIN)]); // previous 30 days
    await addUsage('github.com', [seg('2026-06-15', 9, 45 * MIN)]);
    await addUsage('github.com', [seg('2026-07-20', 9, 25 * MIN)]);
    await addUsage('github.com', [seg('2026-05-31', 9, 999 * MIN)]); // before the first month
  });

  it('builds the 30-day windows', async () => {
    const data = await loadMonthlyAnalytics(NOW);
    expect(data.current).toHaveLength(30);
    expect(data.current[0].dateKey).toBe('2026-10-09');
    expect(data.current.at(-1).dateKey).toBe('2026-11-07');
    expect(data.totalMs).toBe(90 * MIN);
    expect(data.previousMs).toBe(100 * MIN);
    expect(data.comparison.deltaPct).toBeCloseTo(-0.1);
    expect(data.busiestDay.dateKey).toBe('2026-11-07');
    expect(data.average).toEqual({ averageMs: 45 * MIN, daysCounted: 2 });
  });

  it('totals the last six calendar months and flags the current one', async () => {
    const data = await loadMonthlyAnalytics(NOW);
    expect(data.months.map((m) => m.key)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(data.months.map((m) => m.totalMs / MIN)).toEqual([45, 25, 0, 0, 130, 60]);
    expect(data.months.map((m) => m.partial)).toEqual([false, false, false, false, false, true]);
  });

  it('copes with no data at all', async () => {
    vi.stubGlobal('chrome', createChromeMock());
    const data = await loadMonthlyAnalytics(NOW);
    expect(data.totalMs).toBe(0);
    expect(data.busiestDay).toBeNull();
    expect(data.months.every((m) => m.totalMs === 0)).toBe(true);
  });
});
