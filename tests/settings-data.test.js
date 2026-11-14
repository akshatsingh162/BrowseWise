import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  collectExportData,
  countDaysToDelete,
  loadSettingsData,
} from '../src/dashboard/settings-data.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';
import { addUsage } from '../src/shared/storage/usage-repo.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime();
const add = (dateKey, domain, minutes) =>
  addUsage(domain, [{ dateKey, hour: 9, ms: minutes * MIN }]);

let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadSettingsData', () => {
  const deps = (overrides = {}) => ({
    hasPermission: async () => false,
    getUsage: async () => 4096,
    ...overrides,
  });

  it('gives the defaults and an empty summary on a fresh install', async () => {
    expect(await loadSettingsData(deps())).toEqual({
      settings: { ...DEFAULT_SETTINGS },
      summary: { dayCount: 0, firstKey: null, lastKey: null, bytesInUse: 4096 },
      notifications: { enabled: false, granted: false },
    });
  });

  it('summarises the recorded days', async () => {
    await add('2026-11-12', 'a.com', 1);
    await add('2026-10-01', 'a.com', 1);
    await add('2026-11-14', 'b.com', 1);

    const { summary } = await loadSettingsData(deps());
    expect(summary).toMatchObject({ dayCount: 3, firstKey: '2026-10-01', lastKey: '2026-11-14' });
  });

  it('reports stored settings and the notification permission', async () => {
    await chromeMock.storage.local.set({
      settings: { ...DEFAULT_SETTINGS, idleThresholdSeconds: 120, notificationsEnabled: true },
    });
    const data = await loadSettingsData(deps({ hasPermission: async () => true }));
    expect(data.settings.idleThresholdSeconds).toBe(120);
    expect(data.notifications).toEqual({ enabled: true, granted: true });
  });

  it('keeps going when the storage size is unavailable', async () => {
    const { summary } = await loadSettingsData(deps({ getUsage: async () => null }));
    expect(summary.bytesInUse).toBeNull();
  });
});

describe('collectExportData', () => {
  beforeEach(async () => {
    await add('2026-01-05', 'old.com', 1);
    await add('2026-09-01', 'mid.com', 2);
    await add('2026-11-01', 'new.com', 3);
    await add('2026-11-14', 'today.com', 4);
    await chromeMock.storage.local.set({
      categoryOverrides: { 'new.com': 'news' },
      goals: { dailyGoalMs: 3_600_000, siteLimits: { 'new.com': 600_000 } },
    });
  });

  const dates = async (rangeId) => (await collectExportData(rangeId, NOW)).days.map((d) => d.date);

  it('returns every day for all time', async () => {
    expect(await dates('all')).toEqual(['2026-01-05', '2026-09-01', '2026-11-01', '2026-11-14']);
  });

  it('limits the days to the chosen range, counting today', async () => {
    expect(await dates('30d')).toEqual(['2026-11-01', '2026-11-14']); // 16 Oct to 14 Nov
    expect(await dates('90d')).toEqual(['2026-09-01', '2026-11-01', '2026-11-14']);
    expect(await dates('365d')).toHaveLength(4);
  });

  it('includes categories, goals and settings', async () => {
    const data = await collectExportData('all', NOW);
    expect(data.categoryOverrides).toEqual({ 'new.com': 'news' });
    expect(data.goals.dailyGoalMs).toBe(3_600_000);
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('rejects an unknown range', async () => {
    await expect(collectExportData('week', NOW)).rejects.toThrow(RangeError);
  });
});

describe('countDaysToDelete', () => {
  it('counts the recorded days a shorter retention would remove', async () => {
    await add('2026-08-01', 'a.com', 1);
    await add('2026-10-20', 'a.com', 1);
    await add('2026-11-14', 'a.com', 1);

    // Keeping 30 days from 14 Nov means 16 Oct is the oldest day that stays.
    expect(await countDaysToDelete(30, NOW)).toBe(1);
    expect(await countDaysToDelete(90, NOW)).toBe(1);
    expect(await countDaysToDelete(365, NOW)).toBe(0);
    expect(await countDaysToDelete(7, NOW)).toBe(2);
  });

  it('is zero for an empty history', async () => {
    expect(await countDaysToDelete(7, NOW)).toBe(0);
  });
});
