import { describe, expect, it } from 'vitest';
import {
  MAX_LIMIT_MS,
  MAX_SITE_LIMITS,
  MIN_LIMIT_MS,
  computeLimitStatus,
  describeNotification,
  describeRemaining,
  findNewlyExceeded,
  isValidLimitMs,
  normalizeLimitDomain,
  parseDuration,
  sanitizeGoals,
  withSiteLimit,
} from '../src/shared/limits.js';

const MIN = 60_000;

describe('isValidLimitMs', () => {
  it('accepts 5 minutes up to 24 hours', () => {
    expect(isValidLimitMs(MIN_LIMIT_MS)).toBe(true);
    expect(isValidLimitMs(MAX_LIMIT_MS)).toBe(true);
    expect(isValidLimitMs(2 * 60 * MIN)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [0, 4 * MIN, MAX_LIMIT_MS + 1, -1, NaN, Infinity, '60000', null, undefined]) {
      expect(isValidLimitMs(bad)).toBe(false);
    }
  });
});

describe('sanitizeGoals', () => {
  it('keeps valid goals and limits', () => {
    expect(
      sanitizeGoals({ dailyGoalMs: 120 * MIN, siteLimits: { 'youtube.com': 30 * MIN } }),
    ).toEqual({
      dailyGoalMs: 120 * MIN,
      siteLimits: { 'youtube.com': 30 * MIN },
    });
  });

  it('drops invalid entries instead of clamping them', () => {
    expect(
      sanitizeGoals({
        dailyGoalMs: 1000,
        siteLimits: {
          'a.com': 1000,
          'b.com': 'x',
          'has space.com': 30 * MIN,
          '': 30 * MIN,
          'ok.com': 30 * MIN,
        },
      }),
    ).toEqual({ dailyGoalMs: null, siteLimits: { 'ok.com': 30 * MIN } });
  });

  it('rounds stored values to whole minutes', () => {
    expect(sanitizeGoals({ dailyGoalMs: 60 * MIN + 20_000 }).dailyGoalMs).toBe(60 * MIN);
  });

  it('treats missing or non-object input as no goals', () => {
    for (const bad of [null, undefined, 'x', 5, []]) {
      expect(sanitizeGoals(bad)).toEqual({ dailyGoalMs: null, siteLimits: {} });
    }
  });

  it(`keeps at most ${MAX_SITE_LIMITS} site limits`, () => {
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`s${i}.com`, 30 * MIN]));
    expect(Object.keys(sanitizeGoals({ siteLimits: many }).siteLimits)).toHaveLength(
      MAX_SITE_LIMITS,
    );
  });

  it('stores a hostile name such as __proto__ as an ordinary key', () => {
    const hostile = {};
    Object.defineProperty(hostile, '__proto__', { value: 30 * MIN, enumerable: true });
    const { siteLimits } = sanitizeGoals({ siteLimits: hostile });
    expect(Object.keys(siteLimits)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(siteLimits)).toBe(Object.prototype);
  });
});

describe('withSiteLimit', () => {
  it('adds, changes and removes without mutating the original', () => {
    const original = { 'a.com': 10 * MIN };
    const added = withSiteLimit(original, 'b.com', 20 * MIN);
    const changed = withSiteLimit(added, 'a.com', 15 * MIN);
    const removed = withSiteLimit(changed, 'b.com', null);
    expect(original).toEqual({ 'a.com': 10 * MIN });
    expect(added).toEqual({ 'a.com': 10 * MIN, 'b.com': 20 * MIN });
    expect(removed).toEqual({ 'a.com': 15 * MIN });
  });
});

