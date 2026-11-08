import { describe, expect, it, vi } from 'vitest';
import {
  hourlyChartConfig,
  monthsChartConfig,
  trendChartConfig,
  weeklyChartConfig,
} from '../src/dashboard/charts/chart-configs.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const plain = (text) => text.replace(/\u202f/g, ' ');

const theme = {
  accent: '#aaa',
  accentDim: '#aaa8',
  accentFill: '#aaa2',
  chartMuted: '#555',
  text: '#fff',
  textMuted: '#999',
  grid: '#222',
  tooltipBackground: '#111',
  tooltipBorder: '#333',
};
const base = { theme, animate: true, locale: 'en-US' };

const entries = (start, minutes) =>
  minutes.map((m, i) => ({
    dateKey: `${start.slice(0, 8)}${String(Number(start.slice(8)) + i).padStart(2, '0')}`,
    totalMs: m * MIN,
  }));

describe('hourlyChartConfig', () => {
  const hourlyMs = new Array(24).fill(0);
  hourlyMs[9] = 30 * MIN;
  hourlyMs[14] = 45 * MIN;
  const { config, table } = hourlyChartConfig({ hourlyMs, ...base });

  it('plots 24 bars in minutes', () => {
    expect(config.type).toBe('bar');
    expect(config.data.labels).toHaveLength(24);
    expect(config.data.datasets[0].data[9]).toBe(30);
    expect(config.data.datasets[0].data[14]).toBe(45);
    expect(config.data.datasets[0].data[3]).toBe(0);
  });

  it('uses a stable 0-60 minute scale with readable ticks', () => {
    const y = config.options.scales.y;
    expect(y.suggestedMax).toBe(60);
    expect(y.ticks.stepSize).toBe(15);
    expect(y.ticks.callback(30)).toBe('30m');
    expect(y.ticks.callback(60)).toBe('1h 00m');
  });

  it('describes each bar with its hour range and exact duration', () => {
    const { callbacks } = config.options.plugins.tooltip;
    expect(plain(callbacks.title([{ dataIndex: 14 }]))).toBe('2 PM \u2013 3 PM');
    expect(callbacks.label({ dataIndex: 14 })).toBe('45m');
  });

  it('lists only active hours in the accessible table', () => {
    expect(table.columns).toEqual(['Hour', 'Active time']);
    expect(table.rows.map((row) => row[1])).toEqual(['30m', '45m']);
  });

  it('animates only when asked, so background refreshes do not flicker', () => {
    expect(config.options.animation).toEqual({ duration: 400 });
    expect(hourlyChartConfig({ hourlyMs, ...base, animate: false }).config.options.animation).toBe(
      false,
    );
  });

  it('is responsive and has no legend', () => {
    expect(config.options.responsive).toBe(true);
    expect(config.options.maintainAspectRatio).toBe(false);
    expect(config.options.plugins.legend.display).toBe(false);
  });
});

describe('weeklyChartConfig', () => {
  const current = entries('2026-11-01', [60, 0, 30, 90, 0, 0, 120]);
  const previous = entries('2026-10-25', [10, 20, 30, 40, 50, 60, 70]);

  it('plots both weeks in hours, grouped by weekday', () => {
    const { config } = weeklyChartConfig({ current, previous, ...base });
    expect(config.data.labels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(config.data.datasets.map((d) => d.label)).toEqual(['Last 7 days', 'Previous 7 days']);
    expect(config.data.datasets[0].data).toEqual([1, 0, 0.5, 1.5, 0, 0, 2]);
    expect(config.data.datasets[1].data[6]).toBeCloseTo(70 / 60);
    expect(config.data.datasets[0].backgroundColor).toBe(theme.accent);
    expect(config.data.datasets[1].backgroundColor).toBe(theme.chartMuted);
    expect(config.options.plugins.legend.display).toBe(true);
  });

  it("labels each bar's tooltip with that bar's own date", () => {
    const { config } = weeklyChartConfig({ current, previous, ...base });
    const { callbacks } = config.options.plugins.tooltip;
    expect(callbacks.title([{ dataIndex: 3 }])).toBe('Wed');
    expect(callbacks.label({ datasetIndex: 0, dataIndex: 3 })).toBe('Wed, Nov 4: 1h 30m');
    expect(callbacks.label({ datasetIndex: 1, dataIndex: 3 })).toBe('Wed, Oct 28: 40m');
  });

  it('formats hour ticks', () => {
    const { config } = weeklyChartConfig({ current, previous, ...base });
    expect(config.options.scales.y.ticks.callback(1.5)).toBe('1h 30m');
    expect(config.options.scales.y.ticks.callback(2)).toBe('2h 00m');
  });

  it('opens the exact day that was clicked, including previous-week bars', () => {
    const onSelectDay = vi.fn();
    const { config } = weeklyChartConfig({ current, previous, ...base, onSelectDay });
    const chart = { getElementsAtEventForMode: vi.fn(() => [{ datasetIndex: 1, index: 2 }]) };

    config.options.onClick({}, [], chart);
    expect(onSelectDay).toHaveBeenCalledWith(previous[2].dateKey);

    chart.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 6 }]);
    config.options.onClick({}, [], chart);
    expect(onSelectDay).toHaveBeenLastCalledWith(current[6].dateKey);

    chart.getElementsAtEventForMode.mockReturnValue([]);
    onSelectDay.mockClear();
    config.options.onClick({}, [], chart);
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it('shows a pointer cursor only over bars', () => {
    const { config } = weeklyChartConfig({ current, previous, ...base, onSelectDay: vi.fn() });
    const target = { style: {} };
    config.options.onHover({ native: { target } }, [{}]);
    expect(target.style.cursor).toBe('pointer');
    config.options.onHover({ native: { target } }, []);
    expect(target.style.cursor).toBe('default');
  });

  it('is not clickable when no handler is given', () => {
    const { config } = weeklyChartConfig({ current, previous, ...base });
    expect(config.options.onClick).toBeUndefined();
  });

  it('provides a table with both weeks', () => {
    const { table } = weeklyChartConfig({ current, previous, ...base });
    expect(table.columns).toEqual(['Day', 'Last 7 days', 'Previous 7 days']);
    expect(table.rows).toHaveLength(7);
    expect(table.rows[0]).toEqual(['Sun, Nov 1', '1h 00m', 'Sun, Oct 25: 10m']);
  });
});

