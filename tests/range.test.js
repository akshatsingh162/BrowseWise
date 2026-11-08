import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE_ID, RANGES, dateKeysForRange, isRangeId } from '../src/shared/range.js';

const NOW = new Date(2026, 10, 7, 15, 30).getTime();

describe('dateKeysForRange', () => {
  it('today is just today', () => {
    expect(dateKeysForRange('today', NOW)).toEqual(['2026-11-07']);
  });

  it('7d is the last seven days, oldest first, ending today', () => {
    expect(dateKeysForRange('7d', NOW)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
  });

  it('30d has 30 distinct days and crosses month boundaries', () => {
    const keys = dateKeysForRange('30d', NOW);
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(30);
    expect(keys[0]).toBe('2026-10-09');
    expect(keys.at(-1)).toBe('2026-11-07');
  });

  it('falls back to the default range for unknown ids', () => {
    expect(dateKeysForRange('nonsense', NOW)).toEqual(dateKeysForRange(DEFAULT_RANGE_ID, NOW));
  });
});

describe('isRangeId', () => {
  it('recognises only declared ranges', () => {
    for (const range of RANGES) expect(isRangeId(range.id)).toBe(true);
    expect(isRangeId('1y')).toBe(false);
    expect(isRangeId(undefined)).toBe(false);
  });
});
