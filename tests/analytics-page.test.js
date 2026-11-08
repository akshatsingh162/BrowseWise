// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAnalyticsPage } from '../src/dashboard/pages/analytics.js';
import { toLocalDateKey } from '../src/shared/time.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const TODAY = toLocalDateKey(NOW);
const plain = (text) => text.replace(/\u202f/g, ' ');

const ranked = [
  { domain: 'github.com', ms: 60 * MIN, share: 0.75 },
  { domain: 'youtube.com', ms: 20 * MIN, share: 0.25 },
];

function daily(overrides = {}) {
  const hourlyMs = new Array(24).fill(0);
  hourlyMs[9] = 50 * MIN;
  hourlyMs[14] = 30 * MIN;
  return {
    dateKey: TODAY,
    isToday: true,
    hourlyMs,
    ranked,
    totalMs: 80 * MIN,
    siteCount: 2,
    busiestHour: { hour: 9, ms: 50 * MIN },
    activeHours: 2,
    ...overrides,
  };
}

const week = (start, minutes) =>
  minutes.map((m, i) => ({ dateKey: `2026-${start}${i}`, totalMs: m * MIN }));

function weekly(overrides = {}) {
  return {
    current: week('11-0', [60, 0, 30, 0, 0, 0, 90]),
    previous: week('10-2', [10, 20, 30, 40, 50, 60, 70]),
    totalMs: 180 * MIN,
    previousMs: 280 * MIN,
    average: { averageMs: 60 * MIN, daysCounted: 3 },
    busiestDay: { dateKey: '2026-11-06', totalMs: 90 * MIN },
    comparison: { deltaMs: -100 * MIN, deltaPct: -100 / 280 },
    ranked,
    ...overrides,
  };
}

function monthly(overrides = {}) {
  return {
    current: week('11-', [60, 30]),
    totalMs: 90 * MIN,
    previousMs: 0,
    previousDayCount: 30,
    average: { averageMs: 45 * MIN, daysCounted: 2 },
    busiestDay: { dateKey: '2026-11-07', totalMs: 60 * MIN },
    comparison: { deltaMs: 90 * MIN, deltaPct: null },
    ranked,
    months: [
      { key: '2026-10', startKey: '2026-10-01', totalMs: 30 * MIN, activeDays: 1, partial: false },
      { key: '2026-11', startKey: '2026-11-01', totalMs: 60 * MIN, activeDays: 1, partial: true },
    ],
    ...overrides,
  };
}

let container;
let charts;
const unsubscribe = vi.fn();
let subscribeCallback;

function mount(overrides = {}) {
  const deps = {
    loadDailyAnalytics: vi.fn(async () => daily()),
    loadWeeklyAnalytics: vi.fn(async () => weekly()),
    loadMonthlyAnalytics: vi.fn(async () => monthly()),
    createChart: vi.fn((canvas, config) => {
      const chart = { canvas, config, destroy: vi.fn() };
      charts.push(chart);
      return chart;
    }),
    readTheme: () => ({
      accent: '#aaa',
      accentDim: '#aaa8',
      accentFill: '#aaa2',
      chartMuted: '#555',
      text: '#fff',
      textMuted: '#999',
      grid: '#222',
      tooltipBackground: '#111',
      tooltipBorder: '#333',
    }),
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return unsubscribe;
    }),
    now: () => NOW,
    locale: 'en-US',
    ...overrides,
  };
  const page = mountAnalyticsPage(container, deps);
  return { page, deps };
}

const settled = () => vi.waitFor(() => expect(container.querySelector('.db-loading')).toBeNull());
const click = (label) =>
  [...container.querySelectorAll('button')]
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label)
    .click();
