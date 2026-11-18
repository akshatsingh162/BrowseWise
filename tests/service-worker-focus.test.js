import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { FOCUS_ALARM } from '../src/background/focus.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';

const MIN = 60_000;
const at = (month, dayOfMonth, hour = 12, minute = 0) =>
  new Date(2026, month - 1, dayOfMonth, hour, minute, 0).getTime();
const T0 = at(11, 7); // Saturday 7 November 2026, noon

/** Loads the real service worker against a fake Chrome that records its listeners. */
async function loadWorker(initialStorage = {}, { notifications = false } = {}) {
  const { chrome, browser } = createBrowserMock(initialStorage);
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
      clear: vi.fn(async () => true),
    },
    permissions: { contains: vi.fn(async () => notifications), onAdded: event('permissionsAdded') },
  });
  chrome.storage.onChanged = event('storageChanged');
  if (notifications) {
    chrome.notifications = {
      create: vi.fn(async () => 'id'),
      clear: vi.fn(),
      onClicked: event('notificationClicked'),
    };
  }

  vi.stubGlobal('chrome', chrome);
  vi.resetModules();
  await import('../src/background/service-worker.js');
  browser.tab = { url: 'chrome://extensions', audible: false, incognito: false };
  // Let the worker's own start-up task (heartbeat, alarm restore) finish.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { chrome, listeners, browser };
}

const command = (listeners, action, sender = { id: 'self' }) =>
  new Promise((resolve) => {
    const keepOpen = listeners.onMessage(
      { type: MESSAGE_TYPES.FOCUS_COMMAND, action },
      sender,
      resolve,
    );
    if (keepOpen === false) setTimeout(() => resolve('no-async-response'), 50);
  });

const stored = (chrome) => chrome.storage.local.get(null);
const fireFocusAlarm = (listeners) => listeners.alarm({ name: FOCUS_ALARM });
const clockAt = (time) => vi.setSystemTime(time);
const settingsWith = (patch) => ({ settings: { ...DEFAULT_SETTINGS, ...patch } });

async function settle(listeners, chrome, predicate) {
  await vi.waitFor(async () => expect(Boolean(predicate(await stored(chrome)))).toBe(true));
}

function useClock(time = T0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  clockAt(time);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('focus commands', () => {
  it('starts a focus session of the length in the settings, and sets an alarm for its end', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();

    const response = await command(listeners, 'start');
    expect(response.ok).toBe(true);
    expect(response.state).toMatchObject({
      phase: 'focus',
      status: 'running',
      durationMs: 25 * MIN,
      endsAt: T0 + 25 * MIN,
      cycle: 0,
    });
    expect(chrome.alarms.create).toHaveBeenCalledWith(FOCUS_ALARM, { when: T0 + 25 * MIN });
    expect((await stored(chrome)).focusState).toMatchObject({ status: 'running', phase: 'focus' });
  });

  it('uses a different focus length when the user has chosen one', async () => {
    useClock();
    const { listeners } = await loadWorker(settingsWith({ focusMinutes: 45 }));
    const response = await command(listeners, 'start');
    expect(response.state.durationMs).toBe(45 * MIN);
  });

  it('pauses with the time that is left, removes the alarm, then resumes with a new end time', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');

    clockAt(T0 + 10 * MIN);
    const paused = await command(listeners, 'pause');
    expect(paused.state).toMatchObject({ status: 'paused', remainingMs: 15 * MIN, endsAt: null });
    expect(chrome.alarms.clear).toHaveBeenLastCalledWith(FOCUS_ALARM);

    clockAt(T0 + 3 * 60 * MIN); // away for hours
    const resumed = await command(listeners, 'resume');
    expect(resumed.state).toMatchObject({
      status: 'running',
      endsAt: T0 + 3 * 60 * MIN + 15 * MIN,
    });
    expect(chrome.alarms.create).toHaveBeenLastCalledWith(FOCUS_ALARM, {
      when: T0 + 3 * 60 * MIN + 15 * MIN,
    });
  });

  it('stops: no timer, no alarm, and nothing is counted', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 20 * MIN);

    expect((await command(listeners, 'stop')).state).toBeNull();
    const data = await stored(chrome);
    expect(data.focusState).toBeNull();
    expect(Object.keys(data).some((key) => key.startsWith('focusDay:'))).toBe(false);
    expect(chrome.alarms.clear).toHaveBeenLastCalledWith(FOCUS_ALARM);
  });

  it('does not restart a session that is already running', async () => {
    useClock();
    const { listeners } = await loadWorker();
    const first = await command(listeners, 'start');
    clockAt(T0 + 5 * MIN);
    const second = await command(listeners, 'start');
    expect(second.state.endsAt).toBe(first.state.endsAt);
  });

  it('refuses to skip a focus session or nothing, and says why', async () => {
    useClock();
    const { listeners } = await loadWorker();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const nothing = await command(listeners, 'skip');
    expect(nothing).toMatchObject({ ok: false, error: expect.stringContaining('Only a break') });

    await command(listeners, 'start');
    expect((await command(listeners, 'skip')).ok).toBe(false);
    // Refusing a request is a normal answer, not a fault to report.
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('skips a break and offers the next focus session', async () => {
    useClock();
    const { listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    const afterFocus = await command(listeners, 'sync');
    expect(afterFocus.state).toMatchObject({ phase: 'shortBreak', status: 'ready' });

    const skipped = await command(listeners, 'skip');
    expect(skipped.state).toMatchObject({ phase: 'focus', status: 'ready', cycle: 1 });
  });

  it('rejects an unknown action without changing anything', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    const sendResponse = vi.fn();
    const keepOpen = listeners.onMessage(
      { type: MESSAGE_TYPES.FOCUS_COMMAND, action: 'explode' },
      { id: 'self' },
      sendResponse,
    );
    expect(keepOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Unknown focus action.' });
    expect((await stored(chrome)).focusState).toBeUndefined();
  });

  it('ignores a command that does not come from this extension', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    expect(await command(listeners, 'start', { id: 'someone-else' })).toBe('no-async-response');
    expect((await stored(chrome)).focusState).toBeUndefined();
  });

  it('treats a corrupt stored timer as no timer', async () => {
    useClock();
    const { listeners } = await loadWorker({ focusState: { phase: 'nap', status: 'running' } });
    const response = await command(listeners, 'start');
    expect(response.state).toMatchObject({ phase: 'focus', status: 'running' });
  });

  it('still answers when the alarm cannot be set', async () => {
    useClock();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, listeners } = await loadWorker();
    chrome.alarms.create = vi.fn(async () => {
      throw new Error('alarms unavailable');
    });
    const response = await command(listeners, 'start');
    expect(response.ok).toBe(true);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('focus alarm failed'),
      expect.anything(),
    );
  });
});

