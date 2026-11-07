import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { syncTracking } from '../src/background/sync.js';
import { TRACKER_STATE_KEY } from '../src/background/session-store.js';
import { getUsageForDate } from '../src/shared/storage/usage-repo.js';

const at = (hour, minute = 0, second = 0, day = 7) =>
  new Date(2026, 10, day, hour, minute, second).getTime();

let browser;
let chromeMock;

beforeEach(() => {
  ({ chrome: chromeMock, browser } = createBrowserMock());
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const today = () => getUsageForDate('2026-11-07');
const storedState = async () =>
  (await chromeMock.storage.local.get(TRACKER_STATE_KEY))[TRACKER_STATE_KEY];

describe('syncTracking: normal browsing', () => {
  it('records the first observation without crediting any time', async () => {
    const { credit, state } = await syncTracking({ now: at(10) });
    expect(credit).toBeNull();
    expect(state.activeDomain).toBe('github.com');
    expect((await today()).domainMs).toEqual({});
  });

  it('credits time on later heartbeats, persisting usage and the checkpoint', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    await syncTracking({ now: at(10, 1, 0) });

    const day = await today();
    expect(day.domainMs).toEqual({ 'github.com': 60_000 });
    expect(day.hourlyMs[10]).toBe(60_000);
    expect((await storedState()).checkpointTs).toBe(at(10, 1, 0));
  });

  it('credits each site correctly across a tab switch', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    browser.tab = { url: 'https://www.youtube.com/watch?v=1', audible: false, incognito: false };
    await syncTracking({ now: at(10, 0, 20) });
    await syncTracking({ now: at(10, 0, 50) });

    expect((await today()).domainMs).toEqual({ 'github.com': 20_000, 'youtube.com': 30_000 });
  });

  it('splits usage across two days at midnight', async () => {
    await syncTracking({ now: at(23, 59, 40) });
    await syncTracking({ now: at(0, 0, 20, 8) });

    const first = await getUsageForDate('2026-11-07');
    const second = await getUsageForDate('2026-11-08');
    expect(first.hourlyMs[23]).toBe(20_000);
    expect(second.hourlyMs[0]).toBe(20_000);
  });
});

describe('syncTracking: when time must not count', () => {
  it('stops when Chrome loses focus, and counts nothing while away', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    browser.window = { id: 1, focused: false };
    await syncTracking({ now: at(10, 0, 30) }); // credits the 30 s before focus was lost
    await syncTracking({ now: at(10, 1, 0) });
    await syncTracking({ now: at(10, 1, 30) });

    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 });
  });

  it('resumes after focus returns', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    browser.window = { id: 1, focused: false };
    await syncTracking({ now: at(10, 0, 10) });
    browser.window = { id: 1, focused: true };
    await syncTracking({ now: at(10, 0, 40) });
    await syncTracking({ now: at(10, 1, 0) });

    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 }); // 10 s + 20 s
  });

  it('stops on an idle event without needing queryState', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 1, 0), idleState: 'idle' });
    browser.idle = 'idle';
    await syncTracking({ now: at(10, 1, 30) });

    expect((await today()).domainMs).toEqual({ 'github.com': 60_000 });
  });

  it('asks Chrome for the idle state using the configured threshold', async () => {
    await chromeMock.storage.local.set({ settings: { idleThresholdSeconds: 90 } });
    await syncTracking({ now: at(10) });
    expect(chromeMock.idle.queryState).toHaveBeenCalledWith(90);
  });

  it('does not count while the screen is locked', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    browser.idle = 'locked';
    await syncTracking({ now: at(10, 0, 20) });
    await syncTracking({ now: at(10, 0, 50) });

    expect((await today()).domainMs).toEqual({ 'github.com': 20_000 });
  });

  it('counts an audible tab while idle only if the setting is enabled', async () => {
    browser.tab = { url: 'https://www.youtube.com/', audible: true, incognito: false };
    browser.idle = 'idle';

    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({});

    await chromeMock.storage.local.set({ settings: { countAudibleTabsAsActive: true } });
    // The service worker re-syncs the moment settings change; model that here so the
    // new setting applies from this instant onwards rather than retroactively.
    await syncTracking({ now: at(10, 0, 30) });
    await syncTracking({ now: at(10, 0, 40) });
    await syncTracking({ now: at(10, 1, 0) });
    expect((await today()).domainMs).toEqual({ 'youtube.com': 30_000 });
  });

  it('ignores browser-internal pages', async () => {
    browser.tab = { url: 'chrome://extensions', audible: false, incognito: false };
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({});
  });

  it('never tracks incognito tabs', async () => {
    browser.tab = { url: 'https://github.com/', audible: false, incognito: true };
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({});
  });

  it('respects trackLocalHosts = false', async () => {
    await chromeMock.storage.local.set({ settings: { trackLocalHosts: false } });
    browser.tab = { url: 'http://localhost:5173/', audible: false, incognito: false };
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({});
  });

  it('survives having no browser window at all', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    browser.window = null;
    await expect(syncTracking({ now: at(10, 0, 30) })).resolves.toBeDefined();
    await syncTracking({ now: at(10, 1, 0) });
    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 });
  });
});

describe('syncTracking: worker restarts and browser restarts', () => {
  it('keeps working from persisted state alone (simulates a fresh service worker)', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    // A new worker has no memory; only storage remains. syncTracking holds no state,
    // so calling it again IS the cold-start path.
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 });
  });

  it('discards a very long gap (sleep or Chrome closed) instead of counting it', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(13, 0, 0) });
    await syncTracking({ now: at(13, 0, 30) });
    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 });
  });

  it('does not credit the closed period at browser startup, even for a short gap', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 1, 0), resetCheckpoint: true });
    expect((await today()).domainMs).toEqual({});
  });

  it('starts fresh when the stored state is corrupt', async () => {
    await chromeMock.storage.local.set({ [TRACKER_STATE_KEY]: { checkpointTs: 'garbage' } });
    await expect(syncTracking({ now: at(10, 0, 0) })).resolves.toBeDefined();
    await syncTracking({ now: at(10, 0, 30) });
    expect((await today()).domainMs).toEqual({ 'github.com': 30_000 });
  });
});