const stat = (label) => container.querySelector(`section[aria-label="${label}"]`);

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
  charts = [];
  unsubscribe.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('analytics page: daily view', () => {
  it('starts on today with the stat cards, the hourly chart, and the website list', async () => {
    mount();
    await vi.waitFor(() => expect(charts).toHaveLength(1));

    expect(container.querySelector('h1').textContent).toBe('Analytics');
    expect(container.querySelector('.db-daynav-label').textContent).toBe('Today');
    expect(stat('Screen time').querySelector('.db-stat-value').textContent).toBe('1h 20m');
    expect(stat('Websites').querySelector('.db-stat-value').textContent).toBe('2');
    expect(plain(stat('Busiest hour').textContent)).toContain('9 AM \u2013 10 AM');
    expect(stat('Busiest hour').textContent).toContain('50m active');
    expect(stat('Active hours').querySelector('.db-stat-value').textContent).toBe('2');
    expect(charts[0].config.type).toBe('bar');
    expect(container.querySelector('section[aria-label="Websites today"]')).not.toBeNull();
  });

  it('draws the chart only after it is in the page, with animation on first load', async () => {
    mount();
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    expect(container.contains(charts[0].canvas)).toBe(true);
    expect(charts[0].config.options.animation).toEqual({ duration: 400 });
  });

  it('shows an empty state instead of empty charts', async () => {
    mount({ loadDailyAnalytics: vi.fn(async () => daily({ totalMs: 0, ranked: [] })) });
    await vi.waitFor(() => expect(container.textContent).toContain('No browsing time on this day'));
    expect(charts).toHaveLength(0);
  });

  it('steps back a day and forward again', async () => {
    const { deps } = mount();
    await settled();
    expect(container.querySelector('[aria-label="Next day"]').disabled).toBe(true);
    expect(container.querySelector('.db-today').disabled).toBe(true);

    click('Previous day');
    await vi.waitFor(() =>
      expect(deps.loadDailyAnalytics).toHaveBeenLastCalledWith('2026-11-06', NOW),
    );
    expect(container.querySelector('.db-daynav-label').textContent).toBe('Yesterday');
    expect(container.querySelector('[aria-label="Next day"]').disabled).toBe(false);
    expect(container.querySelector('.db-today').disabled).toBe(false);

    click('Previous day');
    await vi.waitFor(() =>
      expect(deps.loadDailyAnalytics).toHaveBeenLastCalledWith('2026-11-05', NOW),
    );
    expect(container.querySelector('.db-daynav-label').textContent).toBe(
      'Thursday, November 5, 2026',
    );

    click('Today');
    await vi.waitFor(() => expect(deps.loadDailyAnalytics).toHaveBeenLastCalledWith(TODAY, NOW));
    expect(container.querySelector('.db-daynav-label').textContent).toBe('Today');
  });

  it('describes a past day without "so far" or the "today" list title', async () => {
    mount({
      loadDailyAnalytics: vi.fn(async (dateKey) => daily({ dateKey, isToday: dateKey === TODAY })),
    });
    await settled();
    click('Previous day');
    await vi.waitFor(() =>
      expect(container.querySelector('section[aria-label="Websites on this day"]')).not.toBeNull(),
    );
    expect(stat('Screen time').textContent).not.toContain('So far today');
  });
});