describe('finishing a session', () => {
  it('on its alarm: records the session, moves to a break, and removes the alarm', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');

    clockAt(T0 + 25 * MIN);
    fireFocusAlarm(listeners);
    await settle(listeners, chrome, (data) => data.focusState?.phase === 'shortBreak');

    const data = await stored(chrome);
    expect(data.focusState).toMatchObject({ phase: 'shortBreak', status: 'ready', cycle: 1 });
    expect(data['focusDay:2026-11-07']).toEqual({
      date: '2026-11-07',
      sessions: 1,
      focusMs: 25 * MIN,
      longestMs: 25 * MIN,
    });
    expect(chrome.alarms.clear).toHaveBeenLastCalledWith(FOCUS_ALARM);
  });

  it('counts it once, however many times it is settled', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 26 * MIN);

    await command(listeners, 'sync');
    await command(listeners, 'sync');
    fireFocusAlarm(listeners);
    await command(listeners, 'sync');
    expect((await stored(chrome))['focusDay:2026-11-07'].sessions).toBe(1);
  });

  it('settles on the next heartbeat when the alarm was late', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');

    clockAt(T0 + 27 * MIN);
    listeners.alarm({ name: 'browsewise-heartbeat' });
    await settle(listeners, chrome, (data) => data['focusDay:2026-11-07']?.sessions === 1);
  });

  it('settles before applying a command that arrives just after the end', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN + 3000);

    const response = await command(listeners, 'pause');
    expect(response.state).toMatchObject({ phase: 'shortBreak', status: 'ready' });
    expect((await stored(chrome))['focusDay:2026-11-07'].sessions).toBe(1);
  });

  it('writes the session and the new timer state in one storage call', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);

    const set = vi.spyOn(chrome.storage.local, 'set');
    await command(listeners, 'sync');
    const completion = set.mock.calls.find(([items]) => 'focusDay:2026-11-07' in items);
    expect(completion[0]).toHaveProperty('focusState');
  });

  it('does not count the session twice if the write failed and is tried again', async () => {
    useClock();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);

    const original = chrome.storage.local.set;
    chrome.storage.local.set = vi.fn(async () => {
      throw new Error('storage unavailable');
    });
    const failed = await command(listeners, 'sync');
    expect(failed).toMatchObject({ ok: false, error: 'storage unavailable' });
    expect(errorLog).toHaveBeenCalled();

    // Nothing was half-written: still running, no session recorded.
    chrome.storage.local.set = original;
    let data = await stored(chrome);
    expect(data.focusState.status).toBe('running');
    expect(data['focusDay:2026-11-07']).toBeUndefined();

    await command(listeners, 'sync');
    data = await stored(chrome);
    expect(data['focusDay:2026-11-07'].sessions).toBe(1);
    expect(data.focusState.phase).toBe('shortBreak');
  });

  it('files a late session under the day it ended, not the day it was noticed', async () => {
    useClock(at(11, 7, 23, 20));
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start'); // ends 23:45 on the 7th

    clockAt(at(11, 8, 0, 20)); // the worker only notices after midnight
    await command(listeners, 'sync');
    const data = await stored(chrome);
    expect(data['focusDay:2026-11-07'].sessions).toBe(1);
    expect(data['focusDay:2026-11-08']).toBeUndefined();
  });

  it('files a session that ends after midnight under the new day', async () => {
    useClock(at(11, 7, 23, 50));
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start'); // ends 00:15 on the 8th

    clockAt(at(11, 8, 0, 16));
    await command(listeners, 'sync');
    const data = await stored(chrome);
    expect(data['focusDay:2026-11-08'].sessions).toBe(1);
    expect(data['focusDay:2026-11-07']).toBeUndefined();
  });

  it('goes to a long break after the fourth session, and starts the count again after it', async () => {
    useClock();
    const { listeners } = await loadWorker();
    let now = T0;
    const phases = [];

    for (let round = 1; round <= 4; round += 1) {
      await command(listeners, 'start'); // focus
      now += 25 * MIN;
      clockAt(now);
      const afterFocus = (await command(listeners, 'sync')).state;
      phases.push(afterFocus.phase);

      await command(listeners, 'start'); // the break
      now += afterFocus.durationMs;
      clockAt(now);
      const afterBreak = (await command(listeners, 'sync')).state;
      expect(afterBreak.phase).toBe('focus');
      if (round === 4) expect(afterBreak.cycle).toBe(0);
    }
    expect(phases).toEqual(['shortBreak', 'shortBreak', 'shortBreak', 'longBreak']);
  });

  it('does not count a finished break as a focus session', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker();
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    await command(listeners, 'sync');
    await command(listeners, 'start'); // the break
    clockAt(T0 + 31 * MIN);
    await command(listeners, 'sync');
    expect((await stored(chrome))['focusDay:2026-11-07'].sessions).toBe(1);
  });

  it('starts the next phase by itself only when the user asked for that', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker(settingsWith({ autoStartNext: true }));
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN + 4000); // noticed a few seconds late

    const state = (await command(listeners, 'sync')).state;
    expect(state).toMatchObject({ phase: 'shortBreak', status: 'running' });
    // It runs from the moment it was noticed, so a late wake never chains several phases.
    expect(state.endsAt).toBe(T0 + 25 * MIN + 4000 + 5 * MIN);
    expect(chrome.alarms.create).toHaveBeenLastCalledWith(FOCUS_ALARM, { when: state.endsAt });
  });

  it('keeps a session that finished while the computer slept, without a stale notification', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker(settingsWith({ notificationsEnabled: true }), {
      notifications: true,
    });
    await command(listeners, 'start');

    clockAt(T0 + 3 * 60 * MIN); // woke up three hours later
    await command(listeners, 'sync');
    expect((await stored(chrome))['focusDay:2026-11-07'].sessions).toBe(1);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});

