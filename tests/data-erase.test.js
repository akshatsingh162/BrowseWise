import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { ERASE_SCOPES, eraseData, isEraseScope, requestErase } from '../src/shared/data-erase.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';
import { LATEST_SCHEMA_VERSION } from '../src/shared/storage/migrations.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';

const day = (date) => ({
  date,
  hourlyMs: new Array(24).fill(0),
  domainMs: { 'github.com': 60_000 },
});

const seed = () => ({
  meta: { schemaVersion: LATEST_SCHEMA_VERSION },
  settings: {
    ...DEFAULT_SETTINGS,
    idleThresholdSeconds: 300,
    retentionDays: 90,
    trackLocalHosts: false,
  },
  'usage:2026-11-05': day('2026-11-05'),
  'usage:2026-11-06': day('2026-11-06'),
  'tracker:state': { activeDomain: 'github.com', checkpointTs: 1 },
  categoryOverrides: { 'github.com': 'entertainment' },
  goals: { dailyGoalMs: 3_600_000, siteLimits: { 'youtube.com': 1_800_000 } },
  limitNotices: { dateKey: '2026-11-06', goal: true, domains: [] },
  maintenance: { lastRunDate: '2026-11-06' },
});

let chromeMock;
const stored = () => chromeMock.storage.local.get(null);

beforeEach(() => {
  chromeMock = createChromeMock(seed());
  vi.stubGlobal('chrome', chromeMock);
  vi.spyOn(console, 'debug').mockImplementation(() => {}); // the fallback logs at debug level
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('isEraseScope', () => {
  it('accepts exactly the two scopes', () => {
    expect(isEraseScope('history')).toBe(true);
    expect(isEraseScope('everything')).toBe(true);
    expect(ERASE_SCOPES).toEqual({ HISTORY: 'history', EVERYTHING: 'everything' });
    for (const value of ['', 'all', 'History', null, undefined, 1, {}]) {
      expect(isEraseScope(value)).toBe(false);
    }
  });
});

describe('eraseData: history', () => {
  it('removes recorded time and keeps settings, goals, limits and categories', async () => {
    await eraseData('history');
    const data = await stored();

    expect(Object.keys(data).filter((key) => key.startsWith('usage:'))).toEqual([]);
    expect(data.settings).toMatchObject({ idleThresholdSeconds: 300, retentionDays: 90 });
    expect(data.goals.dailyGoalMs).toBe(3_600_000);
    expect(data.categoryOverrides).toEqual({ 'github.com': 'entertainment' });
    expect(data.meta.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(data['tracker:state']).toBeDefined();
  });
});

describe('eraseData: focus data', () => {
  const withFocus = async () => {
    await chromeMock.storage.local.set({
      'focusDay:2026-11-05': {
        date: '2026-11-05',
        sessions: 2,
        focusMs: 3_000_000,
        longestMs: 1_500_000,
      },
      achievements: { earned: { 'first-session': '2026-11-05' } },
      focusState: {
        phase: 'focus',
        status: 'ready',
        durationMs: 1_500_000,
        remainingMs: 1_500_000,
        startedAt: null,
        endsAt: null,
        cycle: 0,
        sessionId: 'abc',
      },
    });
  };

  it('clears the focus history and achievements, but not a timer that is running now', async () => {
    await withFocus();
    await eraseData('history');
    const data = await stored();
    expect(data['focusDay:2026-11-05']).toBeUndefined();
    expect(data.achievements).toBeUndefined();
    expect(data.focusState).toMatchObject({ sessionId: 'abc' });
    expect(data.settings.idleThresholdSeconds).toBe(300); // settings stay
  });

  it('removes all of it, the timer included, when everything is deleted', async () => {
    await withFocus();
    await eraseData('everything');
    const data = await stored();
    expect(Object.keys(data).sort()).toEqual(['meta', 'settings']);
  });
});

describe('eraseData: everything', () => {
  it('clears all data and writes the defaults again', async () => {
    await eraseData('everything');
    const data = await stored();

    expect(Object.keys(data).sort()).toEqual(['meta', 'settings']);
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(data.meta).toEqual({ schemaVersion: LATEST_SCHEMA_VERSION });
  });

  it('leaves a working extension: reading settings gives the defaults', async () => {
    await eraseData('everything');
    const { getSettings } = await import('../src/shared/storage/settings-repo.js');
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS });
  });
});

describe('eraseData: bad input', () => {
  it('rejects an unknown scope and deletes nothing', async () => {
    const before = await stored();
    await expect(eraseData('everyting')).rejects.toThrow(RangeError);
    await expect(eraseData(undefined)).rejects.toThrow(RangeError);
    expect(await stored()).toEqual(before);
  });
});

describe('requestErase', () => {
  it('asks the worker first and does not erase itself when the worker did it', async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const erase = vi.fn();

    expect(await requestErase('history', { send, erase })).toEqual({ via: 'worker' });
    expect(send).toHaveBeenCalledWith({ type: MESSAGE_TYPES.ERASE_DATA, scope: 'history' });
    expect(erase).not.toHaveBeenCalled();
  });

  it('erases directly when the worker cannot be reached', async () => {
    const send = vi.fn(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const erase = vi.fn(async () => {});

    expect(await requestErase('everything', { send, erase })).toEqual({ via: 'direct' });
    expect(erase).toHaveBeenCalledWith('everything');
  });

  it('erases directly when nothing answers at all', async () => {
    const erase = vi.fn(async () => {});
    expect(await requestErase('history', { send: async () => undefined, erase })).toEqual({
      via: 'direct',
    });
    expect(erase).toHaveBeenCalledWith('history');
  });

  it('really erases through the direct fallback', async () => {
    await requestErase('history', {
      send: async () => {
        throw new Error('no worker');
      },
    });
    const data = await stored();
    expect(Object.keys(data).some((key) => key.startsWith('usage:'))).toBe(false);
    expect(data.goals).toBeDefined();
  });

  it('reports a failure the worker itself returns instead of trying again', async () => {
    const erase = vi.fn();
    await expect(
      requestErase('history', { send: async () => ({ ok: false, error: 'disk full' }), erase }),
    ).rejects.toThrow('disk full');
    expect(erase).not.toHaveBeenCalled();
  });

  it('rejects an invalid scope before sending anything', async () => {
    const send = vi.fn();
    await expect(requestErase('nothing', { send })).rejects.toThrow(RangeError);
    expect(send).not.toHaveBeenCalled();
  });
});
