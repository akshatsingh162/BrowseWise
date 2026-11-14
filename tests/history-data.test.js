import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  DEFAULT_SITE_RANGE_ID,
  SITE_RANGES,
  SUGGESTION_COUNT,
  loadHistoryOverview,
  loadSiteHistory,
} from '../src/dashboard/history-data.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime(); // Saturday 14 November 2026

const add = (dateKey, domain, minutes, hour = 9) =>
  addUsage(domain, [{ dateKey, hour, ms: minutes * MIN }]);

let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadHistoryOverview', () => {
  it('returns nothing but today for an empty store', async () => {
    expect(await loadHistoryOverview(NOW)).toEqual({ todayKey: '2026-11-14', days: [], weeks: [] });
  });

  it('lists recorded days newest first with the total, site count and top site', async () => {
    await add('2026-11-10', 'github.com', 30);
    await add('2026-11-10', 'youtube.com', 10);
    await add('2026-11-12', 'youtube.com', 5);
    await add('2026-11-14', 'github.com', 1);

    const { days } = await loadHistoryOverview(NOW);
    expect(days.map((day) => day.dateKey)).toEqual(['2026-11-14', '2026-11-12', '2026-11-10']);
    expect(days[2]).toEqual({
      dateKey: '2026-11-10',
      totalMs: 40 * MIN,
      siteCount: 2,
      topSite: { domain: 'github.com', ms: 30 * MIN },
    });
  });

  it('skips stored days that hold no time', async () => {
    await add('2026-11-10', 'github.com', 5);
    await chromeMock.storage.local.set({
      'usage:2026-11-11': { date: '2026-11-11', hourlyMs: new Array(24).fill(0), domainMs: {} },
    });
    const { days } = await loadHistoryOverview(NOW);
    expect(days.map((day) => day.dateKey)).toEqual(['2026-11-10']);
  });

  it('groups the same days into Monday to Sunday weeks', async () => {
    await add('2026-11-08', 'a.com', 30); // Sunday, belongs to the week of 2 Nov
    await add('2026-11-09', 'a.com', 10); // Monday
    await add('2026-11-13', 'a.com', 20);

    const { weeks } = await loadHistoryOverview(NOW);
    expect(weeks.map((week) => [week.weekStart, week.weekEnd, week.totalMs])).toEqual([
      ['2026-11-09', '2026-11-15', 30 * MIN],
      ['2026-11-02', '2026-11-08', 30 * MIN],
    ]);
    expect(weeks[0].activeDays).toBe(2);
  });

  it('reaches back further than a year', async () => {
    await add('2024-01-15', 'a.com', 1);
    const { days } = await loadHistoryOverview(NOW);
    expect(days.map((day) => day.dateKey)).toEqual(['2024-01-15']);
  });
});

describe('loadSiteHistory', () => {
  it('offers ranges of 30 days, 90 days and a year, defaulting to 30', () => {
    expect(SITE_RANGES.map((range) => [range.id, range.days])).toEqual([
      ['30d', 30],
      ['90d', 90],
      ['1y', 365],
    ]);
    expect(DEFAULT_SITE_RANGE_ID).toBe('30d');
  });

  it('returns only suggestions when no website is chosen', async () => {
    await add('2026-11-10', 'github.com', 30);
    await add('2026-11-11', 'youtube.com', 60);

    expect(await loadSiteHistory(null, '30d', NOW)).toEqual({
      domain: null,
      rangeId: '30d',
      suggestions: ['youtube.com', 'github.com'],
    });
  });

  it('suggests at most 50 websites, most used first', async () => {
    for (let i = 0; i < 60; i += 1) await add('2026-11-10', `site${i}.com`, 100 - i);
    const { suggestions } = await loadSiteHistory(null, '30d', NOW);
    expect(suggestions).toHaveLength(SUGGESTION_COUNT);
    expect(suggestions[0]).toBe('site0.com');
    expect(suggestions).not.toContain('site59.com');
  });

  it('returns one entry per day of the range, ending today', async () => {
    await add('2026-11-10', 'github.com', 30);
    await add('2026-11-14', 'github.com', 15);
    await add('2026-11-10', 'youtube.com', 99);

    const data = await loadSiteHistory('github.com', '30d', NOW);
    expect(data.series).toHaveLength(30);
    expect(data.series[0].dateKey).toBe('2026-10-16');
    expect(data.series.at(-1)).toEqual({ dateKey: '2026-11-14', totalMs: 15 * MIN });
    expect(data.series.find((entry) => entry.dateKey === '2026-11-10').totalMs).toBe(30 * MIN);
    expect(data.summary).toMatchObject({
      totalMs: 45 * MIN,
      daysVisited: 2,
      averageMs: 22.5 * MIN,
    });
    expect(data.summary.busiestDay.dateKey).toBe('2026-11-10');
  });

  it('uses the longer ranges, and a day outside a range is left out', async () => {
    await add('2026-08-20', 'github.com', 10); // 86 days before 14 Nov
    await add('2025-12-01', 'github.com', 10); // inside a year, outside 90 days

    expect((await loadSiteHistory('github.com', '30d', NOW)).summary.totalMs).toBe(0);
    const ninety = await loadSiteHistory('github.com', '90d', NOW);
    expect(ninety.series).toHaveLength(90);
    expect(ninety.summary.totalMs).toBe(10 * MIN);
    const year = await loadSiteHistory('github.com', '1y', NOW);
    expect(year.series).toHaveLength(365);
    expect(year.summary.totalMs).toBe(20 * MIN);
  });

  it('falls back to the default range for an unknown id', async () => {
    const data = await loadSiteHistory('github.com', 'forever', NOW);
    expect(data.rangeId).toBe('30d');
    expect(data.series).toHaveLength(30);
  });

  it('tells "not in this range" apart from "never visited"', async () => {
    await add('2026-08-20', 'github.com', 10);
    expect((await loadSiteHistory('github.com', '30d', NOW)).visitedInLastYear).toBe(true);
    expect((await loadSiteHistory('never.com', '30d', NOW)).visitedInLastYear).toBe(false);
  });

  it('is safe with names that exist on every object', async () => {
    await add('2026-11-10', 'github.com', 5);
    for (const name of ['__proto__', 'constructor', 'toString']) {
      const data = await loadSiteHistory(name, '30d', NOW);
      expect(data.summary.totalMs).toBe(0);
      expect(data.visitedInLastYear).toBe(false);
    }
  });
});
