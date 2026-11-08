import { formatDuration } from '../../shared/format.js';
import {
  dayLong,
  dayMonth,
  dayShort,
  hourLabel,
  hourRange,
  monthLong,
  monthShort,
  weekdayShort,
} from '../../shared/labels.js';

/**
 * Pure builders: data in, Chart.js config out. They never touch the DOM or Chart.js
 * itself, so the exact numbers, labels and tooltips are unit tested.
 *
 * Each builder returns { config, table }. `table` is the same data as plain rows,
 * rendered as a visually hidden table so screen-reader users get the numbers a
 * canvas cannot provide.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function baseOptions(theme, animate, { yUnitMs, legend = false }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animate ? { duration: 400 } : false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        align: 'end',
        labels: {
          color: theme.textMuted,
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        backgroundColor: theme.tooltipBackground,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        titleColor: theme.text,
        bodyColor: theme.textMuted,
        padding: 10,
        cornerRadius: 8,
        displayColors: legend,
        callbacks: {},
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: theme.textMuted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid },
        border: { display: false },
        ticks: { color: theme.textMuted, callback: (value) => formatDuration(value * yUnitMs) },
      },
    },
  };
}

function pointer(options) {
  options.onHover = (event, elements) => {
    const target = event.native?.target;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  };
}

/**
 * Hour-by-hour activity for one day.
 * @param {object} input
 * @param {number[]} input.hourlyMs 24 values
 */
export function hourlyChartConfig({ hourlyMs, theme, animate, locale }) {
  const options = baseOptions(theme, animate, { yUnitMs: MINUTE });
  options.scales.y.suggestedMax = 60;
  options.scales.y.ticks.stepSize = 15;
  options.plugins.tooltip.callbacks.title = (items) => hourRange(items[0].dataIndex, locale);
  options.plugins.tooltip.callbacks.label = (item) => formatDuration(hourlyMs[item.dataIndex]);

  return {
    config: {
      type: 'bar',
      data: {
        labels: hourlyMs.map((_, hour) => hourLabel(hour, locale)),
        datasets: [
          {
            label: 'Active time',
            data: hourlyMs.map((ms) => ms / MINUTE),
            backgroundColor: theme.accent,
            hoverBackgroundColor: theme.accent,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 22,
          },
        ],
      },
      options,
    },
    table: {
      columns: ['Hour', 'Active time'],
      rows: hourlyMs
        .map((ms, hour) => [hourRange(hour, locale), formatDuration(ms), ms])
        .filter((row) => row[2] > 0)
        .map(([range, time]) => [range, time]),
    },
  };
}

/**
 * Last 7 days beside the 7 days before, grouped by weekday.
 * @param {object} input
 * @param {{dateKey: string, totalMs: number}[]} input.current
 * @param {{dateKey: string, totalMs: number}[]} input.previous same length, same weekdays
 * @param {(dateKey: string) => void} [input.onSelectDay] called when a bar is clicked
 */
export function weeklyChartConfig({ current, previous, theme, animate, locale, onSelectDay }) {
  const series = [current, previous];
  const options = baseOptions(theme, animate, { yUnitMs: HOUR, legend: true });
  options.scales.x.ticks.maxTicksLimit = 7;
  options.plugins.tooltip.callbacks.title = (items) =>
    weekdayShort(current[items[0].dataIndex].dateKey, locale);
  options.plugins.tooltip.callbacks.label = (item) => {
    const entry = series[item.datasetIndex][item.dataIndex];
    return `${dayShort(entry.dateKey, locale)}: ${formatDuration(entry.totalMs)}`;
  };

  if (onSelectDay) {
    pointer(options);
    options.onClick = (event, _elements, chart) => {
      const [hit] = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
      if (hit) onSelectDay(series[hit.datasetIndex][hit.index].dateKey);
    };
  }

  return {
    config: {
      type: 'bar',
      data: {
        labels: current.map((entry) => weekdayShort(entry.dateKey, locale)),
        datasets: [
          {
            label: 'Last 7 days',
            data: current.map((entry) => entry.totalMs / HOUR),
            backgroundColor: theme.accent,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 28,
          },
          {
            label: 'Previous 7 days',
            data: previous.map((entry) => entry.totalMs / HOUR),
            backgroundColor: theme.chartMuted,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 28,
          },
        ],
      },
      options,
    },
    table: {
      columns: ['Day', 'Last 7 days', 'Previous 7 days'],
      rows: current.map((entry, index) => [
        dayShort(entry.dateKey, locale),
        formatDuration(entry.totalMs),
        `${dayShort(previous[index].dateKey, locale)}: ${formatDuration(previous[index].totalMs)}`,
      ]),
    },
  };
}

