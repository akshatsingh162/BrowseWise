import { describe, expect, it } from 'vitest';
import { shiftDateKey } from '../src/shared/dates.js';

describe('shiftDateKey', () => {
  it.each([
    ['2026-11-07', -1, '2026-11-06'],
    ['2026-11-07', 1, '2026-11-08'],
    ['2026-11-01', -1, '2026-10-31'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-11-07', 0, '2026-11-07'],
    ['2026-11-07', -7, '2026-10-31'],
  ])('%s shifted by %i is %s', (key, days, expected) => {
    expect(shiftDateKey(key, days)).toBe(expected);
  });

  it('walks across every day of a year without skipping or repeating', () => {
    let key = '2026-01-01';
    const seen = new Set([key]);
    for (let i = 0; i < 364; i += 1) {
      key = shiftDateKey(key, 1);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(key).toBe('2026-12-31');
    expect(shiftDateKey(key, 1)).toBe('2027-01-01');
  });
});
