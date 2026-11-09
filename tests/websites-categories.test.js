// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountWebsitesPage } from '../src/dashboard/pages/websites.js';
import { rankDomains } from '../src/shared/stats.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const sample = { 'github.com': 60 * MIN, 'youtube.com': 30 * MIN, 'reddit.com': 10 * MIN };

function usage(overrides = {}) {
  const ranked = rankDomains({ domainMs: sample });
  return {
    rangeId: 'today',
    ranked,
    totalMs: ranked.reduce((sum, site) => sum + site.ms, 0),
    dayCount: 1,
    daysWithData: 1,
    overrides,
  };
}

let container;
let subscribeCallback;

function mount({ loadWebsiteUsage, setCategoryOverride } = {}) {
  const deps = {
    loadWebsiteUsage: loadWebsiteUsage ?? vi.fn(async () => usage()),
    setCategoryOverride: setCategoryOverride ?? vi.fn(async () => ({})),
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return () => {};
    }),
    now: () => NOW,
  };
  const page = mountWebsitesPage(container, deps);
  return { page, deps };
}

const ready = () =>
  vi.waitFor(() => expect(container.querySelector('.db-usage-row')).not.toBeNull());
const selectFor = (domain) =>
  [...container.querySelectorAll('select[data-domain]')].find((s) => s.dataset.domain === domain);
const choose = (domain, value) => {
  const select = selectFor(domain);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const status = () => container.querySelector('.db-status').textContent;

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('websites page: category column', () => {
  it('shows each website\u2019s automatic category in a dropdown', async () => {
    mount();
    await ready();
    expect(selectFor('github.com').value).toBe('development');
    expect(selectFor('youtube.com').value).toBe('entertainment');
    expect(selectFor('reddit.com').value).toBe('social');
    expect(container.querySelector('.db-cat-dot')).toBeNull();
    expect(container.textContent).toContain('describe the website, not what you were doing');
  });

  it('applies the user\u2019s saved choices and marks them', async () => {
    mount({ loadWebsiteUsage: vi.fn(async () => usage({ 'youtube.com': 'education' })) });
    await ready();
    expect(selectFor('youtube.com').value).toBe('education');
    expect(selectFor('youtube.com').parentElement.querySelector('.db-cat-dot')).not.toBeNull();
    expect(selectFor('github.com').parentElement.querySelector('.db-cat-dot')).toBeNull();
  });
});

describe('websites page: changing a category', () => {
  it('saves the choice, shows it immediately, confirms it, and keeps keyboard focus', async () => {
    const { deps } = mount();
    await ready();

    choose('youtube.com', 'education');

    expect(deps.setCategoryOverride).toHaveBeenCalledWith('youtube.com', 'education');
    expect(selectFor('youtube.com').value).toBe('education');
    expect(selectFor('youtube.com').parentElement.querySelector('.db-cat-dot')).not.toBeNull();
    expect(document.activeElement).toBe(selectFor('youtube.com'));
    await vi.waitFor(() => expect(status()).toBe('Category saved for youtube.com.'));
  });

  it('removes the override when the automatic category is chosen again', async () => {
    const { deps } = mount({
      loadWebsiteUsage: vi.fn(async () => usage({ 'youtube.com': 'education' })),
    });
    await ready();

    choose('youtube.com', 'entertainment');

    expect(deps.setCategoryOverride).toHaveBeenCalledWith('youtube.com', null);
    expect(selectFor('youtube.com').parentElement.querySelector('.db-cat-dot')).toBeNull();
    await vi.waitFor(() => expect(status()).toBe('youtube.com reset to automatic.'));
  });

  it('resets through the "Reset to automatic" option', async () => {
    const { deps } = mount({
      loadWebsiteUsage: vi.fn(async () => usage({ 'github.com': 'shopping' })),
    });
    await ready();

    choose('github.com', '__automatic__');

    expect(deps.setCategoryOverride).toHaveBeenCalledWith('github.com', null);
    expect(selectFor('github.com').value).toBe('development');
  });

  it('rolls the change back and says so when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount({ setCategoryOverride: vi.fn(async () => Promise.reject(new Error('disk full'))) });
    await ready();

    choose('youtube.com', 'education');

    await vi.waitFor(() => expect(status()).toBe('Could not save the category. Please try again.'));
    expect(selectFor('youtube.com').value).toBe('entertainment');
    expect(selectFor('youtube.com').parentElement.querySelector('.db-cat-dot')).toBeNull();
  });

  it('is not undone by a data refresh that started before the save finished', async () => {
    let finishSave;
    const setCategoryOverride = vi.fn(() => new Promise((resolve) => (finishSave = resolve)));
    const { deps } = mount({ setCategoryOverride });
    await ready();
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());

    choose('youtube.com', 'education');
    subscribeCallback(); // a refresh runs now and still reads the OLD saved overrides
    await vi.waitFor(() => expect(deps.loadWebsiteUsage.mock.calls.length).toBeGreaterThan(2));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(selectFor('youtube.com').value).toBe('education');
    finishSave({});
  });
});

describe('websites page: category filter', () => {
  const filter = () => container.querySelector('select[aria-label="Filter by category"]');
  const pick = (value) => {
    filter().value = value;
    filter().dispatchEvent(new Event('change', { bubbles: true }));
  };
  const names = () => [...container.querySelectorAll('.db-site-name')].map((n) => n.textContent);

  it('offers all categories and narrows the list', async () => {
    mount();
    await ready();
    expect([...filter().options].map((o) => o.textContent)).toEqual([
      'All categories',
      'Education',
      'Social Media',
      'Entertainment',
      'Development & Programming',
      'Productivity',
      'Shopping',
      'News',
      'Communication',
      'Other',
    ]);

    pick('development');
    expect(names()).toEqual(['github.com']);
    expect(container.querySelector('.db-summary').textContent).toContain('1 of 3 websites');
    expect(container.querySelector('.db-rank').textContent).toBe('1');

    pick('');
    expect(names()).toHaveLength(3);
  });

  it('follows a changed category', async () => {
    mount();
    await ready();
    pick('education');
    expect(container.textContent).toContain('No websites match');

    pick('');
    choose('youtube.com', 'education');
    pick('education');
    expect(names()).toEqual(['youtube.com']);
  });

  it('combines with the text search', async () => {
    mount();
    await ready();
    pick('development');
    const search = container.querySelector('input[type="search"]');
    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.textContent).toContain('No websites match');
    expect(container.textContent).toContain('Nothing matches the current filters');
  });
});