describe('trendChartConfig', () => {
  const totals = entries('2026-11-01', [60, 0, 120]);

  it('draws a filled line in hours', () => {
    const { config } = trendChartConfig({ totals, ...base });
    expect(config.type).toBe('line');
    expect(config.data.labels).toEqual(['Nov 1', 'Nov 2', 'Nov 3']);
    expect(config.data.datasets[0].data).toEqual([1, 0, 2]);
    expect(config.data.datasets[0].fill).toBe(true);
    expect(config.data.datasets[0].borderColor).toBe(theme.accent);
  });

  it('describes points and opens the nearest day on click', () => {
    const onSelectDay = vi.fn();
    const { config } = trendChartConfig({ totals, ...base, onSelectDay });
    const { callbacks } = config.options.plugins.tooltip;
    expect(callbacks.title([{ dataIndex: 2 }])).toBe('Tuesday, November 3, 2026');
    expect(callbacks.label({ dataIndex: 2 })).toBe('2h 00m');

    const chart = { getElementsAtEventForMode: vi.fn(() => [{ index: 1 }]) };
    config.options.onClick({}, [], chart);
    expect(onSelectDay).toHaveBeenCalledWith('2026-11-02');
  });

  it('lists only days with activity in the table', () => {
    const { table } = trendChartConfig({ totals, ...base });
    expect(table.rows.map((row) => row[1])).toEqual(['1h 00m', '2h 00m']);
  });
});

describe('monthsChartConfig', () => {
  const months = [
    { key: '2026-10', totalMs: 40 * HOUR, activeDays: 20, partial: false },
    { key: '2026-11', totalMs: 5 * HOUR, activeDays: 1, partial: true },
  ];

  it('draws one bar per month and dims the month in progress', () => {
    const { config } = monthsChartConfig({ months, ...base });
    expect(config.data.labels).toEqual(['Oct', 'Nov']);
    expect(config.data.datasets[0].data).toEqual([40, 5]);
    expect(config.data.datasets[0].backgroundColor).toEqual([theme.accent, theme.accentDim]);
  });

  it('says "so far" for the current month and pluralises active days', () => {
    const { config } = monthsChartConfig({ months, ...base });
    const { callbacks } = config.options.plugins.tooltip;
    expect(callbacks.title([{ dataIndex: 0 }])).toBe('October 2026');
    expect(callbacks.label({ dataIndex: 0 })).toBe('40h 00m');
    expect(callbacks.label({ dataIndex: 1 })).toBe('5h 00m so far');
    expect(callbacks.afterLabel({ dataIndex: 0 })).toBe('20 active days');
    expect(callbacks.afterLabel({ dataIndex: 1 })).toBe('1 active day');
  });

  it('marks the partial month in the table', () => {
    const { table } = monthsChartConfig({ months, ...base });
    expect(table.rows[1]).toEqual(['November 2026 (so far)', '5h 00m', '1']);
  });
});
