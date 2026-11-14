// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAYS_PAGE_SIZE,
  WEEKS_PAGE_SIZE,
  mountHistoryPage,
} from '../src/dashboard/pages/history.js';
import { shiftDateKey } from '../src/shared/dates.js';
import { groupByWeek, siteSeries, summarizeSeries } from '../src/shared/history.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime(); // Saturday 14 November 2026
const TODAY = '2026-11-14';
const plain = (text) => text.replace(/\u202f/g, ' ');

const theme = {
  accent: '#aaa',
  accentDim: '#aaa8',
  accentFill: '#aaa2',
  chartMuted: '#555',
  text: '#fff',
  textMuted: '#999',
  grid: '#222',
  tooltipBackground: '#111',
  tooltipBorder: '#333',
};

function overview(entries) {
  const days = entries
    .map(([dateKey, minutes, domain = 'github.com']) => ({
      dateKey,
      totalMs: minutes * MIN,
      siteCount: 1,
      topSite: { domain, ms: minutes * MIN },
    }))
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  return {
    todayKey: TODAY,
    days,
    weeks: groupByWeek(days.map(({ dateKey, totalMs }) => ({ dateKey, totalMs }))),
  };
}

function siteData(domain, perDay = {}, { rangeId = '30d', visitedInLastYear = true } = {}) {
  const length = { '30d': 30, '90d': 90, '1y': 365 }[rangeId];
  const days = Array.from({ length }, (_, i) => {
    const date = shiftDateKey(TODAY, i - (length - 1));
    return { date, domainMs: perDay[date] === undefined ? {} : { [domain]: perDay[date] * MIN } };
  });
  const series = siteSeries(days, domain);
  return {
    domain,
    rangeId,
    suggestions: ['github.com', 'youtube.com'],
    series,
    summary: summarizeSeries(series),
    visitedInLastYear,
  };
}

let container;
let subscribeCallback;
const unsubscribe = vi.fn();
let charts;

function mount(overrides = {}) {
  const deps = {
    loadHistoryOverview: vi.fn(async () => overview([[TODAY, 30]])),
    loadSiteHistory: vi.fn(async (domain, rangeId) =>
      domain === null
        ? { domain: null, rangeId, suggestions: ['github.com', 'youtube.com'] }
        : siteData(domain, { '2026-11-10': 30 }, { rangeId }),
    ),
    createChart: vi.fn((canvas, config) => {
      const chart = { canvas, config, destroy: vi.fn() };
      charts.push(chart);
      return chart;
    }),
    readTheme: () => theme,
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return unsubscribe;
    }),
    openDay: vi.fn(),
    now: () => NOW,
    locale: 'en-US',
    ...overrides,
  };
  const page = mountHistoryPage(container, deps);
  return { page, deps };
}

const settled = () => vi.waitFor(() => expect(container.querySelector('.db-loading')).toBeNull());
const rows = () => [...container.querySelectorAll('.db-history-row')];
const switchView = (label) =>
  [...container.querySelectorAll('[aria-label="History view"] button')]
    .find((button) => button.textContent === label)
    .click();
const submitSite = (text) => {
  const input = container.querySelector('#history-site');
  input.value = text;
  container
    .querySelector('.db-history-form')
    .dispatchEvent(new Event('submit', { cancelable: true }));
};

