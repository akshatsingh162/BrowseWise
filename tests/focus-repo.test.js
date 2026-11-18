import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  clearFocusHistory,
  emptyFocusDay,
  focusDayKey,
  getAchievements,
  getAllFocusDays,
  getFocusDay,
  getFocusState,
  listFocusDateKeys,
  pruneFocusDaysBefore,
  sanitizeFocusDay,
  subscribeToFocusChanges,
} from '../src/shared/storage/focus-repo.js';
import { createPhase, startPhase } from '../src/shared/focus.js';

const MIN = 60_000;
const day = (date, sessions = 1) => ({
  date,
  sessions,
  focusMs: sessions * 25 * MIN,
  longestMs: 25 * MIN,
});
let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sanitizeFocusDay', () => {
  it('keeps sensible numbers', () => {
    expect(
      sanitizeFocusDay({ sessions: 3, focusMs: 4_500_000, longestMs: 1_500_000 }, '2026-11-07'),
    ).toEqual({
      date: '2026-11-07',
      sessions: 3,
      focusMs: 4_500_000,
      longestMs: 1_500_000,
    });
  });

  it.each([null, undefined, 'x', 5, []])('returns an empty day for %j', (raw) => {
    expect(sanitizeFocusDay(raw, '2026-11-07')).toEqual(emptyFocusDay('2026-11-07'));
  });

  it('replaces impossible numbers with zero', () => {
    expect(sanitizeFocusDay({ sessions: -1, focusMs: NaN, longestMs: 1e15 }, '2026-11-07')).toEqual(
      emptyFocusDay('2026-11-07'),
    );
    expect(sanitizeFocusDay({ sessions: '3' }, '2026-11-07').sessions).toBe(0);
  });

  it('uses the key as the date, whatever the record says', () => {
    expect(sanitizeFocusDay({ date: '1999-01-01', sessions: 1 }, '2026-11-07').date).toBe(
      '2026-11-07',
    );
  });
});

describe('reading', () => {
  it('has no timer by default, and ignores a corrupt one', async () => {
    expect(await getFocusState()).toBeNull();
    await chromeMock.storage.local.set({ focusState: { phase: 'nap' } });
    expect(await getFocusState()).toBeNull();
  });

  it('reads a stored timer', async () => {
    const state = startPhase(
      createPhase({ phase: 'focus', durationMs: 25 * MIN, sessionId: 'abc' }),
      1000,
    );
    await chromeMock.storage.local.set({ focusState: state });
    expect(await getFocusState()).toEqual(state);
  });

  it('treats an explicit null as no timer', async () => {
    await chromeMock.storage.local.set({ focusState: null });
    expect(await getFocusState()).toBeNull();
  });

  it('returns a single day, empty if there is none', async () => {
    expect(await getFocusDay('2026-11-07')).toEqual(emptyFocusDay('2026-11-07'));
    await chromeMock.storage.local.set({ [focusDayKey('2026-11-07')]: day('2026-11-07', 2) });
    expect((await getFocusDay('2026-11-07')).sessions).toBe(2);
  });

  it('lists days oldest first and skips empty, malformed and unrelated keys', async () => {
    await chromeMock.storage.local.set({
      [focusDayKey('2026-11-09')]: day('2026-11-09'),
      [focusDayKey('2026-11-02')]: day('2026-11-02', 3),
      [focusDayKey('2026-11-05')]: day('2026-11-05', 0),
      'focusDay:not-a-date': day('x'),
      'usage:2026-11-03': { date: '2026-11-03', hourlyMs: [], domainMs: {} },
    });
    expect((await getAllFocusDays()).map((d) => d.date)).toEqual(['2026-11-02', '2026-11-09']);
    expect(await listFocusDateKeys()).toEqual(['2026-11-02', '2026-11-09']);
  });

  it('returns clean achievements even from damaged data', async () => {
    await chromeMock.storage.local.set({
      achievements: { earned: { nope: '2026-11-01' }, best: 'x' },
    });
    expect(await getAchievements()).toEqual({
      earned: {},
      best: { focus: 0, goal: 0 },
      days: {},
      lastClosed: null,
    });
  });
});

