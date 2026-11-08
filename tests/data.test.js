import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { loadOverviewData, loadWebsiteUsage } from '../src/dashboard/data.js';
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

describe('loadOverviewData', () => {
  it('summarises today and compares with yesterday by the same time of day', async () => {
    await addUsage('github.com', [seg('2026-11-07', 9, 30 * MIN)]);
    await addUsage('youtube.com', [seg('2026-11-07', 10, 10 * MIN)]);
    await addUsage('github.com', [seg('2026-11-06', 9, 20 * MIN)]);
    await addUsage('github.com', [seg('2026-11-06', 15, 50 * MIN)]); // after 12:00: excluded

    const { overview } = await loadOverviewData(NOW);

    expect(overview.totalMs).toBe(40 * MIN);
    expect(overview.siteCount).toBe(2);
    expect(overview.topSite.domain).toBe('github.com');
    expect(overview.comparison.yesterdayMs).toBe(20 * MIN);
    expect(overview.comparison.deltaMs).toBe(20 * MIN);
  });

  it('averages the previous 7 days that have data and excludes today', async () => {
    await addUsage('a.com', [seg('2026-11-07', 9, 500 * MIN)]); // today: ignored
    await addUsage('a.com', [seg('2026-11-06', 9, 60 * MIN)]);
    await addUsage('a.com', [seg('2026-11-04', 9, 30 * MIN)]);
    await addUsage('a.com', [seg('2026-10-20', 9, 999 * MIN)]); // outside the window

    const { average } = await loadOverviewData(NOW);
    expect(average.daysCounted).toBe(2);
    expect(average.averageMs).toBe(45 * MIN);
  });

  it('copes with no data at all', async () => {
    const { overview, average } = await loadOverviewData(NOW);
    expect(overview.totalMs).toBe(0);
    expect(overview.topSite).toBeNull();
    expect(average).toEqual({ averageMs: 0, daysCounted: 0 });
  });
});

describe('loadWebsiteUsage', () => {
  beforeEach(async () => {
    await addUsage('a.com', [seg('2026-11-07', 9, 10 * MIN)]);
    await addUsage('b.com', [seg('2026-11-07', 9, 5 * MIN)]);
    await addUsage('a.com', [seg('2026-11-03', 9, 20 * MIN)]);
    await addUsage('c.com', [seg('2026-10-20', 9, 40 * MIN)]);
  });

  it('today only includes today', async () => {
    const data = await loadWebsiteUsage('today', NOW);
    expect(data.ranked.map((site) => site.domain)).toEqual(['a.com', 'b.com']);
    expect(data.totalMs).toBe(15 * MIN);
    expect(data.dayCount).toBe(1);
    expect(data.daysWithData).toBe(1);
  });

  it('7d merges the week and counts days with data', async () => {
    const data = await loadWebsiteUsage('7d', NOW);
    expect(data.ranked.map((site) => [site.domain, site.ms])).toEqual([
      ['a.com', 30 * MIN],
      ['b.com', 5 * MIN],
    ]);
    expect(data.dayCount).toBe(7);
    expect(data.daysWithData).toBe(2);
  });

  it('30d reaches back further and shares add up to 1', async () => {
    const data = await loadWebsiteUsage('30d', NOW);
    expect(data.ranked.map((site) => site.domain)).toEqual(['c.com', 'a.com', 'b.com']);
    expect(data.ranked.reduce((sum, site) => sum + site.share, 0)).toBeCloseTo(1);
    expect(data.dayCount).toBe(30);
  });
});