/**
 * Daily totals as a line (used for the last 30 days).
 * @param {object} input
 * @param {{dateKey: string, totalMs: number}[]} input.totals
 * @param {(dateKey: string) => void} [input.onSelectDay]
 */
export function trendChartConfig({ totals, theme, animate, locale, onSelectDay }) {
  const options = baseOptions(theme, animate, { yUnitMs: HOUR });
  options.plugins.tooltip.callbacks.title = (items) =>
    dayLong(totals[items[0].dataIndex].dateKey, locale);
  options.plugins.tooltip.callbacks.label = (item) =>
    formatDuration(totals[item.dataIndex].totalMs);

  if (onSelectDay) {
    pointer(options);
    options.onClick = (event, _elements, chart) => {
      const [hit] = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
      if (hit) onSelectDay(totals[hit.index].dateKey);
    };
  }

  return {
    config: {
      type: 'line',
      data: {
        labels: totals.map((entry) => dayMonth(entry.dateKey, locale)),
        datasets: [
          {
            label: 'Screen time',
            data: totals.map((entry) => entry.totalMs / HOUR),
            borderColor: theme.accent,
            backgroundColor: theme.accentFill,
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: theme.accent,
          },
        ],
      },
      options,
    },
    table: {
      columns: ['Day', 'Screen time'],
      rows: totals
        .filter((entry) => entry.totalMs > 0)
        .map((entry) => [dayLong(entry.dateKey, locale), formatDuration(entry.totalMs)]),
    },
  };
}

/**
 * Screen time per calendar month. The month still in progress is drawn lighter.
 * @param {object} input
 * @param {{key: string, totalMs: number, activeDays: number, partial: boolean}[]} input.months
 */
export function monthsChartConfig({ months, theme, animate, locale }) {
  const options = baseOptions(theme, animate, { yUnitMs: HOUR });
  options.scales.x.ticks.maxTicksLimit = months.length;
  options.plugins.tooltip.callbacks.title = (items) =>
    monthLong(months[items[0].dataIndex].key, locale);
  options.plugins.tooltip.callbacks.label = (item) => {
    const month = months[item.dataIndex];
    return `${formatDuration(month.totalMs)}${month.partial ? ' so far' : ''}`;
  };
  options.plugins.tooltip.callbacks.afterLabel = (item) => {
    const { activeDays } = months[item.dataIndex];
    return `${activeDays} active ${activeDays === 1 ? 'day' : 'days'}`;
  };

  return {
    config: {
      type: 'bar',
      data: {
        labels: months.map((month) => monthShort(month.key, locale)),
        datasets: [
          {
            label: 'Screen time',
            data: months.map((month) => month.totalMs / HOUR),
            backgroundColor: months.map((month) =>
              month.partial ? theme.accentDim : theme.accent,
            ),
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 44,
          },
        ],
      },
      options,
    },
    table: {
      columns: ['Month', 'Screen time', 'Active days'],
      rows: months.map((month) => [
        `${monthLong(month.key, locale)}${month.partial ? ' (so far)' : ''}`,
        formatDuration(month.totalMs),
        String(month.activeDays),
      ]),
    },
  };
}
