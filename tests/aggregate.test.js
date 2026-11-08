import { describe, expect, it } from 'vitest';
import { averageDailyMs, mergeDays } from '../src/shared/aggregate.js';

const MIN = 60_000;

function day(domainMs, hourly = {}) {
  const hourlyMs = new Array(24).fill(0);
  for (const [hour, ms] of Object.entries(hourly)) hourlyMs[Number(hour)] = ms;
  return { date: '2026-11-07', hourlyMs, domainMs };
}

describe('mergeDays', () => {
  it('sums domains and hours across days', () => {
    const merged = mergeDays([
      day({ 'a.com': 10 * MIN, 'b.com': 5 * MIN }, { 9: 15 * MIN }),
      day({ 'a.com': 20 * MIN, 'c.com': 1 * MIN }, { 9: 11 * MIN, 10: 10 * MIN }),
    ]);
    expect(merged.domainMs).toEqual({ 'a.com': 30 * MIN, 'b.com': 5 * MIN, 'c.com': 1 * MIN });
    expect(merged.hourlyMs[9]).toBe(26 * MIN);
    expect(merged.hourlyMs[10]).toBe(10 * MIN);
  });

  it('returns empty totals for no days', () => {
    const merged = mergeDays([]);
    expect(merged.domainMs).toEqual({});
    expect(merged.hourlyMs).toHaveLength(24);
  });

  it('safely merges a hostile hostname such as __proto__', () => {
    const hostile = {};
    Object.defineProperty(hostile, '__proto__', { value: 1000, enumerable: true });
    const merged = mergeDays([day(hostile), day(hostile)]);
    expect(Object.keys(merged.domainMs)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(merged.domainMs)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(merged.domainMs, '__proto__').value).toBe(2000);
  });

  it('does not mutate its inputs', () => {
    const input = day({ 'a.com': MIN }, { 1: MIN });
    const snapshot = JSON.stringify(input);
    mergeDays([input, input]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('averageDailyMs', () => {
  it('averages only days that have data', () => {
    const result = averageDailyMs([
      day({ 'a.com': 60 * MIN }),
      day({}),
      day({ 'a.com': 20 * MIN, 'b.com': 10 * MIN }),
      day({}),
    ]);
    expect(result.daysCounted).toBe(2);
    expect(result.averageMs).toBe(45 * MIN);
  });

  it('reports zero days when nothing was recorded', () => {
    expect(averageDailyMs([day({}), day({})])).toEqual({ averageMs: 0, daysCounted: 0 });
    expect(averageDailyMs([])).toEqual({ averageMs: 0, daysCounted: 0 });
  });
});