describe('restarts', () => {
  it('sets the alarm again from the stored timer when the worker starts', async () => {
    useClock();
    const endsAt = T0 + 12 * MIN;
    const { chrome } = await loadWorker({
      focusState: {
        phase: 'focus',
        status: 'running',
        durationMs: 25 * MIN,
        remainingMs: 25 * MIN,
        startedAt: T0 - 13 * MIN,
        endsAt,
        cycle: 0,
        sessionId: 'abc123',
      },
    });
    expect(chrome.alarms.create).toHaveBeenCalledWith(FOCUS_ALARM, { when: endsAt });
  });

  it('has no focus alarm when nothing is running', async () => {
    useClock();
    const { chrome } = await loadWorker();
    expect(chrome.alarms.create).not.toHaveBeenCalledWith(FOCUS_ALARM, expect.anything());
    expect(chrome.alarms.clear).toHaveBeenCalledWith(FOCUS_ALARM);
  });
});

describe('notifications', () => {
  it('announces a finished session, and the badge it earned, when notifications are on', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker(settingsWith({ notificationsEnabled: true }), {
      notifications: true,
    });
    const { state } = await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    await command(listeners, 'sync');

    const calls = chrome.notifications.create.mock.calls;
    const focus = calls.find(([id]) => id === `browsewise-focus-${state.sessionId}`);
    expect(focus[1]).toMatchObject({
      title: 'Focus session complete',
      message: 'You focused for 25 minutes. Time for a 5-minute short break.',
    });
    const badge = calls.find(([id]) => id === 'browsewise-badge-first-session');
    expect(badge[1]).toMatchObject({ title: 'New badge: First focus' });
  });

  it('stays quiet about badges when streaks and badges are hidden', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker(
      settingsWith({ notificationsEnabled: true, showAchievements: false }),
      { notifications: true },
    );
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    await command(listeners, 'sync');
    const ids = chrome.notifications.create.mock.calls.map(([id]) => id);
    expect(ids.some((id) => id.startsWith('browsewise-focus-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('browsewise-badge-'))).toBe(false);
  });

  it('says nothing when notifications are off', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker({}, { notifications: true });
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    await command(listeners, 'sync');
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('announces the end of a break too', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker(settingsWith({ notificationsEnabled: true }), {
      notifications: true,
    });
    await command(listeners, 'start');
    clockAt(T0 + 25 * MIN);
    await command(listeners, 'sync');
    await command(listeners, 'start');
    clockAt(T0 + 30 * MIN);
    await command(listeners, 'sync');
    const titles = chrome.notifications.create.mock.calls.map(([, options]) => options.title);
    expect(titles).toContain('Break over');
  });

  it('opens the Focus page when a focus notification is clicked, and Goals for a limit', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker({}, { notifications: true });
    listeners.notificationClicked('browsewise-focus-abc');
    listeners.notificationClicked('browsewise-badge-first-session');
    listeners.notificationClicked('browsewise-limit-daily');
    await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(3));
    const urls = chrome.tabs.create.mock.calls.map(([options]) => options.url);
    expect(urls[0]).toContain('#focus');
    expect(urls[1]).toContain('#focus');
    expect(urls[2]).toContain('#goals');
  });
});

