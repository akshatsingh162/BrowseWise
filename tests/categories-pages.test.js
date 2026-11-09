// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  loadDailyAnalytics,
  loadMonthlyAnalytics,
  loadWeeklyAnalytics,
} from '../src/dashboard/analytics-data.js';
import { loadOverviewData, loadWebsiteUsage } from '../src/dashboard/data.js';
import { mountAnalyticsPage } from '../src/dashboard/pages/analytics.js';
import { mountOverviewPage } from '../src/dashboard/pages/overview.js';
import { buildOverview } from '../src/shared/stats.js';
import { setCategoryOverride } from '../src/shared/storage/category-repo.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();

function day(domainMs) {
  return { date: '2026-11-07', hourlyMs: new Array(24).fill(0), domainMs };
}

beforeEach(() => {
  vi.stubGlobal('chrome', createChromeMock());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loaders return the user\u2019s category overrides', () => {
  beforeEach(async () => {
    await addUsage('youtube.com', [{ dateKey: '2026-11-07', hour: 9, ms: 5 * MIN }]);
  });

  it('as an empty object when nothing was changed', async () => {
    expect((await loadOverviewData(NOW)).overrides).toEqual({});
    expect((await loadWebsiteUsage('today', NOW)).overrides).toEqual({});
    expect((await loadDailyAnalytics('2026-11-07', NOW)).overrides).toEqual({});
    expect((await loadWeeklyAnalytics(NOW)).overrides).toEqual({});
    expect((await loadMonthlyAnalytics(NOW)).overrides).toEqual({});
  });

  it('with the saved choices', async () => {
    await setCategoryOverride('youtube.com', 'education');
    const expected = { 'youtube.com': 'education' };
    expect((await loadOverviewData(NOW)).overrides).toEqual(expected);
    expect((await loadWebsiteUsage('7d', NOW)).overrides).toEqual(expected);
    expect((await loadDailyAnalytics('2026-11-07', NOW)).overrides).toEqual(expected);
    expect((await loadWeeklyAnalytics(NOW)).overrides).toEqual(expected);
    expect((await loadMonthlyAnalytics(NOW)).overrides).toEqual(expected);
  });
});

describe('overview page: time by category', () => {
  const deps = (domainMs, overrides = {}) => ({
    loadOverviewData: vi.fn(async () => ({
      overview: buildOverview({ today: day(domainMs), yesterday: day({}), now: NOW }),
      average: { averageMs: 0, daysCounted: 0 },
      overrides,
    })),
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn(() => () => {}),
    now: () => NOW,
  });

  let container;
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } });
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
  });

  it('shows the category breakdown beside the top websites', async () => {
    mountOverviewPage(container, deps({ 'github.com': 60 * MIN, 'youtube.com': 40 * MIN }));
    await vi.waitFor(() => expect(container.querySelector('.db-catpanel')).not.toBeNull());
    expect(container.querySelector('.db-split')).not.toBeNull();
    expect(container.textContent).toContain('Productive sites');
    expect(container.textContent).toContain('60% of the total');
  });

  it('uses the user\u2019s overrides', async () => {
    mountOverviewPage(
      container,
      deps({ 'github.com': 60 * MIN, 'youtube.com': 40 * MIN }, { 'youtube.com': 'education' }),
    );
    await vi.waitFor(() => expect(container.querySelector('.db-catpanel')).not.toBeNull());
    const productive = [...container.querySelectorAll('.db-catgroup')].find(
      (g) => g.querySelector('.db-catgroup-label').textContent === 'Productive sites',
    );
    expect(productive.querySelector('.db-catgroup-value').textContent).toBe('1h 40m');
  });

  it('shows no category panel when nothing was recorded', async () => {
    mountOverviewPage(container, deps({}));
    await vi.waitFor(() => expect(container.querySelector('.db-stats')).not.toBeNull());
    expect(container.querySelector('.db-catpanel')).toBeNull();
    expect(container.querySelector('.db-split')).toBeNull();
  });
});

describe('analytics page: time by category', () => {
  it('appears in the daily view', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } });
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    const hourlyMs = new Array(24).fill(0);
    hourlyMs[9] = 40 * MIN;
    const ranked = [
      { domain: 'github.com', ms: 30 * MIN, share: 0.75 },
      { domain: 'netflix.com', ms: 10 * MIN, share: 0.25 },
    ];
    mountAnalyticsPage(container, {
      loadDailyAnalytics: vi.fn(async () => ({
        dateKey: '2026-11-07',
        isToday: true,
        hourlyMs,
        ranked,
        totalMs: 40 * MIN,
        siteCount: 2,
        busiestHour: { hour: 9, ms: 40 * MIN },
        activeHours: 1,
        overrides: { 'netflix.com': 'education' },
      })),
      loadWeeklyAnalytics: vi.fn(),
      loadMonthlyAnalytics: vi.fn(),
      createChart: vi.fn(() => ({ destroy() {} })),
      readTheme: () => ({}),
      requestLiveFlush: vi.fn(async () => true),
      subscribe: vi.fn(() => () => {}),
      now: () => NOW,
      locale: 'en-US',
    });

    await vi.waitFor(() => expect(container.querySelector('.db-catpanel')).not.toBeNull());
    const productive = [...container.querySelectorAll('.db-catgroup')].find(
      (g) => g.querySelector('.db-catgroup-label').textContent === 'Productive sites',
    );
    expect(productive.querySelector('.db-catgroup-value').textContent).toBe('40m');
  });
});
