// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  BADGES,
  GOAL_RESULTS,
  TIERS,
  badgeProgress,
  badgeStats,
  focusTotals,
  goalStreaks,
  newlyEarned,
  sanitizeAchievements,
  streaksFromDays,
} from '../src/shared/achievements.js';
import { icon } from '../src/ui/icons.js';

const TODAY = '2026-11-15';
const day = (date, sessions, minutes = 25, longest = minutes) => ({
  date,
  sessions,
  focusMs: sessions * minutes * 60_000,
  longestMs: longest * 60_000,
});

describe('badge list', () => {
  it('has unique ids, real tiers, positive targets and wording for every badge', () => {
    const ids = BADGES.map((badge) => badge.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const badge of BADGES) {
      expect(Object.values(TIERS)).toContain(badge.tier);
      expect(badge.target).toBeGreaterThan(0);
      expect(badge.title.length).toBeGreaterThan(2);
      expect(badge.description.endsWith('.')).toBe(true);
    }
  });

  it('uses only icons that are registered', () => {
    for (const badge of BADGES) expect(() => icon(badge.icon)).not.toThrow();
  });

  it('measures every badge against a statistic that exists', () => {
    const stats = badgeStats({
      totals: focusTotals([], TODAY),
      goal: { best: 0 },
      best: { focus: 0, goal: 0 },
    });
    for (const badge of BADGES) expect(stats).toHaveProperty(badge.stat);
  });

  it('never rewards using the browser more or less', () => {
    const text = BADGES.map((badge) => `${badge.title} ${badge.description}`.toLowerCase()).join(
      ' ',
    );
    expect(text).not.toMatch(/less (screen|browsing)|fewer hours|detox|addict/);
  });

  it('is frozen, so nothing can edit a badge at run time', () => {
    expect(Object.isFrozen(BADGES)).toBe(true);
    expect(Object.isFrozen(BADGES[0])).toBe(true);
  });
});

describe('streaksFromDays', () => {
  it('is zero with no days', () => {
    expect(streaksFromDays([], TODAY)).toEqual({ current: 0, best: 0 });
  });

  it('counts a run that ends today', () => {
    expect(streaksFromDays(['2026-11-13', '2026-11-14', '2026-11-15'], TODAY)).toEqual({
      current: 3,
      best: 3,
    });
  });

  it('keeps a run alive when today has no session yet, because the day is not over', () => {
    expect(streaksFromDays(['2026-11-12', '2026-11-13', '2026-11-14'], TODAY)).toEqual({
      current: 3,
      best: 3,
    });
  });

  it('ends the current run after a whole missed day, but remembers the best', () => {
    expect(
      streaksFromDays(
        ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-14'],
        TODAY,
      ),
    ).toEqual({
      current: 1,
      best: 4,
    });
    expect(streaksFromDays(['2026-11-10', '2026-11-11'], TODAY)).toEqual({ current: 0, best: 2 });
  });

  it('does not need sorted input and ignores duplicates', () => {
    expect(
      streaksFromDays(['2026-11-15', '2026-11-13', '2026-11-14', '2026-11-14'], TODAY).current,
    ).toBe(3);
  });

  it('runs across month and year boundaries', () => {
    expect(
      streaksFromDays(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'], '2027-01-02')
        .current,
    ).toBe(4);
    expect(streaksFromDays(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').best).toBe(3); // leap day
  });
});

describe('goalStreaks', () => {
  const M = GOAL_RESULTS.MET;
  const O = GOAL_RESULTS.OVER;
  const K = GOAL_RESULTS.SKIPPED;

  it('counts days within the goal, and going over ends the run', () => {
    expect(
      goalStreaks(
        { '2026-11-10': M, '2026-11-11': M, '2026-11-12': O, '2026-11-13': M, '2026-11-14': M },
        TODAY,
      ),
    ).toEqual({
      current: 2,
      best: 2,
    });
  });

  it('skips days without data or without a goal instead of breaking the run', () => {
    expect(
      goalStreaks({ '2026-11-10': M, '2026-11-11': K, '2026-11-12': M, '2026-11-13': K }, TODAY),
    ).toEqual({
      current: 2,
      best: 2,
    });
  });

  it('does not count today, which is not finished', () => {
    expect(goalStreaks({ '2026-11-14': M, [TODAY]: M }, TODAY)).toEqual({ current: 1, best: 1 });
  });

  it('does not reward a long run of days with nothing recorded', () => {
    const skipped = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, K]),
    );
    expect(goalStreaks(skipped, TODAY)).toEqual({ current: 0, best: 0 });
  });

  it('is zero with no results', () => {
    expect(goalStreaks({}, TODAY)).toEqual({ current: 0, best: 0 });
  });
});

