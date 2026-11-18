import { categorize, categoryLabel } from './categorizer.js';
import { shiftDateKey } from './dates.js';
import { toLocalDateKey } from './time.js';
import { totalMs } from './stats.js';

/**
 * Building the files people can download. Everything here is pure: the Settings page
 * reads the data, these functions turn it into text.
 */

export const EXPORT_FORMAT_VERSION = 1;

export const EXPORT_RANGES = Object.freeze([
  Object.freeze({ id: 'all', label: 'All time', days: null }),
  Object.freeze({ id: '30d', label: 'Last 30 days', days: 30 }),
  Object.freeze({ id: '90d', label: 'Last 90 days', days: 90 }),
  Object.freeze({ id: '365d', label: 'Last year', days: 365 }),
]);

/**
 * First day included in an export, or null for "all time".
 * @param {string} rangeId one of EXPORT_RANGES
 * @param {string} todayKey local YYYY-MM-DD
 * @returns {string|null}
 */
export function exportRangeStartKey(rangeId, todayKey) {
  const range = EXPORT_RANGES.find((candidate) => candidate.id === rangeId);
  if (!range) throw new RangeError(`Unknown export range: ${rangeId}`);
  return range.days === null ? null : shiftDateKey(todayKey, -(range.days - 1));
}

/** Days on or after `startKey` (all of them when `startKey` is null). */
export function filterDaysFrom(days, startKey) {
  return startKey === null ? [...days] : days.filter((day) => day.date >= startKey);
}

/*
 * Domains are object keys, so copies are built with defineProperty. A site called
 * "__proto__" then stays an ordinary entry instead of changing the object's prototype.
 */
function copyRecord(source) {
  const copy = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    Object.defineProperty(copy, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/**
 * The JSON export. Times are in milliseconds, as stored.
 *
 * @param {object} input
 * @param {{date: string, hourlyMs: number[], domainMs: Record<string, number>}[]} input.days
 * @param {Record<string, string>} input.categoryOverrides
 * @param {{dailyGoalMs: number|null, siteLimits: Record<string, number>}} input.goals
 * @param {object} input.settings
 * @param {{date: string, sessions: number, focusMs: number, longestMs: number}[]} [input.focusDays]
 * @param {{earned: Record<string, string>, best: {focus: number, goal: number}}|null} [input.achievements]
 * @param {string} input.appVersion
 * @param {number} input.now epoch ms
 */
export function buildJsonExport({
  days,
  categoryOverrides,
  goals,
  settings,
  focusDays = [],
  achievements = null,
  appVersion,
  now,
}) {
  return {
    app: 'BrowseWise',
    exportFormat: EXPORT_FORMAT_VERSION,
    appVersion,
    exportedAt: new Date(now).toISOString(),
    timeUnit: 'milliseconds',
    usage: [...days]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((day) => ({
        date: day.date,
        totalMs: totalMs(day),
        domains: copyRecord(day.domainMs),
        hourlyMs: [...day.hourlyMs],
      })),
    categoryOverrides: copyRecord(categoryOverrides),
    goals: {
      dailyGoalMs: goals?.dailyGoalMs ?? null,
      siteLimits: copyRecord(goals?.siteLimits),
    },
    settings: { ...settings },
    // Added after format 1 was introduced; readers that ignore unknown fields are unaffected.
    focus: {
      days: [...focusDays]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map(({ date, sessions, focusMs, longestMs }) => ({ date, sessions, focusMs, longestMs })),
      badgesEarned: copyRecord(achievements?.earned),
      bestStreaks: { focus: achievements?.best?.focus ?? 0, goal: achievements?.best?.goal ?? 0 },
    },
  };
}

/** Text that a spreadsheet would read as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field. Text is quoted when it contains a comma, quote or line break.
 * Text that starts with = + - @ (or a tab or carriage return) gets a leading
 * apostrophe, so a spreadsheet shows it as text instead of running it as a formula.
 * Numbers are written as they are.
 *
 * @param {string|number} value
 */
export function csvCell(value) {
  if (typeof value === 'number') return String(value);
  let text = String(value ?? '');
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const CSV_HEADER = ['date', 'domain', 'category', 'seconds'];

/**
 * One row per website per day: date, domain, category, seconds. Newest rows are not
 * special: rows are sorted by date, then by time (most first), then by name. A
 * website's category follows the user's own choices. Time is rounded to whole
 * seconds, and a website with under half a second in a day is left out.
 *
 * @param {{date: string, domainMs: Record<string, number>}[]} days
 * @param {Record<string, string>} [overrides]
 * @returns {string} CRLF-separated, with a header row
 */
export function buildCsv(days, overrides = {}) {
  const rows = [];
  for (const day of days) {
    for (const [domain, ms] of Object.entries(day.domainMs)) {
      const seconds = Math.round(ms / 1000);
      if (!(seconds >= 1)) continue;
      const category = categoryLabel(categorize(domain, overrides).categoryId);
      rows.push({ date: day.date, domain, category, seconds });
    }
  }

  rows.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      b.seconds - a.seconds ||
      a.domain.localeCompare(b.domain),
  );

  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((row) =>
      [row.date, row.domain, row.category, row.seconds].map((cell) => csvCell(cell)).join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {'json'|'csv'} format
 * @param {number} now epoch ms
 * @returns {string} for example "browsewise-usage-2026-11-14.json"
 */
export function exportFilename(format, now) {
  if (format !== 'json' && format !== 'csv') throw new RangeError(`Unknown format: ${format}`);
  return `browsewise-usage-${toLocalDateKey(now)}.${format}`;
}