describe('parseDuration', () => {
  it.each([
    [{ hours: '1', minutes: '30' }, 90 * MIN],
    [{ hours: 2, minutes: 0 }, 120 * MIN],
    [{ hours: '', minutes: '45' }, 45 * MIN],
    [{ hours: '3', minutes: '' }, 180 * MIN],
    [{ hours: '0', minutes: '5' }, 5 * MIN],
    [{ hours: '24', minutes: '0' }, MAX_LIMIT_MS],
  ])('accepts %j', (input, ms) => {
    expect(parseDuration(input)).toEqual({ ok: true, ms });
  });

  it.each([
    [{ hours: '', minutes: '' }, 'Choose at least 5 minutes.'],
    [{ hours: '0', minutes: '4' }, 'Choose at least 5 minutes.'],
    [{ hours: '24', minutes: '1' }, 'Choose 24 hours or less.'],
    [{ hours: '25', minutes: '0' }, 'Choose 24 hours or less.'],
    [{ hours: '1', minutes: '60' }, 'Minutes must be between 0 and 59.'],
    [{ hours: '1.5', minutes: '0' }, 'Use whole numbers for hours and minutes.'],
    [{ hours: '-1', minutes: '30' }, 'Use whole numbers for hours and minutes.'],
    [{ hours: 'abc', minutes: '0' }, 'Use whole numbers for hours and minutes.'],
  ])('rejects %j with a clear message', (input, error) => {
    expect(parseDuration(input)).toEqual({ ok: false, error });
  });
});

describe('normalizeLimitDomain', () => {
  it.each([
    ['youtube.com', 'youtube.com'],
    ['  YouTube.com  ', 'youtube.com'],
    ['www.reddit.com/r/programming', 'reddit.com'],
    ['https://www.YouTube.com/watch?v=1', 'youtube.com'],
    ['http://mail.google.com/mail', 'mail.google.com'],
    ['localhost:3000', 'localhost'],
    ['192.168.0.10', '192.168.0.10'],
  ])('turns %s into %s', (input, domain) => {
    expect(normalizeLimitDomain(input)).toEqual({ ok: true, domain });
  });

  it('asks for a website when empty', () => {
    expect(normalizeLimitDomain('')).toEqual({
      ok: false,
      error: 'Enter a website, for example youtube.com.',
    });
    expect(normalizeLimitDomain(undefined).ok).toBe(false);
  });

  it.each([
    'notawebsite',
    'chrome://extensions',
    'javascript:alert(1)',
    'a b.com',
    'file:///C:/x.txt',
  ])('rejects %s', (input) => {
    expect(normalizeLimitDomain(input)).toEqual({
      ok: false,
      error: 'That does not look like a website address.',
    });
  });
});

describe('computeLimitStatus', () => {
  const goals = {
    dailyGoalMs: 120 * MIN,
    siteLimits: { 'youtube.com': 30 * MIN, 'reddit.com': 20 * MIN },
  };

  it('compares today\u2019s usage with the goal and each limit', () => {
    const status = computeLimitStatus(goals, {
      'youtube.com': 25 * MIN,
      'github.com': 60 * MIN,
      'reddit.com': 5 * MIN,
    });
    expect(status.usedToday).toBe(90 * MIN);
    expect(status.goal).toMatchObject({
      limitMs: 120 * MIN,
      usedMs: 90 * MIN,
      remainingMs: 30 * MIN,
      level: 'ok',
    });
    expect(status.sites.map((s) => [s.domain, s.level])).toEqual([
      ['youtube.com', 'warning'], // 25 of 30 minutes is 83%
      ['reddit.com', 'ok'],
    ]);
  });

  it('switches level exactly at 80% and at the limit', () => {
    const level = (used) =>
      computeLimitStatus({ dailyGoalMs: 100 * MIN, siteLimits: {} }, { a: used * MIN }).goal.level;
    expect(level(79)).toBe('ok');
    expect(level(80)).toBe('warning');
    expect(level(99)).toBe('warning');
    expect(level(100)).toBe('exceeded');
    expect(level(130)).toBe('exceeded');
  });

  it('reports time left and time over', () => {
    const over = computeLimitStatus(
      { dailyGoalMs: 60 * MIN, siteLimits: {} },
      { a: 85 * MIN },
    ).goal;
    expect(over).toMatchObject({ remainingMs: 0, overMs: 25 * MIN, level: 'exceeded' });
    expect(over.share).toBeCloseTo(85 / 60);
  });

  it('sorts limits closest to (or past) their limit first, then by name', () => {
    const status = computeLimitStatus(
      {
        dailyGoalMs: null,
        siteLimits: { 'a.com': 60 * MIN, 'b.com': 60 * MIN, 'c.com': 60 * MIN },
      },
      { 'a.com': 10 * MIN, 'b.com': 50 * MIN, 'c.com': 10 * MIN },
    );
    expect(status.sites.map((s) => s.domain)).toEqual(['b.com', 'a.com', 'c.com']);
  });

  it('handles no goal, no limits, unused websites, and hostile names', () => {
    expect(computeLimitStatus({ dailyGoalMs: null, siteLimits: {} }, {}).goal).toBeNull();
    const unused = computeLimitStatus({ dailyGoalMs: null, siteLimits: { 'x.com': 30 * MIN } }, {});
    expect(unused.sites[0]).toMatchObject({ usedMs: 0, level: 'ok' });
    const hostile = computeLimitStatus(
      { dailyGoalMs: null, siteLimits: { constructor: 30 * MIN } },
      {},
    );
    expect(hostile.sites[0].usedMs).toBe(0);
  });
});

