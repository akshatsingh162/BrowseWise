import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DASHBOARD_PATH, openDashboard } from '../src/shared/navigation.js';

const DASHBOARD_URL = `chrome-extension://abc/${DASHBOARD_PATH}`;
let chromeMock;

beforeEach(() => {
  chromeMock = {
    runtime: { getURL: (path) => `chrome-extension://abc/${path}` },
    tabs: { query: vi.fn(), create: vi.fn(), update: vi.fn() },
    windows: { update: vi.fn() },
  };
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openDashboard', () => {
  it('opens a new tab when the dashboard is not open', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, windowId: 1, url: 'https://github.com/' }]);
    await openDashboard();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: DASHBOARD_URL });
    expect(chromeMock.tabs.update).not.toHaveBeenCalled();
  });

  it('focuses the existing dashboard tab instead of opening another', async () => {
    chromeMock.tabs.query.mockResolvedValue([
      { id: 1, windowId: 1, url: 'https://github.com/' },
      { id: 7, windowId: 3, url: `${DASHBOARD_URL}#/analytics` },
    ]);
    await openDashboard();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('copes with tabs whose URL is hidden', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, windowId: 1 }]);
    await openDashboard();
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
});

describe('openDashboard with a page', () => {
  it('opens a new tab straight on that page', async () => {
    chromeMock.tabs.query.mockResolvedValue([]);
    await openDashboard('goals');
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: `${DASHBOARD_URL}#goals` });
  });

  it('moves an open dashboard to that page and focuses it', async () => {
    chromeMock.tabs.query.mockResolvedValue([
      { id: 7, windowId: 3, url: `${DASHBOARD_URL}#overview` },
    ]);
    await openDashboard('goals');
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, {
      active: true,
      url: `${DASHBOARD_URL}#goals`,
    });
    expect(chromeMock.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('leaves an open dashboard on its current page when no page is given', async () => {
    chromeMock.tabs.query.mockResolvedValue([
      { id: 7, windowId: 3, url: `${DASHBOARD_URL}#analytics` },
    ]);
    await openDashboard();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, { active: true });
  });
});
