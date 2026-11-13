import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';
import { setDailyGoal } from '../src/shared/storage/goals-repo.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';
import { toLocalDateKey } from '../src/shared/time.js';

const MIN = 60_000;

/** Loads the real service worker against a fake Chrome that records its listeners. */
async function loadWorker({
  withNotifications = false,
  permission = true,
  notificationsEnabled = true,
} = {}) {
  const { chrome, browser } = createBrowserMock({ settings: { notificationsEnabled } });
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  const trackingQuery = chrome.tabs.query;

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
      // Tracking queries by window; opening the dashboard lists every tab.
      query: vi.fn(async (q) => (q.windowId === undefined ? [] : trackingQuery(q))),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      onActivated: event('tabsActivated'),
      onUpdated: event('tabsUpdated'),
      onRemoved: event('tabsRemoved'),
      onReplaced: event('tabsReplaced'),
    },
    windows: { ...chrome.windows, update: vi.fn(async () => ({})), onFocusChanged: event('focus') },
    idle: { ...chrome.idle, onStateChanged: event('idle') },
    alarms: {
      onAlarm: event('alarm'),
      get: vi.fn(async () => ({ name: 'browsewise-heartbeat' })),
      create: vi.fn(async () => {}),
    },
    permissions: { contains: vi.fn(async () => permission), onAdded: event('permissionsAdded') },
  });
  chrome.storage.onChanged = event('storageChanged');
  if (withNotifications) {
    chrome.notifications = {
      create: vi.fn(async () => 'id'),
      clear: vi.fn(),
      onClicked: event('notificationClicked'),
    };
  }

  vi.stubGlobal('chrome', chrome);
  vi.resetModules();
  await import('../src/background/service-worker.js');
  // Nothing should be credited by these tests: park the browser on a page we ignore.
  browser.tab = { url: 'chrome://extensions', audible: false, incognito: false };
  return { chrome, listeners, browser };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const snapshot = (listeners) => {
  const sendResponse = vi.fn();
  listeners.onMessage({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }, { id: 'self' }, sendResponse);
  return sendResponse;
};

describe('notification handling without the optional permission', () => {
  it('loads and works when chrome.notifications does not exist yet', async () => {
    const { listeners } = await loadWorker({ withNotifications: false });
    expect(listeners.notificationClicked).toBeUndefined();
    expect(typeof listeners.onMessage).toBe('function');
    expect(typeof listeners.permissionsAdded).toBe('function');
  });

  it('starts handling clicks as soon as the permission is granted', async () => {
    const { chrome, listeners } = await loadWorker({ withNotifications: false });
    expect(listeners.notificationClicked).toBeUndefined();

    chrome.notifications = {
      create: vi.fn(),
      clear: vi.fn(),
      onClicked: { addListener: (fn) => (listeners.notificationClicked = fn) },
    };
    listeners.permissionsAdded();

    expect(typeof listeners.notificationClicked).toBe('function');
  });
});

describe('notification clicks', () => {
  it('opens the Goals page and clears the notification', async () => {
    const { chrome, listeners } = await loadWorker({ withNotifications: true });
    listeners.notificationClicked('browsewise-goal-2026-11-07');

    expect(chrome.notifications.clear).toHaveBeenCalledWith('browsewise-goal-2026-11-07');
    await vi.waitFor(() =>
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://abc/src/dashboard/dashboard.html#goals',
      }),
    );
  });

  it('ignores notifications that are not ours', async () => {
    const { chrome, listeners } = await loadWorker({ withNotifications: true });
    listeners.notificationClicked('someone-elses-notification');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chrome.notifications.clear).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe('limit checks after tracking', () => {
  async function overLimitSetup(options) {
    const worker = await loadWorker({ withNotifications: true, ...options });
    // Set the goal first (usage is 0), then spend time past it.
    await setDailyGoal(5 * MIN);
    await addUsage('github.com', [{ dateKey: toLocalDateKey(Date.now()), hour: 9, ms: 10 * MIN }]);
    return worker;
  }

  it('notifies when the goal is reached, after a live snapshot', async () => {
    const { chrome, listeners } = await overLimitSetup();
    const sendResponse = snapshot(listeners);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    await vi.waitFor(() => expect(chrome.notifications.create).toHaveBeenCalledTimes(1));
    expect(chrome.notifications.create.mock.calls[0][1].title).toBe('Daily goal reached');
  });

  it('notifies only once however many checks run', async () => {
    const { chrome, listeners } = await overLimitSetup();
    for (let i = 0; i < 3; i += 1) {
      const sendResponse = snapshot(listeners);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    }
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('stays silent when notifications are turned off', async () => {
    const { chrome, listeners } = await overLimitSetup({ notificationsEnabled: false });
    const sendResponse = snapshot(listeners);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('stays silent when the permission is missing, and keeps tracking', async () => {
    const { chrome, listeners } = await overLimitSetup({ permission: false });
    const sendResponse = snapshot(listeners);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});

describe('background task failures', () => {
  it('keeps later tasks running after one fails, and logs an interruption quietly', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, listeners } = await loadWorker({ withNotifications: false });

    // The next storage read fails the way Chrome does when it stops the worker.
    const original = chrome.storage.local.get;
    let first = true;
    chrome.storage.local.get = vi.fn(async (...args) => {
      if (first) {
        first = false;
        throw new Error('No SW');
      }
      return original(...args);
    });

    listeners.focus();
    const sendResponse = snapshot(listeners);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('windows.onFocusChanged interrupted (No SW)'),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('reports a genuine failure as an error with the reason', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, listeners } = await loadWorker({ withNotifications: false });

    const original = chrome.storage.local.get;
    let first = true;
    chrome.storage.local.get = vi.fn(async (...args) => {
      if (first) {
        first = false;
        throw new Error('quota exceeded');
      }
      return original(...args);
    });

    listeners.focus();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        '[BrowseWise] windows.onFocusChanged failed: quota exceeded',
        expect.any(Error),
      ),
    );
  });
});