describe('describeRemaining', () => {
  const entry = (usedMin, limitMin) =>
    computeLimitStatus({ dailyGoalMs: limitMin * MIN, siteLimits: {} }, { a: usedMin * MIN }).goal;

  it('says how much is left, when the limit was reached, and how far over', () => {
    expect(describeRemaining(entry(20, 60))).toBe('40m left');
    expect(describeRemaining(entry(60, 60))).toBe('Limit reached');
    expect(describeRemaining(entry(85, 60))).toBe('Over by 25m');
    expect(describeRemaining(entry(30, 150))).toBe('2h 00m left');
  });
});

describe('findNewlyExceeded', () => {
  const status = computeLimitStatus(
    {
      // The three sites add up to 32 minutes, so a 30-minute goal is exceeded.
      dailyGoalMs: 30 * MIN,
      siteLimits: { 'a.com': 10 * MIN, 'b.com': 10 * MIN, 'c.com': 100 * MIN },
    },
    { 'a.com': 15 * MIN, 'b.com': 12 * MIN, 'c.com': 5 * MIN },
  );
  const none = { goal: false, domains: [] };

  it('lists every exceeded goal or limit not yet notified', () => {
    const pending = findNewlyExceeded(status, none);
    expect(pending.map((p) => [p.type, p.domain ?? null])).toEqual([
      ['goal', null],
      ['site', 'a.com'],
      ['site', 'b.com'],
    ]);
  });

  it('skips the ones already notified today', () => {
    const pending = findNewlyExceeded(status, { goal: true, domains: ['a.com'] });
    expect(pending.map((p) => p.domain)).toEqual(['b.com']);
  });

  it('is empty when nothing is exceeded', () => {
    const fine = computeLimitStatus({ dailyGoalMs: 600 * MIN, siteLimits: {} }, { a: MIN });
    expect(findNewlyExceeded(fine, none)).toEqual([]);
  });
});

describe('describeNotification', () => {
  it('words a goal notification neutrally, with the numbers', () => {
    const { title, message } = describeNotification({
      type: 'goal',
      usedMs: 125 * MIN,
      limitMs: 120 * MIN,
    });
    expect(title).toBe('Daily goal reached');
    expect(message).toBe('You have spent 2h 05m browsing today. Your goal was 2h 00m.');
  });

  it('words a website notification with the site name', () => {
    const { title, message } = describeNotification({
      type: 'site',
      domain: 'youtube.com',
      usedMs: 31 * MIN,
      limitMs: 30 * MIN,
    });
    expect(title).toBe('youtube.com limit reached');
    expect(message).toBe('You have spent 31m on youtube.com today. Your limit was 30m.');
  });
});
