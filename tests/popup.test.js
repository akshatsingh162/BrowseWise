// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopupController } from '../src/popup/popup-controller.js';
import { renderPopup } from '../src/popup/popup-view.js';
import { buildOverview } from '../src/shared/stats.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();

function day(domainMs, hourly = {}) {
  const hourlyMs = new Array(24).fill(0);
  for (const [hour, ms] of Object.entries(hourly)) hourlyMs[Number(hour)] = ms;
  return { date: '2026-11-07', hourlyMs, domainMs };
}

const overviewOf = (domainMs, yesterday = day({})) =>
  buildOverview({ today: day(domainMs), yesterday, now: NOW });

const handlers = () => ({ onRetry: vi.fn(), onOpenDashboard: vi.fn() });
let root;

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path) => `chrome-extension://abc/${path}` },
  });
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderPopup', () => {
  it('shows a loading skeleton with a status role', () => {
    renderPopup(root, { status: 'loading' }, handlers());
    expect(root.querySelector('[role="status"]')).not.toBeNull();
    expect(root.querySelectorAll('.bw-skeleton').length).toBeGreaterThan(0);
  });

  it('shows an empty state when nothing was recorded', () => {
    renderPopup(root, { status: 'ready', overview: overviewOf({}) }, handlers());
    expect(root.textContent).toContain('No browsing time yet today');
    expect(root.querySelector('.pp-total')).toBeNull();
  });

  it('shows an error state whose retry button works', () => {
    const h = handlers();
    renderPopup(root, { status: 'error', message: 'Boom happened' }, h);
    expect(root.querySelector('[role="alert"]').textContent).toContain('Boom happened');
    root.querySelector('.bw-btn-secondary').click();
    expect(h.onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the total, site count, top site, and ranked rows', () => {
    const overview = overviewOf({ 'github.com': 90 * MIN, 'youtube.com': 30 * MIN });
    renderPopup(root, { status: 'ready', overview }, handlers());

    expect(root.querySelector('.pp-total').textContent).toBe('2h 00m');
    expect(root.textContent).toContain('github.com');
    const rows = [...root.querySelectorAll('.pp-site')];
    expect(rows.map((r) => r.querySelector('.pp-site-name').textContent)).toEqual([
      'github.com',
      'youtube.com',
    ]);
    expect(rows[0].querySelector('.pp-site-pct').textContent).toBe('75%');
    expect(rows[0].querySelector('.bw-bar-fill').getAttribute('style')).toContain('width: 75%');
  });

  it('limits the list to five sites and says how many are hidden', () => {
    const domains = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`site${i}.com`, (10 - i) * MIN]),
    );
    renderPopup(root, { status: 'ready', overview: overviewOf(domains) }, handlers());
    expect(root.querySelectorAll('.pp-site')).toHaveLength(5);
    expect(root.querySelector('.pp-more').textContent).toBe('+3 more in the dashboard');
  });

  it('wires the dashboard buttons in the header and footer', () => {
    const h = handlers();
    renderPopup(root, { status: 'ready', overview: overviewOf({ 'a.com': MIN }) }, h);
    root.querySelector('header button').click();
    root.querySelector('footer button').click();
    expect(h.onOpenDashboard).toHaveBeenCalledTimes(2);
  });

  it('never interprets a hostile domain name as HTML', () => {
    const hostile = '<img src=x onerror=alert(1)>.com';
    renderPopup(
      root,
      { status: 'ready', overview: overviewOf({ [hostile]: 5 * MIN }) },
      handlers(),
    );
    expect(root.querySelector('.pp-site-name').textContent).toBe(hostile);
    expect(root.querySelectorAll('img[onerror]')).toHaveLength(0);
  });

  it('falls back to a globe icon when a favicon fails to load', () => {
    renderPopup(root, { status: 'ready', overview: overviewOf({ 'a.com': MIN }) }, handlers());
    const img = root.querySelector('img.pp-favicon');
    img.dispatchEvent(new Event('error'));
    expect(root.querySelector('img.pp-favicon')).toBeNull();
    expect(root.querySelector('.pp-site svg')).not.toBeNull();
  });

  it('describes the comparison with yesterday neutrally', () => {
    const yesterday = day({}, { 9: 30 * MIN });
    renderPopup(
      root,
      { status: 'ready', overview: overviewOf({ 'a.com': 60 * MIN }, yesterday) },
      handlers(),
    );
    expect(root.querySelector('.pp-delta').textContent).toContain('+30m vs yesterday');
    expect(root.querySelector('.pp-delta').getAttribute('title')).toContain('100% more');
  });
});

describe('createPopupController', () => {
  function setup(overrides = {}) {
    const deps = {
      root,
      loadOverview: vi.fn(async () => overviewOf({ 'a.com': 10 * MIN })),
      requestLiveFlush: vi.fn(async () => {}),
      openDashboard: vi.fn(async () => {}),
      now: () => NOW,
      ...overrides,
    };
    return { deps, controller: createPopupController(deps) };
  }

  it('renders stored data first, then flushes and refreshes', async () => {
    const { deps, controller } = setup();
    await controller.start();

    expect(controller.getState().status).toBe('ready');
    expect(deps.requestLiveFlush).toHaveBeenCalledTimes(1);
    expect(deps.loadOverview).toHaveBeenCalledTimes(2); // before and after the flush
    expect(root.querySelector('.pp-total').textContent).toBe('10m');
  });

  it('shows an error state when loading fails, and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadOverview = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(overviewOf({ 'a.com': 5 * MIN }));
    const { controller } = setup({ loadOverview });

    await controller.start();
    expect(controller.getState().status).toBe('error');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();

    root.querySelector('.bw-btn-secondary').click();
    await vi.waitFor(() => expect(controller.getState().status).toBe('ready'));
    expect(root.querySelector('.pp-total').textContent).toBe('5m');
  });

  it('keeps showing the last good data when a silent refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadOverview = vi
      .fn()
      .mockResolvedValueOnce(overviewOf({ 'a.com': 5 * MIN }))
      .mockRejectedValue(new Error('blip'));
    const { controller } = setup({ loadOverview });

    await controller.refresh();
    await controller.refresh({ silent: true });

    expect(controller.getState().status).toBe('ready');
    expect(root.querySelector('.pp-total').textContent).toBe('5m');
  });

  it('still loads stored data if the live flush throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { controller } = setup({
      requestLiveFlush: vi.fn(async () => {
        throw new Error('worker gone');
      }),
    });
    await controller.start();
    expect(controller.getState().status).toBe('ready');
  });

  it('ignores a slow, outdated response that arrives after a newer one', async () => {
    let releaseSlow;
    const slow = new Promise((resolve) => {
      releaseSlow = () => resolve(overviewOf({ 'old.com': 1 * MIN }));
    });
    const loadOverview = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(overviewOf({ 'new.com': 9 * MIN }));
    const { controller } = setup({ loadOverview });

    const first = controller.refresh({ silent: true });
    await controller.refresh({ silent: true });
    releaseSlow();
    await first;

    expect(root.querySelector('.pp-site-name').textContent).toBe('new.com');
  });

  it('opens the dashboard and closes the popup', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const { deps, controller } = setup();
    await controller.start();

    root.querySelector('footer button').click();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(deps.openDashboard).toHaveBeenCalledTimes(1);
  });
});
