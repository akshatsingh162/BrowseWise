import { describe, expect, it } from 'vitest';
import {
  CSV_HEADER,
  EXPORT_RANGES,
  buildCsv,
  buildJsonExport,
  csvCell,
  exportFilename,
  exportRangeStartKey,
  filterDaysFrom,
} from '../src/shared/export.js';

const MIN = 60_000;
const day = (date, domainMs, hourly = {}) => {
  const hourlyMs = new Array(24).fill(0);
  for (const [hour, ms] of Object.entries(hourly)) hourlyMs[Number(hour)] = ms;
  return { date, hourlyMs, domainMs };
};

describe('export ranges', () => {
  it('offers all time, 30 days, 90 days and one year', () => {
    expect(EXPORT_RANGES.map((range) => range.id)).toEqual(['all', '30d', '90d', '365d']);
  });

  it('starts a ranged export on the oldest day included, counting today', () => {
    expect(exportRangeStartKey('30d', '2026-11-30')).toBe('2026-11-01');
    expect(exportRangeStartKey('90d', '2026-11-07')).toBe('2026-08-10');
    expect(exportRangeStartKey('365d', '2026-11-07')).toBe('2025-11-08');
  });

  it('has no start for all time, and rejects an unknown range', () => {
    expect(exportRangeStartKey('all', '2026-11-07')).toBeNull();
    expect(() => exportRangeStartKey('7d', '2026-11-07')).toThrow(RangeError);
  });

  it('filters days from a start key, keeping the start day', () => {
    const days = [day('2026-10-31', {}), day('2026-11-01', {}), day('2026-11-02', {})];
    expect(filterDaysFrom(days, '2026-11-01').map((d) => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(filterDaysFrom(days, null)).toHaveLength(3);
    expect(filterDaysFrom(days, null)).not.toBe(days);
  });
});

describe('buildJsonExport', () => {
  const base = {
    days: [
      day('2026-11-02', { 'youtube.com': 5 * MIN }, { 9: 5 * MIN }),
      day('2026-11-01', { 'github.com': 10 * MIN, 'youtube.com': 2 * MIN }, { 10: 12 * MIN }),
    ],
    categoryOverrides: { 'github.com': 'productivity' },
    goals: { dailyGoalMs: 2 * 60 * MIN, siteLimits: { 'youtube.com': 30 * MIN } },
    settings: { idleThresholdSeconds: 60, retentionDays: 365 },
    appVersion: '0.1.0',
    now: Date.UTC(2026, 10, 14, 8, 30, 0),
  };

  it('describes the file and holds usage, categories, goals and settings', () => {
    const json = buildJsonExport(base);
    expect(json).toMatchObject({
      app: 'BrowseWise',
      exportFormat: 1,
      appVersion: '0.1.0',
      exportedAt: '2026-11-14T08:30:00.000Z',
      timeUnit: 'milliseconds',
      categoryOverrides: { 'github.com': 'productivity' },
      goals: { dailyGoalMs: 2 * 60 * MIN, siteLimits: { 'youtube.com': 30 * MIN } },
      settings: { idleThresholdSeconds: 60, retentionDays: 365 },
    });
  });

  it('lists days oldest first, each with its total, domains and hours', () => {
    const { usage } = buildJsonExport(base);
    expect(usage.map((entry) => entry.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(usage[0]).toMatchObject({
      totalMs: 12 * MIN,
      domains: { 'github.com': 10 * MIN, 'youtube.com': 2 * MIN },
    });
    expect(usage[0].hourlyMs).toHaveLength(24);
    expect(usage[0].hourlyMs[10]).toBe(12 * MIN);
  });

  it('does not change the data it was given', () => {
    const before = JSON.stringify(base.days);
    buildJsonExport(base);
    expect(JSON.stringify(base.days)).toBe(before);
  });

  it('survives hostile domain names and round-trips through JSON', () => {
    const domains = {};
    for (const name of ['__proto__', 'constructor', 'normal.com']) {
      Object.defineProperty(domains, name, { value: MIN, enumerable: true });
    }
    const json = buildJsonExport({ ...base, days: [day('2026-11-01', domains)] });

    expect(Object.getPrototypeOf(json.usage[0].domains)).toBe(Object.prototype);
    const parsed = JSON.parse(JSON.stringify(json));
    expect(Object.keys(parsed.usage[0].domains).sort()).toEqual([
      '__proto__',
      'constructor',
      'normal.com',
    ]);
    expect(json.usage[0].totalMs).toBe(3 * MIN);
  });

  it('writes a missing goal as null', () => {
    const json = buildJsonExport({ ...base, goals: { dailyGoalMs: null, siteLimits: {} } });
    expect(json.goals).toEqual({ dailyGoalMs: null, siteLimits: {} });
  });
});

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('github.com')).toBe('github.com');
    expect(csvCell(42)).toBe('42');
    expect(csvCell('Development & Programming')).toBe('Development & Programming');
  });

  it('quotes text with commas, quotes or line breaks, doubling inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('line\r\nbreak')).toBe('"line\r\nbreak"');
  });

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['\tTabbed', "'\tTabbed"],
    ['\rReturn', "'\rReturn"],
  ])('stops %j being read as a formula', (input, expected) => {
    expect(csvCell(input).replace(/^"|"$/g, '')).toBe(expected);
  });

  it('does not add an apostrophe to numbers, or to text that merely contains a symbol', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('e-mail.com')).toBe('e-mail.com');
  });

  it('still quotes a formula that also needs quoting', () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it('treats null and undefined as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('buildCsv', () => {
  it('starts with the header and uses CRLF line endings, ending with one', () => {
    const csv = buildCsv([day('2026-11-01', { 'github.com': 90_000 })]);
    expect(csv).toBe(
      'date,domain,category,seconds\r\n2026-11-01,github.com,Development & Programming,90\r\n',
    );
    expect(CSV_HEADER).toEqual(['date', 'domain', 'category', 'seconds']);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // no bare line breaks
  });

  it('sorts by date, then by seconds with the most first', () => {
    const csv = buildCsv([
      day('2026-11-02', { 'a.com': 10_000 }),
      day('2026-11-01', { 'b.com': 20_000, 'c.com': 60_000, 'd.com': 20_000 }),
    ]);
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows.map((row) => row.split(',')[1])).toEqual(['c.com', 'b.com', 'd.com', 'a.com']);
  });

  it('skips sites with no time, and rounds to whole seconds', () => {
    const csv = buildCsv([day('2026-11-01', { 'zero.com': 0, 'tiny.com': 400, 'x.com': 1_499 })]);
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^2026-11-01,x\.com,.*,1$/);
  });

  it("uses the user's own category when there is an override", () => {
    const days = [day('2026-11-01', { 'github.com': 60_000, 'youtube.com': 60_000 })];
    const rows = buildCsv(days, { 'youtube.com': 'education' }).trim().split('\r\n');
    expect(rows).toContain('2026-11-01,youtube.com,Education,60');
    expect(rows).toContain('2026-11-01,github.com,Development & Programming,60');
  });

  it('neutralises a website name that looks like a formula', () => {
    const csv = buildCsv([day('2026-11-01', { '=cmd|calc': 60_000 })]);
    expect(csv).toContain("'=cmd|calc");
    expect(csv).not.toMatch(/\r\n=cmd/);
  });

  it('writes only the header when there is nothing to export', () => {
    expect(buildCsv([])).toBe('date,domain,category,seconds\r\n');
    expect(buildCsv([day('2026-11-01', {})])).toBe('date,domain,category,seconds\r\n');
  });

  it('handles hostile names without error', () => {
    const domains = {};
    Object.defineProperty(domains, '__proto__', { value: 60_000, enumerable: true });
    expect(buildCsv([day('2026-11-01', domains)])).toContain('2026-11-01,__proto__,Other,60');
  });
});

describe('exportFilename', () => {
  const now = new Date(2026, 10, 4, 15, 0, 0).getTime();

  it('names the file after the local date', () => {
    expect(exportFilename('json', now)).toBe('browsewise-usage-2026-11-04.json');
    expect(exportFilename('csv', now)).toBe('browsewise-usage-2026-11-04.csv');
  });

  it('rejects an unknown format', () => {
    expect(() => exportFilename('xml', now)).toThrow(RangeError);
  });
});
