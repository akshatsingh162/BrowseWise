import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { shiftDateKey } from '../src/shared/dates.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';
import { LATEST_SCHEMA_VERSION } from '../src/shared/storage/migrations.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';
import { toLocalDateKey } from '../src/shared/time.js';

const MIN = 60_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (date, ms = MIN) => ({
  date,
  hourlyMs: new Array(24).fill(0),
  domainMs: { 'github.com': ms },
});

/** Loads the real service worker against a fake Chrome that records its listeners. */
async function loadWorker(initialStorage = {}) {
  const { chrome, browser } = createBrowserMock(initialStorage);
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });

  Object.assign(chrome, {
    runtime: {
      id: 'self',
      getURL: (path) => `chrome-extension://abc/${path}`,
      onInstalled: event('onInstalled'),
      onStartup: event('onStartup'),
      onMessage: event('onMessage'),
    },
    tabs: {
      ...chrome.tabs,
      onActivated: event('tabsActivated'),
      onUpdated: event('tabsUpdated'),
      onRemoved: event('tabsRemoved'),
      onReplaced: event('tabsReplaced'),
    },
    windows: { ...chrome.windows, onFocusChanged: event('focus') },
    idle: { ...chrome.idle, onStateChanged: event('idle') },
    alarms: {
      onAlarm: event('alarm'),
      get: vi.fn(async () => ({ name: 'browsewise-heartbeat' })),
      create: vi.fn(async () => {}),
    },
  });
  chrome.storage.onChanged = event('storageChanged');

  vi.stubGlobal('chrome', chrome);
  vi.resetModules();
  await import('../src/background/service-worker.js');
  // Nothing should be credited unless a test wants it: park the browser on an ignored page.
  browser.tab = { url: 'chrome://extensions', audible: false, incognito: false };
  return { chrome, listeners, browser };
}

/** Sends a message the way a dashboard page would and resolves with the worker's answer. */
function send(listeners, message, sender = { id: 'self' }) {
  return new Promise((resolve) => {
    const keepOpen = listeners.onMessage(message, sender, resolve);
    if (keepOpen === false) setTimeout(() => resolve('no-async-response'), 50);
  });
}

const erase = (listeners, scope) => send(listeners, { type: MESSAGE_TYPES.ERASE_DATA, scope });
const stored = (chrome) => chrome.storage.local.get(null);
const usageKeys = (data) => Object.keys(data).filter((key) => key.startsWith('usage:'));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ERASE_DATA: history', () => {
  it('removes the recorded days, answers ok, and keeps settings, goals and categories', async () => {
    const { chrome, listeners } = await loadWorker({
      settings: { ...DEFAULT_SETTINGS, idleThresholdSeconds: 300 },
      'usage:2026-11-05': day('2026-11-05'),
      'usage:2026-11-06': day('2026-11-06'),
      goals: { dailyGoalMs: 3_600_000, siteLimits: {} },
      categoryOverrides: { 'a.com': 'news' },
    });

    expect(await erase(listeners, 'history')).toEqual({ ok: true });

    const data = await stored(chrome);
    expect(usageKeys(data)).toEqual([]);
    expect(data.settings.idleThresholdSeconds).toBe(300);
    expect(data.goals.dailyGoalMs).toBe(3_600_000);
    expect(data.categoryOverrides).toEqual({ 'a.com': 'news' });
  });

  it('erases the not-yet-saved interval too, so it cannot reappear afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date(2026, 10, 7, 12, 0, 0).getTime();
    vi.setSystemTime(start);
    const { chrome, listeners, browser } = await loadWorker();

    browser.tab = { url: 'https://github.com/', audible: false, incognito: false };
    await send(listeners, { type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }); // tracking starts here

    vi.setSystemTime(start + 20_000); // 20 seconds pass, not yet saved
    await erase(listeners, 'history');
    expect(usageKeys(await stored(chrome))).toEqual([]);

    vi.setSystemTime(start + 30_000);
    await send(listeners, { type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT });

    // Only the 10 seconds after the erase are credited, not the 30 since tracking began.
    const data = await stored(chrome);
    expect(data['usage:2026-11-07'].domainMs['github.com']).toBe(10_000);
  });
});

describe('ERASE_DATA: everything', () => {
  const seeded = () => ({
    settings: { ...DEFAULT_SETTINGS, idleThresholdSeconds: 300, trackLocalHosts: false },
    'usage:2026-11-05': day('2026-11-05'),
    goals: { dailyGoalMs: 3_600_000, siteLimits: {} },
    categoryOverrides: { 'a.com': 'news' },
    limitNotices: { dateKey: '2026-11-05', goal: true, domains: [] },
    maintenance: { lastRunDate: '2026-11-05' },
  });

  it('clears everything, restores the defaults and applies them to the worker', async () => {
    const { chrome, listeners } = await loadWorker(seeded());
    chrome.idle.setDetectionInterval.mockClear();

    expect(await erase(listeners, 'everything')).toEqual({ ok: true });

    const data = await stored(chrome);
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(data.meta).toEqual({ schemaVersion: LATEST_SCHEMA_VERSION });
    for (const key of ['goals', 'categoryOverrides', 'limitNotices', 'maintenance']) {
      expect(data[key]).toBeUndefined();
    }
    expect(usageKeys(data)).toEqual([]);
    expect(chrome.idle.setDetectionInterval).toHaveBeenLastCalledWith(
      DEFAULT_SETTINGS.idleThresholdSeconds,
    );
  });

  it('starts tracking again afterwards', async () => {
    const { chrome, listeners, browser } = await loadWorker(seeded());
    browser.tab = { url: 'https://github.com/', audible: false, incognito: false };
    await erase(listeners, 'everything');

    // Tracking state was written fresh by the worker after the erase.
    expect((await stored(chrome))['tracker:state']).toMatchObject({ activeDomain: 'github.com' });
  });
});

