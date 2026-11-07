import { vi } from 'vitest';
import { createChromeMock } from './chrome-mock.js';

/**
 * A fake browser for integration tests: chrome.storage plus the windows, tabs and
 * idle APIs that syncTracking reads. Mutate the returned `browser` object to
 * simulate the user doing things (switching tabs, alt-tabbing away, going idle).
 */
export function createBrowserMock(initialStorage = {}) {
  const base = createChromeMock(initialStorage);

  const browser = {
    window: { id: 1, focused: true }, // set to null to simulate "no windows"
    tab: { url: 'https://github.com/', audible: false, incognito: false },
    idle: 'active',
  };

  const chromeMock = {
    ...base,
    windows: {
      getLastFocused: async () => {
        if (!browser.window) throw new Error('No last-focused window');
        return { ...browser.window };
      },
    },
    tabs: {
      query: async ({ windowId }) => {
        if (!browser.window || !browser.tab || windowId !== browser.window.id) return [];
        return [{ id: 100, windowId, active: true, ...browser.tab }];
      },
    },
    idle: {
      queryState: vi.fn(async () => browser.idle),
      setDetectionInterval: vi.fn(),
    },
  };

  return { chrome: chromeMock, browser };
}
