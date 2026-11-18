import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { loadFocusData } from '../src/dashboard/focus-data.js';
import { BADGES } from '../src/shared/achievements.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';

const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime(); // Sunday 15 November 2026
const day = (date, sessions, minutes = 25) => ({
  date,
  sessions,
  focusMs: sessions * minutes * 60_000,
  longestMs: minutes * 60_000,
});

let chromeMock;
const seed = (data) => chromeMock.storage.local.set(data);

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadFocusData', () => {
  it('gives an empty, ready picture for a fresh install', async () => {
    const data = await loadFocusData(NOW);
    expect(data.state).toBeNull();
    expect(data.todayKey).toBe('2026-11-15');
    expect(data.today).toEqual({ sessions: 0, focusMs: 0 });
    expect(data.allTime).toEqual({ sessions: 0, focusMs: 0 });
    expect(data.streaks).toEqual({ focus: { current: 0, best: 0 }, goal: { current: 0, best: 0 } });
    expect(data.settings).toMatchObject({
      focusMinutes: 25,
      longBreakEvery: 4,
      showAchievements: true,
    });
    expect(data.badges).toHaveLength(BADGES.length);
    expect(data.badges.every((item) => item.earnedOn === null)).toBe(true);
  });

  it("adds up today's sessions and all-time totals", async () => {
    await seed({
      'focusDay:2026-11-15': day('2026-11-15', 2),
      'focusDay:2026-11-14': day('2026-11-14', 3),
    });
    const data = await loadFocusData(NOW);
    expect(data.today).toEqual({ sessions: 2, focusMs: 50 * 60_000 });
    expect(data.allTime).toEqual({ sessions: 5, focusMs: 125 * 60_000 });
  });

  it('returns exactly seven days ending today, with zero for days without sessions', async () => {
    await seed({
      'focusDay:2026-11-13': day('2026-11-13', 4),
      'focusDay:2026-11-15': day('2026-11-15', 1),
    });
    const { week } = await loadFocusData(NOW);
    expect(week.map((entry) => entry.dateKey)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week.map((entry) => entry.sessions)).toEqual([0, 0, 0, 0, 4, 0, 1]);
  });

  it('works out the focus streak, keeping it alive when today has no session yet', async () => {
    await seed({
      'focusDay:2026-11-12': day('2026-11-12', 1),
      'focusDay:2026-11-13': day('2026-11-13', 1),
      'focusDay:2026-11-14': day('2026-11-14', 1),
    });
    expect((await loadFocusData(NOW)).streaks.focus).toEqual({ current: 3, best: 3 });
  });

  it('reads the goal streak from the recorded results, and keeps the stored best', async () => {
    await seed({
      achievements: {
        earned: {},
        best: { focus: 9, goal: 12 },
        days: { '2026-11-12': 'met', '2026-11-13': 'met', '2026-11-14': 'met' },
        lastClosed: '2026-11-14',
      },
    });
    const { streaks } = await loadFocusData(NOW);
    expect(streaks.goal).toEqual({ current: 3, best: 12 });
    expect(streaks.focus.best).toBe(9); // survives even when the days themselves are gone
  });

  it('marks earned badges with their date, and gives progress for the rest', async () => {
    await seed({
      'focusDay:2026-11-14': day('2026-11-14', 7),
      achievements: {
        earned: { 'first-session': '2026-11-10' },
        best: { focus: 0, goal: 0 },
        days: {},
        lastClosed: null,
      },
    });
    const { badges } = await loadFocusData(NOW);
    const byId = Object.fromEntries(badges.map((item) => [item.badge.id, item]));
    expect(byId['first-session'].earnedOn).toBe('2026-11-10');
    expect(byId['sessions-10'].earnedOn).toBeNull();
    expect(byId['sessions-10'].progress).toEqual({ current: 7, target: 10, fraction: 0.7 });
  });

  it('includes the timer and the settings the page needs', async () => {
    await seed({
      settings: { ...DEFAULT_SETTINGS, focusMinutes: 50, showAchievements: false },
      focusState: {
        phase: 'focus',
        status: 'ready',
        durationMs: 3_000_000,
        remainingMs: 3_000_000,
        startedAt: null,
        endsAt: null,
        cycle: 0,
        sessionId: 'abc',
      },
    });
    const data = await loadFocusData(NOW);
    expect(data.state).toMatchObject({ sessionId: 'abc' });
    expect(data.settings).toMatchObject({ focusMinutes: 50, showAchievements: false });
  });

  it('can be sent over a message and compared, because it is plain data', async () => {
    const data = await loadFocusData(NOW);
    expect(JSON.parse(JSON.stringify(data))).toEqual(
      JSON.parse(JSON.stringify(await loadFocusData(NOW))),
    );
  });
});