describe('ERASE_DATA: handled inside the worker queue', () => {
  it('waits for tracking that is already running before it erases', async () => {
    const { chrome, listeners } = await loadWorker({ 'usage:2026-11-05': day('2026-11-05') });

    // Only the first tracking read is slow, so an erase that skipped the queue would
    // get ahead of it and remove data while that tracking task is still running.
    let reads = 0;
    let slowTrackingFinished = false;
    chrome.windows.getLastFocused = async () => {
      reads += 1;
      if (reads === 1) {
        await delay(80);
        slowTrackingFinished = true;
      }
      return { id: 1, focused: true };
    };

    let finishedWhenDataWasRemoved = null;
    const remove = chrome.storage.local.remove;
    chrome.storage.local.remove = vi.fn(async (...args) => {
      finishedWhenDataWasRemoved = slowTrackingFinished;
      return remove(...args);
    });

    listeners.focus(); // a tracking event starts and takes a while
    await delay(10); // let it begin its slow read before the erase request arrives
    expect(await erase(listeners, 'history')).toEqual({ ok: true });

    expect(finishedWhenDataWasRemoved).toBe(true);
    expect(usageKeys(await stored(chrome))).toEqual([]);
  });

  it('keeps the queue working when an erase fails, and reports the failure', async () => {
    const { chrome, listeners } = await loadWorker({ 'usage:2026-11-05': day('2026-11-05') });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = chrome.storage.local.clear;
    chrome.storage.local.clear = vi.fn(async () => {
      throw new Error('storage unavailable');
    });

    const answer = await erase(listeners, 'everything');
    expect(answer).toEqual({ ok: false, error: 'storage unavailable' });
    expect(errorLog).toHaveBeenCalled();

    chrome.storage.local.clear = original;
    expect(await send(listeners, { type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT })).toEqual({ ok: true });
  });

  it('rejects an invalid scope without erasing or waiting', async () => {
    const { chrome, listeners } = await loadWorker({ 'usage:2026-11-05': day('2026-11-05') });
    const sendResponse = vi.fn();

    const keepOpen = listeners.onMessage(
      { type: MESSAGE_TYPES.ERASE_DATA, scope: 'everyting' },
      { id: 'self' },
      sendResponse,
    );

    expect(keepOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Unknown erase scope.' });
    expect(usageKeys(await stored(chrome))).toEqual(['usage:2026-11-05']);
  });

  it('ignores a request that does not come from this extension', async () => {
    const { chrome, listeners } = await loadWorker({ 'usage:2026-11-05': day('2026-11-05') });
    const sendResponse = vi.fn();

    expect(
      listeners.onMessage(
        { type: MESSAGE_TYPES.ERASE_DATA, scope: 'everything' },
        { id: 'someone-else' },
        sendResponse,
      ),
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(usageKeys(await stored(chrome))).toEqual(['usage:2026-11-05']);
  });
});

describe('maintenance in the worker', () => {
  const todayKey = () => toLocalDateKey(Date.now());
  const heartbeat = (listeners) => listeners.alarm({ name: 'browsewise-heartbeat' });

  it('removes days past the retention on a heartbeat', async () => {
    const old = shiftDateKey(todayKey(), -100);
    const { chrome, listeners } = await loadWorker({
      settings: { ...DEFAULT_SETTINGS, retentionDays: 30 },
      [`usage:${old}`]: day(old),
      [`usage:${todayKey()}`]: day(todayKey()),
    });

    heartbeat(listeners);
    await vi.waitFor(async () =>
      expect(usageKeys(await stored(chrome))).toEqual([`usage:${todayKey()}`]),
    );
    expect((await stored(chrome)).maintenance).toEqual({ lastRunDate: todayKey() });
  });

  it('runs at most once a day, but straight away when settings change', async () => {
    const old = shiftDateKey(todayKey(), -100);
    const { chrome, listeners } = await loadWorker({
      settings: { ...DEFAULT_SETTINGS, retentionDays: 365 },
      [`usage:${old}`]: day(old),
    });

    heartbeat(listeners);
    await vi.waitFor(async () => expect((await stored(chrome)).maintenance).toBeDefined());
    expect(usageKeys(await stored(chrome))).toEqual([`usage:${old}`]); // within a year: kept

    // A shorter retention is saved. The same day's second heartbeat would not prune...
    await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS, retentionDays: 30 } });
    heartbeat(listeners);
    await delay(60);
    expect(usageKeys(await stored(chrome))).toEqual([`usage:${old}`]);

    // ...but the settings change does.
    listeners.storageChanged({ settings: { newValue: {} } }, 'local');
    await vi.waitFor(async () => expect(usageKeys(await stored(chrome))).toEqual([]));
  });

  it('never stops tracking when housekeeping fails', async () => {
    const old = shiftDateKey(todayKey(), -100);
    const { chrome, listeners, browser } = await loadWorker({
      settings: { ...DEFAULT_SETTINGS, retentionDays: 30 },
      [`usage:${old}`]: day(old),
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    chrome.storage.local.remove = vi.fn(async () => {
      throw new Error('boom');
    });
    browser.tab = { url: 'https://github.com/', audible: false, incognito: false };

    heartbeat(listeners);
    await vi.waitFor(() =>
      expect(errorLog.mock.calls.some(([text]) => String(text).includes('maintenance'))).toBe(true),
    );
    expect((await stored(chrome))['tracker:state']).toMatchObject({ activeDomain: 'github.com' });
  });
});
