import { describe, expect, it } from 'vitest';
import {
  dayLong,
  dayMonth,
  dayShort,
  hourLabel,
  hourRange,
  monthLong,
  monthShort,
  weekdayShort,
} from '../src/shared/labels.js';

// Newer ICU versions use a narrow no-break space before AM/PM; normalise so the
// tests pass on any Node version.
const plain = (text) => text.replace(/\u202f/g, ' ');

describe('labels (en-US)', () => {
  it('formats days', () => {
    expect(weekdayShort('2026-11-02', 'en-US')).toBe('Mon');
    expect(dayShort('2026-11-02', 'en-US')).toBe('Mon, Nov 2');
    expect(dayLong('2026-11-02', 'en-US')).toBe('Monday, November 2, 2026');
    expect(dayMonth('2026-11-02', 'en-US')).toBe('Nov 2');
  });

  it('formats months from YYYY-MM keys', () => {
    expect(monthLong('2026-11', 'en-US')).toBe('November 2026');
    expect(monthShort('2026-11', 'en-US')).toBe('Nov');
    expect(monthShort('2027-01', 'en-US')).toBe('Jan');
  });

  it('formats hours and hour ranges, wrapping at midnight', () => {
    expect(plain(hourLabel(14, 'en-US'))).toBe('2 PM');
    expect(plain(hourLabel(0, 'en-US'))).toBe('12 AM');
    expect(plain(hourRange(14, 'en-US'))).toBe('2 PM \u2013 3 PM');
    expect(plain(hourRange(23, 'en-US'))).toBe('11 PM \u2013 12 AM');
  });

  it('is not thrown off by month ends or daylight-saving dates', () => {
    expect(dayMonth('2026-03-29', 'en-US')).toBe('Mar 29');
    expect(dayMonth('2026-10-25', 'en-US')).toBe('Oct 25');
    expect(dayMonth('2026-12-31', 'en-US')).toBe('Dec 31');
  });
});
