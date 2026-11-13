import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { SUGGESTION_COUNT, loadGoalsData } from '../src/dashboard/goals-data.js';
import { setDailyGoal, setSiteLimit } from '../src/shared/storage/goals-repo.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();

let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const spend = (domain, minutes, dateKey = '2026-11-07') =>
  addUsage(domain, [{ dateKey, hour: 9, ms: minutes * MIN }]);
const granted = (value) => ({ hasPermission: async () => value });

describe('loadGoalsData', () => {
  it('compares today with the goal and limits', async () => {
    await setDailyGoal(60 * MIN, { now: NOW });
    await setSiteLimit('youtube.com', 30 * MIN, { now: NOW });
    await spend('youtube.com', 24);
    await spend('github.com', 20);
    await spend('youtube.com', 500, '2026-11-06'); // yesterday must not count

    const data = await loadGoalsData(NOW, granted(true));

    expect(data.goals).toEqual({ dailyGoalMs: 60 * MIN, siteLimits: { 'youtube.com': 30 * MIN } });
    expect(data.status.usedToday).toBe(44 * MIN);
    expect(data.status.goal.remainingMs).toBe(16 * MIN);
    expect(data.status.sites[0]).toMatchObject({
      domain: 'youtube.com',
      usedMs: 24 * MIN,
      level: 'warning',
    });
  });

  it('reports the notification setting and whether the permission is held', async () => {
    await chromeMock.storage.local.set({ settings: { notificationsEnabled: true } });
    expect((await loadGoalsData(NOW, granted(true))).notifications).toEqual({
      enabled: true,
      granted: true,
    });
    expect((await loadGoalsData(NOW, granted(false))).notifications).toEqual({
      enabled: true,
      granted: false,
    });
  });

  it('suggests recently used websites, most used first', async () => {
    await spend('github.com', 50, '2026-10-20');
    await spend('youtube.com', 30);
    await spend('reddit.com', 5);
    expect((await loadGoalsData(NOW, granted(false))).suggestions).toEqual([
      'github.com',
      'youtube.com',
      'reddit.com',
    ]);
  });

  it(`offers at most ${SUGGESTION_COUNT} suggestions`, async () => {
    for (let i = 0; i < 30; i += 1) await spend(`site${i}.com`, 10 + i);
    expect((await loadGoalsData(NOW, granted(false))).suggestions).toHaveLength(SUGGESTION_COUNT);
  });

  it('copes with no data at all', async () => {
    const data = await loadGoalsData(NOW, granted(false));
    expect(data.goals).toEqual({ dailyGoalMs: null, siteLimits: {} });
    expect(data.status.goal).toBeNull();
    expect(data.status.sites).toEqual([]);
    expect(data.suggestions).toEqual([]);
  });
});
