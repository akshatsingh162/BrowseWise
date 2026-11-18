import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { MAINTENANCE_KEY, runMaintenance } from '../src/background/maintenance.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';
import { addUsage, listUsageDateKeys } from '../src/shared/storage/usage-repo.js';

const at = (month, dayOfMonth, hour = 12) => new Date(2026, month - 1, dayOfMonth, hour).getTime();
const record = (dateKey) => addUsage('github.com', [{ dateKey, hour: 9, ms: 60_000 }]);

async function setup({ retentionDays = 30, days = [] } = {}) {
  const chromeMock = createChromeMock({ settings: { ...DEFAULT_SETTINGS, retentionDays } });
  vi.stubGlobal('chrome', chromeMock);
  for (const dateKey of days) await record(dateKey);
  return chromeMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runMaintenance', () => {
  it('deletes days older than the retention and keeps the rest', async () => {
    // Keeping 30 days on 30 Nov means 1 Nov is the oldest day that stays.
    await setup({ days: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-15', '2026-11-30'] });

    expect(await runMaintenance({ now: at(11, 30) })).toEqual({ ran: true, removedDays: 2 });
    expect(await listUsageDateKeys()).toEqual(['2026-11-01', '2026-11-15', '2026-11-30']);
  });

  it('never deletes today, even with the shortest retention', async () => {
    await setup({ retentionDays: 7, days: ['2026-11-01', '2026-11-07'] });
    await runMaintenance({ now: at(11, 7) });
    expect(await listUsageDateKeys()).toEqual(['2026-11-01', '2026-11-07']);
  });

  it('deletes nothing when everything is within the retention', async () => {
    await setup({ days: ['2026-11-20', '2026-11-30'] });
    expect(await runMaintenance({ now: at(11, 30) })).toEqual({ ran: true, removedDays: 0 });
    expect(await listUsageDateKeys()).toHaveLength(2);
  });

  it('runs at most once a day', async () => {
    await setup({ days: ['2026-10-01', '2026-11-30'] });
    expect((await runMaintenance({ now: at(11, 30, 8) })).ran).toBe(true);

    await record('2026-09-01'); // an old day appears after the first run
    expect(await runMaintenance({ now: at(11, 30, 20) })).toEqual({ ran: false, removedDays: 0 });
    expect(await listUsageDateKeys()).toContain('2026-09-01');
  });

  it('runs again the next day', async () => {
    await setup({ days: ['2026-11-30'] });
    await runMaintenance({ now: at(11, 30) });
    await record('2026-09-01');

    expect(await runMaintenance({ now: at(12, 1) })).toEqual({ ran: true, removedDays: 1 });
  });

  it('runs again when forced, even on the same day', async () => {
    await setup({ days: ['2026-11-30'] });
    await runMaintenance({ now: at(11, 30) });
    await record('2026-09-01');

    expect(await runMaintenance({ now: at(11, 30), force: true })).toEqual({
      ran: true,
      removedDays: 1,
    });
  });

  it('records the day it ran', async () => {
    const chromeMock = await setup();
    await runMaintenance({ now: at(11, 30) });
    const stored = await chromeMock.storage.local.get(MAINTENANCE_KEY);
    expect(stored[MAINTENANCE_KEY]).toEqual({ lastRunDate: '2026-11-30' });
  });

  it('follows a changed retention setting when forced', async () => {
    const chromeMock = await setup({ retentionDays: 365, days: ['2026-08-01', '2026-11-30'] });
    expect((await runMaintenance({ now: at(11, 30) })).removedDays).toBe(0);

    await chromeMock.storage.local.set({
      settings: { ...DEFAULT_SETTINGS, retentionDays: 30 },
    });
    expect(await runMaintenance({ now: at(11, 30), force: true })).toEqual({
      ran: true,
      removedDays: 1,
    });
    expect(await listUsageDateKeys()).toEqual(['2026-11-30']);
  });

  it('leaves goals, categories and settings alone', async () => {
    const chromeMock = await setup({ days: ['2026-01-01', '2026-11-30'] });
    await chromeMock.storage.local.set({
      goals: { dailyGoalMs: 3_600_000, siteLimits: {} },
      categoryOverrides: { 'a.com': 'news' },
    });

    await runMaintenance({ now: at(11, 30) });
    const data = await chromeMock.storage.local.get(null);
    expect(data.goals.dailyGoalMs).toBe(3_600_000);
    expect(data.categoryOverrides).toEqual({ 'a.com': 'news' });
    expect(data.settings.retentionDays).toBe(30);
  });

  it('deletes old focus days with the same retention, and keeps badges and best streaks', async () => {
    const chromeMock = await setup({ days: ['2026-11-30'] });
    await chromeMock.storage.local.set({
      'focusDay:2026-09-01': {
        date: '2026-09-01',
        sessions: 1,
        focusMs: 1_500_000,
        longestMs: 1_500_000,
      },
      'focusDay:2026-11-20': {
        date: '2026-11-20',
        sessions: 1,
        focusMs: 1_500_000,
        longestMs: 1_500_000,
      },
      achievements: {
        earned: { 'first-session': '2026-09-01' },
        best: { focus: 3, goal: 0 },
        days: { '2026-09-01': 'met' },
        lastClosed: '2026-09-01',
      },
    });

    await runMaintenance({ now: at(11, 30) });
    const data = await chromeMock.storage.local.get(null);
    expect(data['focusDay:2026-09-01']).toBeUndefined();
    expect(data['focusDay:2026-11-20']).toBeDefined();
    expect(data.achievements.earned).toEqual({ 'first-session': '2026-09-01' });
    expect(data.achievements.best.focus).toBe(3);
    expect(data.achievements.days).toEqual({});
  });

  it('works on an empty store', async () => {
    await setup();
    expect(await runMaintenance({ now: at(11, 30) })).toEqual({ ran: true, removedDays: 0 });
  });
});

beforeEach(() => vi.useRealTimers());