beforeEach(() => {
  charts = [];
  unsubscribe.mockClear();
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('history page: days', () => {
  it('shows the heading and the three views, starting on Days', async () => {
    mount();
    await settled();
    expect(container.querySelector('h1').textContent).toBe('History');
    const buttons = [...container.querySelectorAll('[aria-label="History view"] button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Days', 'Weeks', 'One website']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('lists days newest first with a friendly label, total, top site and a link', async () => {
    mount({
      loadHistoryOverview: vi.fn(async () =>
        overview([
          [TODAY, 90, 'github.com'],
          ['2026-11-13', 30, 'youtube.com'],
          ['2026-11-05', 5, 'wikipedia.org'],
        ]),
      ),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(3));

    const text = (row, selector) => plain(row.querySelector(selector).textContent);
    expect(rows().map((row) => text(row, '.db-history-date'))).toEqual([
      'Today',
      'Yesterday',
      'Thu, Nov 5',
    ]);
    expect(text(rows()[0], '.db-time')).toBe('1h 30m');
    expect(text(rows()[1], '.db-site-name')).toBe('youtube.com');
    const link = rows()[2].querySelector('a');
    expect(link.getAttribute('href')).toBe('#analytics?day=2026-11-05');
    expect(link.getAttribute('aria-label')).toContain('Thursday, November 5, 2026');
    expect(container.querySelector('.db-summary').textContent).toBe(
      '3 days recorded, newest first',
    );
  });

  it('scales the bars to the longest day', async () => {
    mount({
      loadHistoryOverview: vi.fn(async () =>
        overview([
          [TODAY, 60],
          ['2026-11-13', 30],
        ]),
      ),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    const widths = rows().map((row) => row.querySelector('.bw-bar-fill').style.width);
    expect(widths).toEqual(['100%', '50%']);
  });

  it('shows an empty state when nothing is recorded', async () => {
    mount({ loadHistoryOverview: vi.fn(async () => overview([])) });
    await vi.waitFor(() => expect(container.textContent).toContain('No history yet'));
    expect(rows()).toHaveLength(0);
  });

  it('shows 30 days at a time and reveals the rest with "Show more"', async () => {
    const entries = Array.from({ length: 35 }, (_, i) => [shiftDateKey(TODAY, -i), 10 + i]);
    mount({ loadHistoryOverview: vi.fn(async () => overview(entries)) });
    await vi.waitFor(() => expect(rows()).toHaveLength(DAYS_PAGE_SIZE));

    expect(container.querySelector('.db-more').textContent).toContain('Showing 30 of 35 days');
    const more = container.querySelector('.db-showmore');
    expect(more.textContent).toBe('Show 5 more');

    more.click();
    expect(rows()).toHaveLength(35);
    expect(container.querySelector('.db-showmore')).toBeNull();
  });

  it('keeps the expanded list when the data refreshes', async () => {
    const entries = Array.from({ length: 40 }, (_, i) => [shiftDateKey(TODAY, -i), 10 + i]);
    mount({ loadHistoryOverview: vi.fn(async () => overview(entries)) });
    await vi.waitFor(() => expect(rows()).toHaveLength(30));
    container.querySelector('.db-showmore').click();
    expect(rows()).toHaveLength(40);

    subscribeCallback();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rows()).toHaveLength(40);
  });

  it('shows an error state with a retry when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadHistoryOverview = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValue(overview([[TODAY, 5]]));
    mount({ loadHistoryOverview });
    await vi.waitFor(() =>
      expect(container.querySelector('.db-state[role="alert"]')).not.toBeNull(),
    );

    container.querySelector('.db-state button').click();
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
  });
});

describe('history page: weeks', () => {
  it('lists Monday-to-Sunday weeks with total, daily average and active days', async () => {
    mount({
      loadHistoryOverview: vi.fn(async () =>
        overview([
          ['2026-11-09', 60],
          ['2026-11-11', 120],
          ['2026-11-03', 30],
        ]),
      ),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(3));
    switchView('Weeks');
    await vi.waitFor(() => expect(rows()).toHaveLength(2));

    const [current, previous] = rows();
    expect(plain(current.querySelector('.db-history-date').textContent)).toBe('Nov 9 – Nov 15');
    expect(plain(current.querySelector('.db-time').textContent)).toBe('3h 00m');
    expect(plain(current.querySelector('.db-history-avg').textContent)).toBe(
      '1h 30m a day · 2 active days',
    );
    expect(plain(previous.querySelector('.db-history-date').textContent)).toBe('Nov 2 – Nov 8');
    expect(plain(previous.querySelector('.db-history-avg').textContent)).toContain('1 active day');
    expect(container.querySelector('.db-summary').textContent).toBe(
      'Monday to Sunday, newest first',
    );
  });

  it('marks only the week in progress', async () => {
    mount({
      loadHistoryOverview: vi.fn(async () =>
        overview([
          [TODAY, 5],
          ['2026-11-03', 5],
        ]),
      ),
    });
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    switchView('Weeks');
    await vi.waitFor(() => expect(container.querySelector('.db-history-week')).not.toBeNull());
    expect(container.querySelectorAll('.bw-chip')).toHaveLength(1);
    expect(rows()[0].querySelector('.bw-chip').textContent).toBe('This week');
  });

  it('shows 12 weeks at a time', async () => {
    const entries = Array.from({ length: 15 }, (_, i) => [shiftDateKey('2026-11-09', -7 * i), 10]);
    mount({ loadHistoryOverview: vi.fn(async () => overview(entries)) });
    await settled();
    switchView('Weeks');
    await vi.waitFor(() => expect(rows()).toHaveLength(WEEKS_PAGE_SIZE));
    container.querySelector('.db-showmore').click();
    expect(rows()).toHaveLength(15);
  });

  it('shows an empty state when there are no weeks', async () => {
    mount({ loadHistoryOverview: vi.fn(async () => overview([])) });
    await settled();
    switchView('Weeks');
    await vi.waitFor(() => expect(container.textContent).toContain('Weeks appear here'));
  });
});

describe('history page: one website', () => {
  async function openSiteView(overrides) {
    const result = mount(overrides);
    await settled();
    switchView('One website');
    await vi.waitFor(() => expect(container.textContent).toContain('Choose a website'));
    return result;
  }

  it('hides the website form and range switch outside this view', async () => {
    mount();
    await settled();
    expect(container.querySelector('.db-history-form').hidden).toBe(true);
    expect(container.querySelector('[aria-label="Time range"]').hidden).toBe(true);

    switchView('One website');
    await settled();
    expect(container.querySelector('.db-history-form').hidden).toBe(false);
    expect(container.querySelector('[aria-label="Time range"]').hidden).toBe(false);
  });

  it('asks the user to choose a website, and offers their most used ones', async () => {
    await openSiteView();
    const options = [...container.querySelectorAll('#history-site-suggestions option')];
    expect(options.map((option) => option.value)).toEqual(['github.com', 'youtube.com']);
    expect(container.querySelector('#history-site').getAttribute('list')).toBe(
      'history-site-suggestions',
    );
  });

  it('rejects an invalid address with a message and loads nothing', async () => {
    const { deps } = await openSiteView();
    deps.loadSiteHistory.mockClear();

    submitSite('notawebsite');
    const error = container.querySelector('#history-site-error');
    expect(error.textContent).toBe('That does not look like a website address.');
    expect(container.querySelector('#history-site').getAttribute('aria-invalid')).toBe('true');
    expect(deps.loadSiteHistory).not.toHaveBeenCalled();

    submitSite('   ');
    expect(error.textContent).toContain('Enter a website');
  });

  it('understands a pasted address, loads its history and shows four stats and a chart', async () => {
    const { deps } = await openSiteView();

    submitSite('https://www.YouTube.com/watch?v=abc');
    await vi.waitFor(() => expect(container.querySelector('.db-stats')).not.toBeNull());

    expect(deps.loadSiteHistory).toHaveBeenLastCalledWith('youtube.com', '30d', NOW);
    expect(container.querySelector('#history-site').value).toBe('youtube.com');
    expect(container.querySelector('#history-site-error').textContent).toBe('');

    const stat = (label) => container.querySelector(`section[aria-label="${label}"]`);
    expect(plain(stat('Total time').querySelector('.db-stat-value').textContent)).toBe('30m');
    expect(stat('Days visited').querySelector('.db-stat-value').textContent).toBe('1');
    expect(stat('Days visited').textContent).toContain('of 30 days');
    expect(plain(stat('Average per visit day').querySelector('.db-stat-value').textContent)).toBe(
      '30m',
    );
    expect(plain(stat('Busiest day').textContent)).toContain('Tue, Nov 10');
    expect(container.querySelectorAll('.db-stats > section')).toHaveLength(4);

    expect(charts).toHaveLength(1);
    expect(charts[0].config.type).toBe('line');
    expect(charts[0].config.data.datasets[0].data).toHaveLength(30);
  });

  it('opens a day when a point on the chart is clicked', async () => {
    const { deps } = await openSiteView();
    submitSite('youtube.com');
    await vi.waitFor(() => expect(charts).toHaveLength(1));

    const hit = { getElementsAtEventForMode: () => [{ index: 25 }] };
    charts[0].config.options.onClick({}, [], hit);
    expect(deps.openDay).toHaveBeenCalledWith(shiftDateKey(TODAY, 25 - 29));
  });

  it('reloads with the chosen range', async () => {
    const { deps } = await openSiteView();
    submitSite('youtube.com');
    await vi.waitFor(() => expect(container.querySelector('.db-stats')).not.toBeNull());

    [...container.querySelectorAll('[aria-label="Time range"] button')]
      .find((button) => button.textContent === '1 year')
      .click();
    await vi.waitFor(() =>
      expect(deps.loadSiteHistory).toHaveBeenLastCalledWith('youtube.com', '1y', NOW),
    );
    await vi.waitFor(() => expect(charts.at(-1).config.data.datasets[0].data).toHaveLength(365));
  });

  it('says so when the website has no time in the range, or never', async () => {
    const { deps } = await openSiteView({
      loadSiteHistory: vi.fn(async (domain, rangeId) =>
        domain === null
          ? { domain: null, rangeId, suggestions: [] }
          : siteData(domain, {}, { rangeId, visitedInLastYear: domain === 'old.com' }),
      ),
    });

    submitSite('old.com');
    await vi.waitFor(() => expect(container.textContent).toContain('No time on old.com'));
    expect(container.textContent).toContain('Try a longer range');
    expect(container.querySelector('.db-stats')).toBeNull();

    submitSite('never.com');
    await vi.waitFor(() => expect(container.textContent).toContain('No time on never.com'));
    expect(container.textContent).toContain('has not recorded any time on this website');
    expect(deps.createChart).not.toHaveBeenCalled();
  });

  it('keeps what the user typed when data refreshes in the background', async () => {
    const { deps } = await openSiteView();
    const input = container.querySelector('#history-site');
    input.value = 'half-typed.co';

    const before = deps.loadSiteHistory.mock.calls.length;
    subscribeCallback();
    await vi.waitFor(() => expect(deps.loadSiteHistory.mock.calls.length).toBeGreaterThan(before));

    expect(container.querySelector('#history-site')).toBe(input);
    expect(input.value).toBe('half-typed.co');
  });

  it('can never inject markup through the website name', async () => {
    await openSiteView({
      loadSiteHistory: vi.fn(async (domain, rangeId) =>
        domain === null
          ? { domain: null, rangeId, suggestions: ['"><img src=x onerror=alert(1)>'] }
          : siteData(domain, { '2026-11-10': 5 }, { rangeId }),
      ),
    });
    submitSite('<img src=x onerror=alert(1)>.com');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container.querySelectorAll('img[onerror]')).toHaveLength(0);
  });
});

describe('history page: lifecycle', () => {
  it('flushes before the first draw and unsubscribes on unmount', async () => {
    const { page, deps } = mount();
    await settled();
    expect(deps.requestLiveFlush).toHaveBeenCalled();
    page.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('destroys its chart on unmount', async () => {
    const { page } = mount();
    await settled();
    switchView('One website');
    await settled();
    submitSite('youtube.com');
    await vi.waitFor(() => expect(charts).toHaveLength(1));
    page.unmount();
    expect(charts[0].destroy).toHaveBeenCalled();
  });
});
