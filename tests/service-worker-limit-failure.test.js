import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';

// A limit check that always fails must never stop tracking from being saved.
vi.mock('../src/background/limits-monitor.js', () => ({
  checkLimits: vi.fn(async () => {
    throw new Error('limit check exploded');
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('service worker when the limit check fails', () => {
  it('still saves tracking, logs the problem, and answers the caller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chrome, browser } = createBrowserMock();
    const listeners = {};
    const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
    Object.assign(chrome, {
      runtime: {
        id: 'self',
        onInstalled: event('a'),
        onStartup: event('b'),
        onMessage: event('onMessage'),
      },
      tabs: {
        ...chrome.tabs,
        onActivated: event('c'),
        onUpdated: event('d'),
        onRemoved: event('e'),
        onReplaced: event('f'),
      },
      windows: { ...chrome.windows, onFocusChanged: event('g') },
      idle: { ...chrome.idle, onStateChanged: event('h') },
      alarms: { onAlarm: event('i'), get: vi.fn(async () => ({})), create: vi.fn() },
    });
    chrome.storage.onChanged = event('j');
    vi.stubGlobal('chrome', chrome);
    vi.resetModules();
    await import('../src/background/service-worker.js');
    browser.tab = { url: 'https://github.com/', audible: false, incognito: false };

    const sendResponse = vi.fn();
    listeners.onMessage({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }, { id: 'self' }, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    const saved = await chrome.storage.local.get('tracker:state');
    expect(saved['tracker:state'].activeDomain).toBe('github.com');
    expect(error).toHaveBeenCalledWith(
      '[BrowseWise] limit check failed: limit check exploded',
      expect.any(Error),
    );
  });
});
