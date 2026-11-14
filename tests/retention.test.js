import { describe, expect, it } from 'vitest';
import { countDaysBefore, retentionCutoffKey } from '../src/shared/retention.js';

describe('retentionCutoffKey', () => {
  it('keeps today plus the days before it', () => {
    // 30 days = today and the 29 before it, so the oldest kept day is 29 days back.
    expect(retentionCutoffKey('2026-11-30', 30)).toBe('2026-11-01');
    expect(retentionCutoffKey('2026-11-07', 7)).toBe('2026-11-01');
    expect(retentionCutoffKey('2026-11-07', 1)).toBe('2026-11-07');
  });

  it('crosses month and year boundaries', () => {
    expect(retentionCutoffKey('2027-01-10', 30)).toBe('2026-12-12');
    expect(retentionCutoffKey('2028-03-01', 365)).toBe('2027-03-03');
  });

  it('never makes today older than the cutoff', () => {
    for (const days of [7, 30, 90, 365, 3650]) {
      expect('2026-11-07' < retentionCutoffKey('2026-11-07', days)).toBe(false);
    }
  });
});

describe('countDaysBefore', () => {
  const keys = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];

  it('counts only days strictly before the cutoff', () => {
    expect(countDaysBefore(keys, '2026-11-01')).toBe(2);
    expect(countDaysBefore(keys, '2026-10-30')).toBe(0);
    expect(countDaysBefore(keys, '2026-12-01')).toBe(4);
  });

  it('does not depend on order and handles an empty list', () => {
    expect(countDaysBefore([...keys].reverse(), '2026-11-01')).toBe(2);
    expect(countDaysBefore([], '2026-11-01')).toBe(0);
  });
});
