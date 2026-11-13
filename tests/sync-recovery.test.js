import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserMock } from './helpers/browser-mock.js';
import { syncTracking } from '../src/background/sync.js';
import { getUsageForDate } from '../src/shared/storage/usage-repo.js';

/**
 * What happens to recorded time when a background task fails part-way, for example
 * because Chrome stopped the service worker in the middle of it. Tracking is built so
 * that a failure can lose at most one short interval, and can never count time twice.
 */

const at = (hour, minute = 0, second = 0) => new Date(2026, 10, 7, hour, minute, second).getTime();
let chromeMock;

beforeEach(() => {
  ({ chrome: chromeMock } = createBrowserMock());
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const recorded = async () => (await getUsageForDate('2026-11-07')).domainMs['github.com'] ?? 0;

/** Makes the Nth call to a storage method fail once, like a worker being stopped mid-task. */
function failOnce(method, callNumber) {
  const original = chromeMock.storage.local[method];
  let calls = 0;
  chromeMock.storage.local[method] = vi.fn(async (...args) => {
    calls += 1;
    if (calls === callNumber) throw new Error('No SW');
    return original(...args);
  });
}

describe('a task that fails before saving anything', () => {
  it('loses no time: the next event credits the whole interval', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    expect(await recorded()).toBe(0);

    failOnce('get', 1); // the very first read of the next task fails
    await expect(syncTracking({ now: at(10, 0, 30) })).rejects.toThrow('No SW');
    expect(await recorded()).toBe(0);

    await syncTracking({ now: at(10, 1, 0) });
    expect(await recorded()).toBe(60_000);
  });
});

describe('a task that fails after the checkpoint was saved but before usage was written', () => {
  it('loses that one interval, and never counts any time twice', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    await syncTracking({ now: at(10, 0, 30) });
    expect(await recorded()).toBe(30_000);

    // Within the next task the checkpoint is saved (set call 1), then the usage write
    // (set call 2) fails.
    failOnce('set', 2);
    await expect(syncTracking({ now: at(10, 1, 0) })).rejects.toThrow('No SW');
    expect(await recorded()).toBe(30_000); // the 10:00:30 to 10:01:00 interval is lost

    await syncTracking({ now: at(10, 1, 30) });
    expect(await recorded()).toBe(60_000); // 30s + 30s, not 30s + 60s: nothing counted twice
  });
});

describe('repeated failures', () => {
  it('never produce more recorded time than really passed', async () => {
    await syncTracking({ now: at(10, 0, 0) });
    for (let i = 1; i <= 4; i += 1) {
      failOnce('get', 1);
      await expect(syncTracking({ now: at(10, 0, i * 20) })).rejects.toThrow();
    }
    await syncTracking({ now: at(10, 1, 40) });
    expect(await recorded()).toBeLessThanOrEqual(100_000);
    expect(await recorded()).toBe(100_000);
  });
});
