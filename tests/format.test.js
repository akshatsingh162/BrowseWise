import { describe, expect, it } from 'vitest';
import { describeComparison, formatDuration, formatPercent } from '../src/shared/format.js';

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [-5, '0m'],
    [NaN, '0m'],
    [400, '1s'],
    [45_000, '45s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [12 * 60_000 + 59_000, '12m'],
    [3_599_999, '59m'],
    [3_600_000, '1h 00m'],
    [2 * 3_600_000 + 5 * 60_000, '2h 05m'],
    [25 * 3_600_000, '25h 00m'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('never rounds up beyond what was recorded', () => {
    expect(formatDuration(59 * 60_000 + 59_999)).toBe('59m');
  });
});

describe('formatPercent', () => {
  it.each([
    [0, '0%'],
    [NaN, '0%'],
    [0.001, '<1%'],
    [0.004, '<1%'],
    [0.005, '1%'],
    [0.345, '35%'],
    [1, '100%'],
  ])('formats %f as %s', (share, expected) => {
    expect(formatPercent(share)).toBe(expected);
  });
});

describe('describeComparison', () => {
  const MIN = 60_000;

  it('reports no comparison when yesterday has no data', () => {
    expect(describeComparison({ yesterdayMs: 0, deltaMs: 5 * MIN, deltaPct: null }).direction).toBe(
      'none',
    );
  });

  it('reports "more" with the amount and a percentage tooltip', () => {
    const result = describeComparison({ yesterdayMs: 60 * MIN, deltaMs: 30 * MIN, deltaPct: 0.5 });
    expect(result.direction).toBe('up');
    expect(result.label).toBe('+30m vs yesterday');
    expect(result.tooltip).toContain('50% more');
    expect(result.tooltip).toContain('1h 00m');
  });

  it('reports "less" using a real minus sign', () => {
    const result = describeComparison({
      yesterdayMs: 60 * MIN,
      deltaMs: -15 * MIN,
      deltaPct: -0.25,
    });
    expect(result.direction).toBe('down');
    expect(result.label).toBe('\u221215m vs yesterday');
    expect(result.tooltip).toContain('25% less');
  });

  it('treats differences under a minute as the same', () => {
    expect(
      describeComparison({ yesterdayMs: 60 * MIN, deltaMs: 30_000, deltaPct: 0.008 }).direction,
    ).toBe('flat');
  });
});
