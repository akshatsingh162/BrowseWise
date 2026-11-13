import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { MAX_SITE_LIMITS } from '../src/shared/limits.js';
import {
  GOALS_KEY,
  NOTICES_KEY,
  acknowledgeCurrentlyExceeded,
  clearAllGoals,
  getGoals,
  getNotices,
  markNotified,
  setDailyGoal,
  setSiteLimit,
} from '../src/shared/storage/goals-repo.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const TODAY = '2026-11-07';
const TOMORROW = new Date(2026, 10, 8, 12, 0, 0).getTime();
let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stored = async (key) => (await chromeMock.storage.local.get(key))[key];
const spend = (domain, minutes) =>
  addUsage(domain, [{ dateKey: TODAY, hour: 9, ms: minutes * MIN }]);

describe('goals storage', () => {
  it('reads as "no goals" when nothing was saved (no migration needed)', async () => {
    expect(await getGoals()).toEqual({ dailyGoalMs: null, siteLimits: {} });
  });

  it('saves and removes the daily goal', async () => {
    await setDailyGoal(120 * MIN, { now: NOW });
    expect((await getGoals()).dailyGoalMs).toBe(120 * MIN);
    await setDailyGoal(null, { now: NOW });
    expect((await getGoals()).dailyGoalMs).toBeNull();
  });

  it('adds, changes and removes site limits independently of the goal', async () => {
    await setDailyGoal(120 * MIN, { now: NOW });
    await setSiteLimit('youtube.com', 30 * MIN, { now: NOW });
    await setSiteLimit('reddit.com', 20 * MIN, { now: NOW });
    await setSiteLimit('youtube.com', 45 * MIN, { now: NOW });
    await setSiteLimit('reddit.com', null, { now: NOW });
    expect(await getGoals()).toEqual({
      dailyGoalMs: 120 * MIN,
      siteLimits: { 'youtube.com': 45 * MIN },
    });
  });

  it('rejects invalid input and changes nothing', async () => {
    await setSiteLimit('a.com', 30 * MIN, { now: NOW });
    await expect(setDailyGoal(1000, { now: NOW })).rejects.toThrow(TypeError);
    await expect(setDailyGoal(NaN, { now: NOW })).rejects.toThrow(TypeError);
    await expect(setSiteLimit('', 30 * MIN, { now: NOW })).rejects.toThrow(TypeError);
    await expect(setSiteLimit('has space.com', 30 * MIN, { now: NOW })).rejects.toThrow(TypeError);
    await expect(setSiteLimit('a.com', 1000, { now: NOW })).rejects.toThrow(TypeError);
    expect(await getGoals()).toEqual({ dailyGoalMs: null, siteLimits: { 'a.com': 30 * MIN } });
  });

  it(`allows at most ${MAX_SITE_LIMITS} site limits, but still lets existing ones be changed`, async () => {
    const seeded = Object.fromEntries(
      Array.from({ length: MAX_SITE_LIMITS }, (_, i) => [`s${i}.com`, 30 * MIN]),
    );
    await chromeMock.storage.local.set({ [GOALS_KEY]: { dailyGoalMs: null, siteLimits: seeded } });

    await expect(setSiteLimit('one-too-many.com', 30 * MIN, { now: NOW })).rejects.toThrow(
      RangeError,
    );
    await expect(setSiteLimit('s0.com', 60 * MIN, { now: NOW })).resolves.toBeDefined();
    await expect(setSiteLimit('s1.com', null, { now: NOW })).resolves.toBeDefined();
  });

  it('does not lose changes when many are saved at once', async () => {
    const domains = Array.from({ length: 25 }, (_, i) => `site${i}.com`);
    await Promise.all(domains.map((d) => setSiteLimit(d, 30 * MIN, { now: NOW })));
    expect(Object.keys((await getGoals()).siteLimits).sort()).toEqual([...domains].sort());
  });

  it('safely stores a hostile name such as __proto__', async () => {
    await setSiteLimit('__proto__', 30 * MIN, { now: NOW });
    const { siteLimits } = await getGoals();
    expect(Object.keys(siteLimits)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(siteLimits)).toBe(Object.prototype);
  });

  it('heals corrupted stored data when reading', async () => {
    await chromeMock.storage.local.set({ [GOALS_KEY]: 'garbage' });
    expect(await getGoals()).toEqual({ dailyGoalMs: null, siteLimits: {} });
  });

  it('clearAllGoals removes goals and the notification record', async () => {
    await setDailyGoal(120 * MIN, { now: NOW });
    await markNotified(TODAY, { type: 'goal' });
    await clearAllGoals();
    expect(await stored(GOALS_KEY)).toBeUndefined();
    expect(await stored(NOTICES_KEY)).toBeUndefined();
  });
});

