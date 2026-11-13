import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasNotificationsPermission,
  removeNotificationsPermission,
  requestNotificationsPermission,
} from '../src/shared/notifications-permission.js';
import {
  NOTIFICATION_PREFIX,
  showLimitNotification,
  showTestNotification,
} from '../src/shared/notifier.js';

const MIN = 60_000;
let chromeMock;

function setup({ granted = true, withApi = true } = {}) {
  chromeMock = {
    runtime: { getURL: (path) => `chrome-extension://abc/${path}` },
    permissions: {
      contains: vi.fn(async () => granted),
      request: vi.fn(async () => granted),
      remove: vi.fn(async () => true),
    },
  };
  if (withApi) chromeMock.notifications = { create: vi.fn(async () => 'id') };
  vi.stubGlobal('chrome', chromeMock);
}

beforeEach(() => setup());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('notifications permission helpers', () => {
  it('asks only for the notifications permission', async () => {
    await hasNotificationsPermission();
    await requestNotificationsPermission();
    await removeNotificationsPermission();
    const wanted = { permissions: ['notifications'] };
    expect(chromeMock.permissions.contains).toHaveBeenCalledWith(wanted);
    expect(chromeMock.permissions.request).toHaveBeenCalledWith(wanted);
    expect(chromeMock.permissions.remove).toHaveBeenCalledWith(wanted);
  });

  it('report what Chrome says', async () => {
    setup({ granted: false });
    expect(await hasNotificationsPermission()).toBe(false);
    expect(await requestNotificationsPermission()).toBe(false);
  });

  it('never throw: failures read as "not granted"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chromeMock.permissions.contains.mockRejectedValue(new Error('boom'));
    chromeMock.permissions.request.mockRejectedValue(new Error('no gesture'));
    chromeMock.permissions.remove.mockRejectedValue(new Error('boom'));
    expect(await hasNotificationsPermission()).toBe(false);
    expect(await requestNotificationsPermission()).toBe(false);
    expect(await removeNotificationsPermission()).toBe(false);
  });
});

describe('showLimitNotification', () => {
  const goal = { type: 'goal', usedMs: 125 * MIN, limitMs: 120 * MIN };
  const site = { type: 'site', domain: 'youtube.com', usedMs: 31 * MIN, limitMs: 30 * MIN };

  it('shows a basic notification with the logo, title and message', async () => {
    expect(await showLimitNotification(goal, '2026-11-07')).toBe(true);
    expect(chromeMock.notifications.create).toHaveBeenCalledWith(
      `${NOTIFICATION_PREFIX}goal-2026-11-07`,
      {
        type: 'basic',
        iconUrl: 'chrome-extension://abc/icons/icon-128.png',
        title: 'Daily goal reached',
        message: 'You have spent 2h 05m browsing today. Your goal was 2h 00m.',
      },
    );
  });

  it('gives each website its own id, per day, so notifications do not replace each other', async () => {
    await showLimitNotification(site, '2026-11-07');
    await showLimitNotification({ ...site, domain: 'reddit.com' }, '2026-11-07');
    await showLimitNotification(site, '2026-11-08');
    const ids = chromeMock.notifications.create.mock.calls.map((call) => call[0]);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.startsWith(NOTIFICATION_PREFIX))).toBe(true);
  });

  it('does nothing without the permission', async () => {
    setup({ granted: false });
    expect(await showLimitNotification(goal, '2026-11-07')).toBe(false);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
  });

  it('does not crash when the notifications API does not exist yet', async () => {
    setup({ granted: true, withApi: false });
    expect(await showLimitNotification(goal, '2026-11-07')).toBe(false);
  });

  it('reports failure instead of throwing when Chrome refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chromeMock.notifications.create.mockRejectedValue(new Error('blocked'));
    expect(await showLimitNotification(goal, '2026-11-07')).toBe(false);
  });
});

describe('showTestNotification', () => {
  it('shows a harmless test message', async () => {
    expect(await showTestNotification()).toBe(true);
    const [id, options] = chromeMock.notifications.create.mock.calls[0];
    expect(id).toBe(`${NOTIFICATION_PREFIX}test`);
    expect(options.title).toBe('Notifications are working');
  });

  it('reports false when notifications cannot be shown', async () => {
    setup({ granted: false });
    expect(await showTestNotification()).toBe(false);
  });
});
