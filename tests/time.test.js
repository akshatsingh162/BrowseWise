import { describe, expect, it } from 'vitest';
import { splitIntoSegments, toLocalDateKey } from '../src/shared/time.js';

/** Builds a LOCAL timestamp on 2026-11-(day). Tests stay independent of the machine's time zone. */
const at = (hour, minute = 0, second = 0, day = 7) =>
  new Date(2026, 10, day, hour, minute, second).getTime();

const sumMs = (segments) => segments.reduce((total, segment) => total + segment.ms, 0);

describe('toLocalDateKey', () => {
  it('zero-pads month and day', () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05');
  });

  it('uses local time at the day boundary', () => {
    expect(toLocalDateKey(at(23, 59, 59))).toBe('2026-11-07');
    expect(toLocalDateKey(at(0, 0, 0, 8))).toBe('2026-11-08');
  });
});

describe('splitIntoSegments', () => {
  it('keeps a span inside one hour as one segment', () => {
    expect(splitIntoSegments(at(10, 15), at(10, 20))).toEqual([
      { dateKey: '2026-11-07', hour: 10, ms: 5 * 60_000 },
    ]);
  });

  it('splits at an hour boundary', () => {
    expect(splitIntoSegments(at(10, 50), at(11, 10))).toEqual([
      { dateKey: '2026-11-07', hour: 10, ms: 10 * 60_000 },
      { dateKey: '2026-11-07', hour: 11, ms: 10 * 60_000 },
    ]);
  });

  it('splits across local midnight into two different days', () => {
    expect(splitIntoSegments(at(23, 55), at(0, 5, 0, 8))).toEqual([
      { dateKey: '2026-11-07', hour: 23, ms: 5 * 60_000 },
      { dateKey: '2026-11-08', hour: 0, ms: 5 * 60_000 },
    ]);
  });

  it('produces one segment per hour touched across several hours', () => {
    const segments = splitIntoSegments(at(9, 30), at(13, 45));
    expect(segments.map((segment) => segment.hour)).toEqual([9, 10, 11, 12, 13]);
    expect(sumMs(segments)).toBe(4 * 3_600_000 + 15 * 60_000);
  });

  it('always preserves the total duration', () => {
    const spans = [
      [at(0), at(23, 59, 59)],
      [at(23, 59, 59), at(0, 0, 1, 8)],
      [at(8, 0, 0), at(8, 0, 0)],
      [at(7, 59, 59), at(8, 0, 0)],
      [at(6, 17, 42), at(19, 3, 9)],
    ];
    for (const [start, end] of spans) {
      expect(sumMs(splitIntoSegments(start, end))).toBe(Math.max(0, end - start));
    }
  });

  it('returns nothing for empty, reversed, or invalid spans', () => {
    expect(splitIntoSegments(at(10), at(10))).toEqual([]);
    expect(splitIntoSegments(at(11), at(10))).toEqual([]);
    expect(splitIntoSegments(NaN, at(10))).toEqual([]);
    expect(splitIntoSegments(at(10), Infinity)).toEqual([]);
  });
});
