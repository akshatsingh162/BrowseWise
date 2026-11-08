import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';

/**
 * Loads the real service worker with a fake chrome that records its listeners,
 * so we can check how it answers messages from the popup.
 */
async function loadWorker() {
  const { chrome, browser } = createBrowserMock();
  const listeners = {};
  const event = (name) => ({ addListener: (fn) => (listeners[name] = fn) });

  Object.assign(chrome, {
    runtime: {
      id: 'self',
      onInstalled: event('onInstalled'),
      onStartup: event('onStartup'),
      onMessage: event('onMessage'),
    },
    tabs: {
      ...chrome.tabs,
      onActivated: event('a'),
      onUpdated: event('b'),
      onRemoved: event('c'),
      onReplaced: event('d'),
    },
    windows: { ...chrome.windows, onFocusChanged: event('e') },
    idle: { ...chrome.idle, onStateChanged: event('f') },
    alarms: {
      onAlarm: event('g'),
      get: vi.fn(async () => ({ name: 'browsewise-heartbeat' })),
      create: vi.fn(async () => {}),
    },
  });
  chrome.storage.onChanged = event('h');

  vi.stubGlobal('chrome', chrome);
  vi.resetModules();
  await import('../src/background/service-worker.js');
  return { listeners, browser };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('service worker message handling', () => {
  it('answers GET_LIVE_SNAPSHOT from its own extension and keeps the channel open', async () => {
    const { listeners } = await loadWorker();
    const sendResponse = vi.fn();

    const keepOpen = listeners.onMessage(
      { type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT },
      { id: 'self' },
      sendResponse,
    );

    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it('ignores unknown messages and other senders', async () => {
    const { listeners } = await loadWorker();
    const sendResponse = vi.fn();

    expect(listeners.onMessage({ type: 'SOMETHING_ELSE' }, { id: 'self' }, sendResponse)).toBe(
      false,
    );
    expect(
      listeners.onMessage({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }, { id: 'other' }, sendResponse),
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('registers every tracking listener synchronously at load', async () => {
    const { listeners } = await loadWorker();
    for (const name of [
      'onInstalled',
      'onStartup',
      'onMessage',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]) {
      expect(typeof listeners[name]).toBe('function');
    }
  });
});