describe('achievements in the worker', () => {
  it('records each finished day against the daily goal, once, on the heartbeat', async () => {
    useClock();
    const usage = (date, minutes) => ({
      date,
      hourlyMs: new Array(24).fill(0),
      domainMs: { 'a.com': minutes * MIN },
    });
    const { chrome, listeners } = await loadWorker({
      goals: { dailyGoalMs: 60 * MIN, siteLimits: {} },
      'usage:2026-11-04': usage('2026-11-04', 90), // over
      'usage:2026-11-05': usage('2026-11-05', 30), // within
      'usage:2026-11-06': usage('2026-11-06', 60), // exactly the goal counts as within
      [`usage:2026-11-07`]: usage('2026-11-07', 500), // today is not finished
    });

    listeners.alarm({ name: 'browsewise-heartbeat' });
    await settle(listeners, chrome, (data) => data.achievements?.lastClosed === '2026-11-06');
    const { achievements } = await stored(chrome);
    expect(achievements.days).toEqual({
      '2026-11-04': 'over',
      '2026-11-05': 'met',
      '2026-11-06': 'met',
    });

    const set = vi.spyOn(chrome.storage.local, 'set');
    listeners.alarm({ name: 'browsewise-heartbeat' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(set.mock.calls.some(([items]) => 'achievements' in items)).toBe(false);
  });

  it('skips days when no goal was set', async () => {
    useClock();
    const { chrome, listeners } = await loadWorker({
      'usage:2026-11-05': {
        date: '2026-11-05',
        hourlyMs: new Array(24).fill(0),
        domainMs: { 'a.com': 30 * MIN },
      },
    });
    listeners.alarm({ name: 'browsewise-heartbeat' });
    await settle(listeners, chrome, (data) => data.achievements?.days?.['2026-11-05']);
    expect((await stored(chrome)).achievements.days['2026-11-05']).toBe('skipped');
  });

  it('awards the goal-streak badge after seven days within the goal', async () => {
    useClock();
    const seed = { goals: { dailyGoalMs: 60 * MIN, siteLimits: {} } };
    const dates = [
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ];
    for (const date of dates) {
      seed[`usage:${date}`] = {
        date,
        hourlyMs: new Array(24).fill(0),
        domainMs: { 'a.com': 20 * MIN },
      };
    }
    const { chrome, listeners } = await loadWorker(seed);
    listeners.alarm({ name: 'browsewise-heartbeat' });
    await settle(listeners, chrome, (data) => data.achievements?.earned?.['goal-7']);
    expect((await stored(chrome)).achievements.best.goal).toBe(7);
  });

  it('keeps a failing achievements pass from breaking tracking', async () => {
    useClock();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, listeners, browser } = await loadWorker();
    browser.tab = { url: 'https://github.com/', audible: false, incognito: false };
    const original = chrome.storage.local.get;
    chrome.storage.local.get = vi.fn(async (keys) => {
      if (Array.isArray(keys) && keys.includes('focusState')) throw new Error('focus read failed');
      return original(keys);
    });

    listeners.alarm({ name: 'browsewise-heartbeat' });
    await vi.waitFor(() =>
      expect(errorLog.mock.calls.some(([text]) => String(text).includes('focus timer'))).toBe(true),
    );
    expect((await stored(chrome))['tracker:state']).toMatchObject({ activeDomain: 'github.com' });
  });
});
