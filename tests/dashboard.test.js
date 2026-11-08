// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { segmentedControl } from '../src/dashboard/components/segmented-control.js';
import { mountComingSoonPage } from '../src/dashboard/pages/coming-soon.js';
import { mountOverviewPage } from '../src/dashboard/pages/overview.js';
import { mountWebsitesPage } from '../src/dashboard/pages/websites.js';
import { ROUTES } from '../src/dashboard/router.js';
import { createShell } from '../src/dashboard/shell.js';
import { buildOverview, rankDomains, totalMs } from '../src/shared/stats.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';
import { toLocalDateKey } from '../src/shared/time.js';
import { startDashboard } from '../src/dashboard/app.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();

function day(domainMs, hourly = {}) {
  const hourlyMs = new Array(24).fill(0);
  for (const [hour, ms] of Object.entries(hourly)) hourlyMs[Number(hour)] = ms;
  return { date: '2026-11-07', hourlyMs, domainMs };
}

function overviewData(domainMs, { yesterday = day({}), average } = {}) {
  return {
    overview: buildOverview({ today: day(domainMs), yesterday, now: NOW }),
    average: average ?? { averageMs: 0, daysCounted: 0 },
  };
}

function websiteData(domainMs, { rangeId = 'today', dayCount = 1 } = {}) {
  const merged = day(domainMs);
  return {
    rangeId,
    ranked: rankDomains(merged),
    totalMs: totalMs(merged),
    dayCount,
    daysWithData: Object.keys(domainMs).length > 0 ? 1 : 0,
  };
}

let container;
const unsubscribe = vi.fn();
const liveDeps = () => ({
  requestLiveFlush: vi.fn(async () => true),
  subscribe: vi.fn(() => unsubscribe),
  now: () => NOW,
});

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
  unsubscribe.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shell', () => {
  it('renders every page in the navigation as a link to its route', () => {
    createShell(container);
    const links = [...container.querySelectorAll('nav a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROUTES.map((r) => `#${r.id}`));
    expect(links.map((link) => link.textContent)).toEqual(ROUTES.map((r) => r.label));
    expect(container.querySelectorAll('main')).toHaveLength(1);
  });

  it('marks exactly the active page with aria-current', () => {
    const shell = createShell(container);
    shell.setActive('websites');
    shell.setActive('goals');

    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('href')).toBe('#goals');
  });
});

describe('segmentedControl', () => {
  it('reflects the selection with aria-pressed and reports changes', () => {
    const onChange = vi.fn();
    const control = segmentedControl({
      label: 'Time range',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      value: 'a',
      onChange,
    });
    container.append(control);
    const [a, b] = control.querySelectorAll('button');

    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('aria-pressed')).toBe('false');

    b.click();
    expect(onChange).toHaveBeenCalledWith('b');
    expect(a.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(control.getAttribute('role')).toBe('group');
  });
});