describe('pruneFocusDaysBefore', () => {
  it('deletes older focus days and old goal results, but keeps badges and best streaks', async () => {
    await chromeMock.storage.local.set({
      [focusDayKey('2026-10-01')]: day('2026-10-01'),
      [focusDayKey('2026-11-01')]: day('2026-11-01'),
      achievements: {
        earned: { 'first-session': '2026-10-01' },
        best: { focus: 9, goal: 4 },
        days: { '2026-10-01': 'met', '2026-11-01': 'over' },
        lastClosed: '2026-11-01',
      },
      'usage:2026-10-01': { date: '2026-10-01', hourlyMs: [], domainMs: {} },
    });

    expect(await pruneFocusDaysBefore('2026-10-20')).toBe(1);
    const data = await chromeMock.storage.local.get(null);
    expect(data[focusDayKey('2026-10-01')]).toBeUndefined();
    expect(data[focusDayKey('2026-11-01')]).toBeDefined();
    expect(data.achievements.days).toEqual({ '2026-11-01': 'over' });
    expect(data.achievements.earned).toEqual({ 'first-session': '2026-10-01' });
    expect(data.achievements.best).toEqual({ focus: 9, goal: 4 });
    expect(data['usage:2026-10-01']).toBeDefined(); // browsing time is not its business
  });

  it('does nothing, and writes nothing, when nothing is old', async () => {
    await chromeMock.storage.local.set({ [focusDayKey('2026-11-01')]: day('2026-11-01') });
    const set = vi.spyOn(chromeMock.storage.local, 'set');
    expect(await pruneFocusDaysBefore('2026-10-01')).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('clearFocusHistory', () => {
  it('removes every day and the achievements, but not the running timer or browsing time', async () => {
    await chromeMock.storage.local.set({
      [focusDayKey('2026-11-01')]: day('2026-11-01'),
      [focusDayKey('2026-11-02')]: day('2026-11-02'),
      achievements: { earned: { 'first-session': '2026-11-01' } },
      focusState: createPhase({ phase: 'focus', durationMs: 25 * MIN, sessionId: 'abc' }),
      'usage:2026-11-01': { date: '2026-11-01', hourlyMs: [], domainMs: {} },
      goals: { dailyGoalMs: 1, siteLimits: {} },
    });

    await clearFocusHistory();
    const keys = Object.keys(await chromeMock.storage.local.get(null)).sort();
    expect(keys).toEqual(['focusState', 'goals', 'usage:2026-11-01']);
  });
});

describe('subscribeToFocusChanges', () => {
  function stubOnChanged() {
    const listeners = new Set();
    chromeMock.storage.onChanged = {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    };
    return {
      emit: (changes, area = 'local') => listeners.forEach((fn) => fn(changes, area)),
      listeners,
    };
  }

  it('calls back (once, debounced) for the timer, a focus day, or achievements', async () => {
    vi.useFakeTimers();
    const { emit } = stubOnChanged();
    const callback = vi.fn();
    subscribeToFocusChanges(callback, { debounceMs: 100 });

    emit({ focusState: {} });
    emit({ 'focusDay:2026-11-07': {} });
    emit({ achievements: {} });
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('ignores browsing time, settings and other storage areas', () => {
    vi.useFakeTimers();
    const { emit } = stubOnChanged();
    const callback = vi.fn();
    subscribeToFocusChanges(callback, { debounceMs: 10 });

    emit({ 'usage:2026-11-07': {} });
    emit({ settings: {} });
    emit({ focusState: {} }, 'sync');
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('stops listening and cancels a pending call when unsubscribed', () => {
    vi.useFakeTimers();
    const { emit, listeners } = stubOnChanged();
    const callback = vi.fn();
    const unsubscribe = subscribeToFocusChanges(callback, { debounceMs: 100 });

    emit({ focusState: {} });
    unsubscribe();
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });
});
