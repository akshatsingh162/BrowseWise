import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { checkLimits } from '../src/background/limits-monitor.js';
import { getNotices, setDailyGoal, setSiteLimit } from '../src/shared/storage/goals-repo.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const TODAY = '2026-11-07';
const TOMORROW = new Date(2026, 10, 8, 12, 0, 0).getTime();
let chromeMock;
let notify;

beforeEach(() => {
  chromeMock = createChromeMock({ settings: { notificationsEnabled: true } });
  vi.stubGlobal('chrome', chromeMock);
  notify = vi.fn(async () => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const spend = (domain, minutes, dateKey = TODAY) =>
  addUsage(domain, [{ dateKey, hour: 9, ms: minutes * MIN }]);
const run = (now = NOW) => checkLimits({ now, notify });
const disable = () => chromeMock.storage.local.set({ settings: { notificationsEnabled: false } });

describe('checkLimits', () => {
  it('does nothing when notifications are off', async () => {
    await setSiteLimit('github.com', 10 * MIN, { now: NOW });
    await spend('github.com', 30);
    await disable();
    // Setting the limit while over it marked it as known; change it so it is pending.
    await setSiteLimit('github.com', 20 * MIN, { now: NOW });
    expect(await run()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does nothing when there are no goals or limits', async () => {
    await spend('github.com', 300);
    expect(await run()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does nothing while usage is under every limit', async () => {
    await setDailyGoal(120 * MIN, { now: NOW });
    await setSiteLimit('github.com', 60 * MIN, { now: NOW });
    await spend('github.com', 30);
    expect(await run()).toEqual([]);
  });

  it('notifies when a site limit is reached, and only once per day', async () => {
    await setSiteLimit('youtube.com', 30 * MIN, { now: NOW });
    await spend('youtube.com', 10);
    expect(await run()).toEqual([]);

    await spend('youtube.com', 25);
    const first = await run();
    expect(first).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'site',
        domain: 'youtube.com',
        usedMs: 35 * MIN,
        limitMs: 30 * MIN,
      }),
      TODAY,
    );

    await spend('youtube.com', 10);
    expect(await run()).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('notifies for the daily goal and a site limit separately', async () => {
    await setDailyGoal(40 * MIN, { now: NOW });
    await setSiteLimit('youtube.com', 20 * MIN, { now: NOW });
    await spend('youtube.com', 25);
    await spend('github.com', 25);

    const sent = await run();
    expect(sent.map((item) => item.type).sort()).toEqual(['goal', 'site']);
    expect(await getNotices(TODAY)).toEqual({
      dateKey: TODAY,
      goal: true,
      domains: ['youtube.com'],
    });
  });

  it('retries on the next check if the notification could not be shown', async () => {
    await setSiteLimit('youtube.com', 20 * MIN, { now: NOW });
    await spend('youtube.com', 25);
    notify.mockResolvedValueOnce(false);

    expect(await run()).toEqual([]);
    expect((await getNotices(TODAY)).domains).toEqual([]);

    expect(await run()).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('notifies again the next day', async () => {
    await setSiteLimit('youtube.com', 20 * MIN, { now: NOW });
    await spend('youtube.com', 25);
    expect(await run()).toHaveLength(1);

    await spend('youtube.com', 25, '2026-11-08');
    expect(await run(TOMORROW)).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not announce a limit the user set when already over it', async () => {
    await spend('youtube.com', 25);
    await setSiteLimit('youtube.com', 20 * MIN, { now: NOW });
    expect(await run()).toEqual([]);
  });

  it('counts only today\u2019s usage', async () => {
    await setDailyGoal(30 * MIN, { now: NOW });
    await spend('github.com', 500, '2026-11-06');
    expect(await run()).toEqual([]);
  });
});