describe('sanitizeAchievements', () => {
  it('returns an empty record for anything that is not an object', () => {
    for (const raw of [null, undefined, 'x', 5, []]) {
      expect(sanitizeAchievements(raw)).toEqual({
        earned: {},
        best: { focus: 0, goal: 0 },
        days: {},
        lastClosed: null,
      });
    }
  });

  it('keeps valid entries', () => {
    const raw = {
      earned: { 'first-session': '2026-11-01' },
      best: { focus: 5, goal: 2 },
      days: { '2026-11-01': 'met', '2026-11-02': 'over', '2026-11-03': 'skipped' },
      lastClosed: '2026-11-03',
    };
    expect(sanitizeAchievements(raw)).toEqual(raw);
  });

  it('drops unknown badges, bad dates and bad results', () => {
    const cleaned = sanitizeAchievements({
      earned: { 'made-up': '2026-11-01', 'first-session': 'yesterday', 'hours-1': '2026-11-01' },
      days: { today: 'met', '2026-11-01': 'great', '2026-11-02': 'met' },
      lastClosed: 'never',
    });
    expect(cleaned.earned).toEqual({ 'hours-1': '2026-11-01' });
    expect(cleaned.days).toEqual({ '2026-11-02': 'met' });
    expect(cleaned.lastClosed).toBeNull();
  });

  it('rejects absurd counts', () => {
    const cleaned = sanitizeAchievements({ best: { focus: -1, goal: 1e12 } });
    expect(cleaned.best).toEqual({ focus: 0, goal: 0 });
    expect(sanitizeAchievements({ best: { focus: 1.5 } }).best.focus).toBe(0);
  });

  it('is not affected by hostile keys', () => {
    const hostile = JSON.parse(
      '{"earned":{"__proto__":"2026-11-01","constructor":"2026-11-01"},"days":{"__proto__":"met"}}',
    );
    const cleaned = sanitizeAchievements(hostile);
    expect(Object.getPrototypeOf(cleaned.earned)).toBe(Object.prototype);
    expect(cleaned.earned).toEqual({});
    expect(cleaned.days).toEqual({});
    expect({}.met).toBeUndefined();
  });
});

describe('focusTotals', () => {
  it('adds up sessions and time and finds the best day and longest session', () => {
    const totals = focusTotals(
      [day('2026-11-13', 2, 25), day('2026-11-14', 5, 25, 50), day('2026-11-15', 1, 45)],
      TODAY,
    );
    expect(totals).toMatchObject({
      totalSessions: 8,
      totalFocusMs: (2 * 25 + 5 * 25 + 45) * 60_000,
      bestDaySessions: 5,
      longestSessionMs: 50 * 60_000,
      currentFocusStreak: 3,
      bestFocusStreak: 3,
    });
  });

  it('ignores days with no sessions', () => {
    expect(focusTotals([day('2026-11-14', 0)], TODAY)).toMatchObject({
      totalSessions: 0,
      bestFocusStreak: 0,
    });
  });
});

describe('badgeStats and newlyEarned', () => {
  const totals = focusTotals([day('2026-11-14', 3), day('2026-11-15', 4, 45)], TODAY);
  const stats = badgeStats({ totals, goal: { best: 0 }, best: { focus: 0, goal: 0 } });

  it('converts to hours and minutes', () => {
    expect(stats.totalFocusHours).toBeCloseTo((3 * 25 + 4 * 45) / 60);
    expect(stats.longestSessionMinutes).toBe(45);
    expect(stats.bestDaySessions).toBe(4);
  });

  it('awards the badges whose targets are reached, and only those', () => {
    const ids = newlyEarned(stats, {}).map((badge) => badge.id);
    expect(ids).toEqual(
      expect.arrayContaining(['first-session', 'hours-1', 'full-set', 'long-haul']),
    );
    expect(ids).not.toContain('sessions-10'); // only 7 sessions
    expect(ids).not.toContain('streak-3'); // only 2 days
    expect(ids).not.toContain('hours-10');
  });

  it('does not award a badge twice', () => {
    const earned = { 'first-session': '2026-11-01' };
    expect(newlyEarned(stats, earned).map((badge) => badge.id)).not.toContain('first-session');
  });

  it('keeps a streak badge reachable after old days were deleted, using the stored best', () => {
    const afterPrune = badgeStats({
      totals: focusTotals([day('2026-11-15', 1)], TODAY),
      goal: { best: 0 },
      best: { focus: 7, goal: 0 },
    });
    expect(newlyEarned(afterPrune, {}).map((badge) => badge.id)).toEqual(
      expect.arrayContaining(['streak-3', 'streak-7']),
    );
  });

  it('awards a goal-streak badge from the best goal streak', () => {
    const goalStats = badgeStats({
      totals: focusTotals([], TODAY),
      goal: { best: 7 },
      best: { focus: 0, goal: 0 },
    });
    expect(newlyEarned(goalStats, {}).map((badge) => badge.id)).toEqual(['goal-7']);
  });
});

describe('badgeProgress', () => {
  it('reports how close a locked badge is, never past its target', () => {
    const badge = BADGES.find((candidate) => candidate.id === 'sessions-50');
    expect(badgeProgress(badge, { totalSessions: 20 })).toEqual({
      current: 20,
      target: 50,
      fraction: 0.4,
    });
    expect(badgeProgress(badge, { totalSessions: 80 }).fraction).toBe(1);
    expect(badgeProgress(badge, {}).current).toBe(0);
  });
});