describe('notification record', () => {
  it('remembers what was notified today', async () => {
    await markNotified(TODAY, { type: 'goal' });
    await markNotified(TODAY, { type: 'site', domain: 'a.com' });
    await markNotified(TODAY, { type: 'site', domain: 'a.com' });
    expect(await getNotices(TODAY)).toEqual({ dateKey: TODAY, goal: true, domains: ['a.com'] });
  });

  it('starts empty on a new day, so limits can notify again', async () => {
    await markNotified(TODAY, { type: 'goal' });
    expect(await getNotices('2026-11-08')).toEqual({
      dateKey: '2026-11-08',
      goal: false,
      domains: [],
    });
  });

  it('heals corrupted data', async () => {
    await chromeMock.storage.local.set({
      [NOTICES_KEY]: { dateKey: TODAY, goal: 'yes', domains: 'x' },
    });
    expect(await getNotices(TODAY)).toEqual({ dateKey: TODAY, goal: false, domains: [] });
  });
});

describe('creating or changing a limit decides its notification state', () => {
  it('a limit already passed today does not notify (the user can see it)', async () => {
    await spend('github.com', 30);
    await setSiteLimit('github.com', 20 * MIN, { now: NOW });
    expect((await getNotices(TODAY)).domains).toContain('github.com');
  });

  it('a limit not yet reached may notify when it is reached', async () => {
    await spend('github.com', 30);
    await setSiteLimit('github.com', 60 * MIN, { now: NOW });
    expect((await getNotices(TODAY)).domains).not.toContain('github.com');
  });

  it('raising a limit that had already notified lets it notify again', async () => {
    await spend('github.com', 30);
    await setSiteLimit('github.com', 20 * MIN, { now: NOW });
    await setSiteLimit('github.com', 45 * MIN, { now: NOW });
    expect((await getNotices(TODAY)).domains).not.toContain('github.com');
  });

  it('removing a limit clears its record', async () => {
    await spend('github.com', 30);
    await setSiteLimit('github.com', 20 * MIN, { now: NOW });
    await setSiteLimit('github.com', null, { now: NOW });
    expect((await getNotices(TODAY)).domains).toEqual([]);
  });

  it('works the same for the daily goal', async () => {
    await spend('github.com', 30);
    await spend('youtube.com', 40);
    await setDailyGoal(60 * MIN, { now: NOW });
    expect((await getNotices(TODAY)).goal).toBe(true);
    await setDailyGoal(120 * MIN, { now: NOW });
    expect((await getNotices(TODAY)).goal).toBe(false);
  });

  it('only looks at today\u2019s usage', async () => {
    await spend('github.com', 30);
    await setSiteLimit('github.com', 20 * MIN, { now: TOMORROW });
    expect((await getNotices('2026-11-08')).domains).toEqual([]);
  });
});

describe('acknowledgeCurrentlyExceeded', () => {
  it('marks only the limits that are already exceeded', async () => {
    await spend('github.com', 30);
    await spend('youtube.com', 5);
    await chromeMock.storage.local.set({
      [GOALS_KEY]: {
        dailyGoalMs: 20 * MIN,
        siteLimits: { 'github.com': 10 * MIN, 'youtube.com': 60 * MIN },
      },
    });

    await acknowledgeCurrentlyExceeded({ now: NOW });

    expect(await getNotices(TODAY)).toEqual({
      dateKey: TODAY,
      goal: true,
      domains: ['github.com'],
    });
  });
});
