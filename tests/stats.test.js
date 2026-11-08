import { describe, expect, it } from 'vitest';
import { buildOverview, msUpToTimeOfDay, rankDomains, totalMs } from '../src/shared/stats.js';

const MIN = 60_000;

function day(domainMs, hourly = {}) {
  const hourlyMs = new Array(24).fill(0);
  for (const [hour, ms] of Object.entries(hourly)) hourlyMs[Number(hour)] = ms;
  return { date: '2026-11-07', hourlyMs, domainMs };
}

describe('totalMs and rankDomains', () => {
  it('sums all domains', () => {
    expect(totalMs(day({ 'a.com': 5 * MIN, 'b.com': 10 * MIN }))).toBe(15 * MIN);
    expect(totalMs(day({}))).toBe(0);
  });

  it('ranks from most to least used with shares that add up to 1', () => {
    const ranked = rankDomains(day({ 'a.com': 10 * MIN, 'b.com': 30 * MIN, 'c.com': 20 * MIN }));
    expect(ranked.map((r) => r.domain)).toEqual(['b.com', 'c.com', 'a.com']);
    expect(ranked.map((r) => r.share)).toEqual([0.5, 1 / 3, 1 / 6]);
    expect(ranked.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1);
  });

  it('breaks ties alphabetically for a stable order', () => {
    const ranked = rankDomains(day({ 'z.com': MIN, 'a.com': MIN, 'm.com': MIN }));
    expect(ranked.map((r) => r.domain)).toEqual(['a.com', 'm.com', 'z.com']);
  });

  it('ignores zero-time domains and handles an empty day', () => {
    expect(rankDomains(day({ 'a.com': 0 }))).toEqual([]);
    expect(rankDomains(day({}))).toEqual([]);
  });
});

describe('msUpToTimeOfDay', () => {
  const yesterday = day({}, { 8: 10 * MIN, 9: 20 * MIN, 10: 40 * MIN, 14: 50 * MIN });
  const at = (h, m = 0, s = 0) => new Date(2026, 10, 7, h, m, s).getTime();

  it('counts whole earlier hours fully', () => {
    expect(msUpToTimeOfDay(yesterday, at(10, 0))).toBe(30 * MIN);
  });

  it('counts the current hour in proportion to how much has elapsed', () => {
    expect(msUpToTimeOfDay(yesterday, at(10, 30))).toBe(30 * MIN + 20 * MIN);
    expect(msUpToTimeOfDay(yesterday, at(10, 15))).toBe(30 * MIN + 10 * MIN);
  });

  it('excludes later hours', () => {
    expect(msUpToTimeOfDay(yesterday, at(12, 0))).toBe(70 * MIN);
  });

  it('is zero at midnight and the full total at the end of the day', () => {
    expect(msUpToTimeOfDay(yesterday, at(0, 0))).toBe(0);
    expect(msUpToTimeOfDay(yesterday, at(23, 59, 59))).toBeCloseTo(120 * MIN, -3);
  });
});

describe('buildOverview', () => {
  const now = new Date(2026, 10, 7, 12, 0, 0).getTime();

  it('summarises today and compares with yesterday at the same time of day', () => {
    const today = day({ 'a.com': 40 * MIN, 'b.com': 20 * MIN }, { 9: 60 * MIN });
    const yesterday = day({ 'a.com': 100 * MIN }, { 9: 30 * MIN, 11: 30 * MIN, 15: 40 * MIN });

    const overview = buildOverview({ today, yesterday, now });

    expect(overview.totalMs).toBe(60 * MIN);
    expect(overview.siteCount).toBe(2);
    expect(overview.topSite).toEqual({ domain: 'a.com', ms: 40 * MIN, share: 40 / 60 });
    expect(overview.comparison.yesterdayMs).toBe(60 * MIN); // the 15:00 hour is excluded
    expect(overview.comparison.deltaMs).toBe(0);
    expect(overview.comparison.deltaPct).toBe(0);
  });

  it('has no percentage when yesterday had nothing by now', () => {
    const overview = buildOverview({
      today: day({ 'a.com': 5 * MIN }),
      yesterday: day({}),
      now,
    });
    expect(overview.comparison.deltaPct).toBeNull();
    expect(overview.comparison.deltaMs).toBe(5 * MIN);
  });

  it('handles an entirely empty day', () => {
    const overview = buildOverview({ today: day({}), yesterday: day({}), now });
    expect(overview.totalMs).toBe(0);
    expect(overview.siteCount).toBe(0);
    expect(overview.topSite).toBeNull();
    expect(overview.ranked).toEqual([]);
  });
});