describe('overview page', () => {
  async function mount(data) {
    const deps = { ...liveDeps(), loadOverviewData: vi.fn(async () => data) };
    const page = mountOverviewPage(container, deps);
    await vi.waitFor(() => expect(container.querySelector('.db-stats')).not.toBeNull());
    return { page, deps };
  }

  it('shows the four headline stats with correct values', async () => {
    const yesterday = day({}, { 9: 30 * MIN });
    const data = overviewData(
      { 'github.com': 90 * MIN, 'youtube.com': 30 * MIN },
      { yesterday, average: { averageMs: 150 * MIN, daysCounted: 3 } },
    );
    await mount(data);

    const stat = (label) => container.querySelector(`section[aria-label="${label}"]`);
    expect(stat('Screen time today').querySelector('.db-stat-value').textContent).toBe('2h 00m');
    expect(stat('Screen time today').textContent).toContain('+1h 30m vs yesterday');
    expect(stat('Websites visited').querySelector('.db-stat-value').textContent).toBe('2');
    expect(stat('Most used').textContent).toContain('github.com');
    expect(stat('Most used').textContent).toContain('1h 30m \u00b7 75% of today');
    expect(stat('Daily average').querySelector('.db-stat-value').textContent).toBe('2h 30m');
    expect(stat('Daily average').textContent).toContain('3 earlier days');
  });

  it('lists top websites and links to the full page', async () => {
    await mount(overviewData({ 'a.com': 3 * MIN, 'b.com': 2 * MIN }));
    const rows = [...container.querySelectorAll('.db-usage-row')];
    expect(rows.map((row) => row.querySelector('.db-site-name').textContent)).toEqual([
      'a.com',
      'b.com',
    ]);
    expect(container.querySelector('a[href="#websites"]')).not.toBeNull();
  });

  it('limits the list to eight and says how many are hidden', async () => {
    const domains = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`site${i}.com`, (20 - i) * MIN]),
    );
    await mount(overviewData(domains));
    expect(container.querySelectorAll('.db-usage-row')).toHaveLength(8);
    expect(container.querySelector('.db-more').textContent).toBe('+3 more on the Websites page');
  });

  it('shows sensible empty values when nothing is recorded', async () => {
    await mount(overviewData({}));
    expect(container.textContent).toContain('No browsing time yet today');
    expect(container.querySelector('section[aria-label="Most used"]').textContent).toContain(
      'Nothing recorded yet',
    );
    expect(container.querySelector('section[aria-label="Daily average"]').textContent).toContain(
      'No earlier days recorded yet',
    );
  });

  it('shows an error state when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = {
      ...liveDeps(),
      loadOverviewData: vi.fn(async () => {
        throw new Error('storage down');
      }),
    };
    mountOverviewPage(container, deps);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
  });

  it('unsubscribes from live updates when unmounted', async () => {
    const { page } = await mount(overviewData({ 'a.com': MIN }));
    page.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('websites page', () => {
  const sample = { 'github.com': 60 * MIN, 'youtube.com': 30 * MIN, 'wikipedia.org': 10 * MIN };

  async function mount(loadWebsiteUsage) {
    const deps = { ...liveDeps(), loadWebsiteUsage };
    mountWebsitesPage(container, deps);
    await vi.waitFor(() => expect(container.querySelector('.db-results > *')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('.db-loading')).toBeNull());
    return deps;
  }

  const names = () =>
    [...container.querySelectorAll('.db-site-name')].map((node) => node.textContent);
  const type = (value) => {
    const input = container.querySelector('input[type="search"]');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('shows a ranked table with rank numbers, times, and shares', async () => {
    await mount(vi.fn(async () => websiteData(sample)));
    expect(names()).toEqual(['github.com', 'youtube.com', 'wikipedia.org']);
    expect([...container.querySelectorAll('.db-rank')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(container.querySelector('.db-time').textContent).toBe('1h 00m');
    expect(container.querySelector('.db-pct').textContent).toBe('60%');
    expect(container.querySelector('.db-summary').textContent).toBe(
      '3 websites \u00b7 1h 40m total',
    );
  });

  it('filters by name while keeping the original rank numbers', async () => {
    await mount(vi.fn(async () => websiteData(sample)));
    type('WIKI');
    expect(names()).toEqual(['wikipedia.org']);
    expect(container.querySelector('.db-rank').textContent).toBe('3');
    expect(container.querySelector('.db-summary').textContent).toContain('1 of 3 websites');
  });

  it('shows a no-match state, and the search text can never inject HTML', async () => {
    await mount(vi.fn(async () => websiteData(sample)));
    type('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('No websites match');
    expect(container.querySelectorAll('img[onerror]')).toHaveLength(0);

    type('');
    expect(names()).toHaveLength(3);
  });

  it('keeps the search box and its text when data refreshes', async () => {
    const deps = await mount(vi.fn(async () => websiteData(sample)));
    type('git');
    const input = container.querySelector('input[type="search"]');

    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());
    deps.subscribe.mock.calls[0][0](); // simulate a live usage change
    await vi.waitFor(() => expect(deps.loadWebsiteUsage.mock.calls.length).toBeGreaterThan(2));

    expect(container.querySelector('input[type="search"]')).toBe(input);
    expect(input.value).toBe('git');
    expect(names()).toEqual(['github.com']);
  });

  it('loads the chosen time range and shows a multi-day summary', async () => {
    const load = vi.fn(async (rangeId) =>
      rangeId === '7d'
        ? websiteData(sample, { rangeId: '7d', dayCount: 7 })
        : websiteData({ 'a.com': MIN }),
    );
    await mount(load);

    const sevenDays = [...container.querySelectorAll('.bw-segmented-btn')].find(
      (button) => button.textContent === '7 days',
    );
    sevenDays.click();

    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('7d', NOW));
    await vi.waitFor(() => expect(names()).toHaveLength(3));
    expect(container.querySelector('.db-summary').textContent).toContain('across 1 of 7 days');
    expect(sevenDays.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a period-specific empty state', async () => {
    await mount(vi.fn(async () => websiteData({}, { rangeId: '30d', dayCount: 30 })));
    expect(container.textContent).toContain('No browsing time recorded');
    expect(container.textContent).toContain('in the last 30 days');
  });
});

describe('coming-soon pages', () => {
  it('render a heading and an honest placeholder', () => {
    const page = mountComingSoonPage(container, {
      title: 'Goals & limits',
      description: 'desc',
      iconName: 'target',
      text: 'Will appear here.',
    });
    expect(container.querySelector('h1').textContent).toBe('Goals & limits');
    expect(container.textContent).toContain('Coming soon');
    expect(() => page.unmount()).not.toThrow();
  });
});

describe('startDashboard (smoke test with the real wiring)', () => {
  let dashboard;

  async function boot(hash) {
    const { chrome: mock } = createBrowserMock();
    const listeners = new Set();
    Object.assign(mock, {
      runtime: {
        getURL: (path) => `chrome-extension://abc/${path}`,
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
    });
    mock.storage.onChanged = {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    };
    vi.stubGlobal('chrome', mock);

    await addUsage('github.com', [{ dateKey: toLocalDateKey(Date.now()), hour: 9, ms: 5 * MIN }]);
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = hash;
    dashboard = startDashboard(document.getElementById('app'));
  }

  afterEach(() => {
    dashboard?.stop();
    dashboard = undefined;
    window.location.hash = '';
  });

  it('renders the page for the current hash and switches pages on navigation', async () => {
    await boot('#websites');

    expect(document.querySelector('h1').textContent).toBe('Websites');
    expect(document.title).toBe('Websites \u00b7 BrowseWise');
    expect(document.querySelector('[aria-current="page"]').getAttribute('href')).toBe('#websites');
    await vi.waitFor(() =>
      expect(document.querySelector('.db-site-name')?.textContent).toBe('github.com'),
    );

    window.location.hash = '#goals';
    await vi.waitFor(() => expect(document.querySelector('h1').textContent).toBe('Goals & limits'));
    expect(document.querySelector('[aria-current="page"]').getAttribute('href')).toBe('#goals');
    expect(document.querySelector('.db-toolbar')).toBeNull();
  });

  it('falls back to the overview for an unknown hash', async () => {
    await boot('#not-a-page');
    expect(document.querySelector('h1').textContent).toBe('Overview');
    await vi.waitFor(() =>
      expect(document.querySelector('.db-stat-value')?.textContent).toBe('5m'),
    );
  });

  it('stop() ends routing', async () => {
    await boot('#overview');
    dashboard.stop();
    window.location.hash = '#settings';
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('h1').textContent).toBe('Overview');
  });
});