describe('analytics page: weekly and monthly views', () => {
  it('weekly: hides the day navigation, shows grouped bars, and explains the comparison', async () => {
    const { deps } = mount();
    await settled();
    click('Weekly');

    await vi.waitFor(() => expect(deps.loadWeeklyAnalytics).toHaveBeenCalledWith(NOW));
    await vi.waitFor(() => expect(charts.at(-1)?.config.data.datasets).toHaveLength(2));
    expect(container.querySelector('.db-daynav').hidden).toBe(true);
    expect(stat('Last 7 days').querySelector('.db-stat-value').textContent).toBe('3h 00m');
    expect(stat('Last 7 days').textContent).toContain('3 of 7 days with data');
    expect(stat('Daily average').querySelector('.db-stat-value').textContent).toBe('1h 00m');
    expect(stat('Busiest day').textContent).toContain('Fri, Nov 6');
    expect(stat('Vs previous 7 days').querySelector('.db-stat-value').textContent).toBe(
      '\u22121h 40m',
    );
    expect(stat('Vs previous 7 days').textContent).toContain('36% less');
    expect(container.querySelector('section[aria-label="Most used this week"]')).not.toBeNull();
  });

  it('weekly: shows an empty state when both weeks are empty', async () => {
    mount({
      loadWeeklyAnalytics: vi.fn(async () => weekly({ totalMs: 0, previousMs: 0 })),
    });
    await settled();
    click('Weekly');
    await vi.waitFor(() =>
      expect(container.textContent).toContain('No browsing time in the last 14 days'),
    );
  });

  it('monthly: draws the trend line and the monthly bars, with a dash when nothing came before', async () => {
    mount();
    await settled();
    click('Monthly');

    await vi.waitFor(() => expect(charts.filter((c) => c.config.type === 'line')).toHaveLength(1));
    expect(charts.filter((c) => c.config.type === 'bar').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.db-chart')).toHaveLength(2);
    expect(stat('Vs previous 30 days').querySelector('.db-stat-value').textContent).toBe('\u2014');
    expect(stat('Vs previous 30 days').textContent).toContain('No data in the previous 30 days');
    expect(
      container.querySelector('section[aria-label="Most used in the last 30 days"]'),
    ).not.toBeNull();
  });

  it('monthly: shows an empty state when nothing is recorded', async () => {
    mount({
      loadMonthlyAnalytics: vi.fn(async () =>
        monthly({ totalMs: 0, months: monthly().months.map((m) => ({ ...m, totalMs: 0 })) }),
      ),
    });
    await settled();
    click('Monthly');
    await vi.waitFor(() =>
      expect(container.textContent).toContain('No browsing time recorded yet'),
    );
  });

  it('marks exactly the chosen period as selected', async () => {
    mount();
    await settled();
    click('Monthly');
    const pressed = [...container.querySelectorAll('.bw-segmented-btn')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
    expect(pressed).toEqual(['Monthly']);
  });
});

describe('analytics page: interaction', () => {
  it('clicking a weekly bar opens that day in the daily view', async () => {
    const { deps } = mount();
    await settled();
    click('Weekly');
    await vi.waitFor(() => expect(charts.at(-1)?.config.data.datasets).toHaveLength(2));

    const weeklyChart = charts.at(-1);
    const fakeChart = { getElementsAtEventForMode: () => [{ datasetIndex: 1, index: 2 }] };
    weeklyChart.config.options.onClick({}, [], fakeChart);

    await vi.waitFor(() =>
      expect(deps.loadDailyAnalytics).toHaveBeenLastCalledWith('2026-10-22', NOW),
    );
    expect(container.querySelector('.db-daynav').hidden).toBe(false);
    expect(container.querySelector('.db-daynav-label').textContent).toBe(
      'Thursday, October 22, 2026',
    );
    const pressed = [...container.querySelectorAll('.bw-segmented-btn')]
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
    expect(pressed).toEqual(['Daily']);
  });

  it('keeps the same controls (and keyboard focus) across background refreshes', async () => {
    const { deps } = mount();
    await settled();
    const previousButton = container.querySelector('[aria-label="Previous day"]');
    previousButton.focus();

    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());
    subscribeCallback();
    await vi.waitFor(() => expect(deps.loadDailyAnalytics.mock.calls.length).toBeGreaterThan(1));

    expect(container.querySelector('[aria-label="Previous day"]')).toBe(previousButton);
    expect(document.activeElement).toBe(previousButton);
  });

  it('draws once on load, and flushes before that draw', async () => {
    const { deps } = mount();
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());
    expect(deps.requestLiveFlush).toHaveBeenCalledTimes(1);
    expect(deps.loadDailyAnalytics).toHaveBeenCalledTimes(1);
  });

  it('does not redraw charts when a background refresh finds nothing new', async () => {
    const { deps } = mount();
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());

    subscribeCallback();
    await vi.waitFor(() => expect(deps.loadDailyAnalytics.mock.calls.length).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(charts).toHaveLength(1);
    expect(charts[0].destroy).not.toHaveBeenCalled();
  });

  it('redraws without re-animating when a background refresh brings new data', async () => {
    const loadDailyAnalytics = vi
      .fn()
      .mockResolvedValueOnce(daily())
      .mockResolvedValue(daily({ totalMs: 95 * MIN }));
    const { deps } = mount({ loadDailyAnalytics });
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());
    expect(charts[0].config.options.animation).toEqual({ duration: 400 });

    subscribeCallback();
    await vi.waitFor(() => expect(charts).toHaveLength(2));
    expect(charts[1].config.options.animation).toBe(false);
    expect(charts[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys charts when the view changes and when the page is unmounted', async () => {
    const { page } = mount();
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    const daily = charts[0];

    click('Weekly');
    await vi.waitFor(() => expect(daily.destroy).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(charts.length).toBeGreaterThanOrEqual(2));

    const live = charts.filter((c) => c.destroy.mock.calls.length === 0);
    page.unmount();
    for (const chart of live) expect(chart.destroy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('shows an error state with a working retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadDailyAnalytics = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValue(daily());
    mount({ loadDailyAnalytics });

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    container.querySelector('[role="alert"] button').click();
    await vi.waitFor(() => expect(container.querySelector('.db-stats')).not.toBeNull());
  });

  it('provides the chart data as a hidden table for assistive technology', async () => {
    mount();
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    const table = container.querySelector('table.bw-sr-only');
    expect(table.querySelector('caption').textContent).toBe('Activity by hour');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});
