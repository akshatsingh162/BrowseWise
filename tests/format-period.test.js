import { describe, expect, it } from 'vitest';
import { describePeriodComparison } from '../src/shared/format-period.js';

const MIN = 60_000;

describe('describePeriodComparison', () => {
  it('has nothing to compare when the earlier period is empty', () => {
    const result = describePeriodComparison(
      { deltaMs: 5 * MIN, deltaPct: null },
      0,
      'previous 7 days',
    );
    expect(result).toEqual({
      value: '\u2014',
      hint: 'No data in the previous 7 days',
      direction: 'none',
    });
  });

  it('reports more time with amount, percentage, and the earlier total', () => {
    const result = describePeriodComparison(
      { deltaMs: 30 * MIN, deltaPct: 0.5 },
      60 * MIN,
      'previous 7 days',
    );
    expect(result.direction).toBe('up');
    expect(result.value).toBe('+30m');
    expect(result.hint).toBe('50% more \u00b7 1h 00m in the previous 7 days');
  });

  it('reports less time with a real minus sign', () => {
    const result = describePeriodComparison(
      { deltaMs: -15 * MIN, deltaPct: -0.25 },
      60 * MIN,
      'previous 30 days',
    );
    expect(result.direction).toBe('down');
    expect(result.value).toBe('\u221215m');
    expect(result.hint).toContain('25% less');
  });

  it('treats under a minute as the same', () => {
    const result = describePeriodComparison(
      { deltaMs: 20_000, deltaPct: 0.003 },
      100 * MIN,
      'previous 7 days',
    );
    expect(result.direction).toBe('flat');
    expect(result.value).toBe('\u00b10m');
  });
});
