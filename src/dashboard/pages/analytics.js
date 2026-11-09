import { formatDuration } from '../../shared/format.js';
import { describePeriodComparison } from '../../shared/format-period.js';
import { dayLong, dayShort, hourRange } from '../../shared/labels.js';
import { toLocalDateKey } from '../../shared/time.js';
import { shiftDateKey } from '../../shared/dates.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import {
  hourlyChartConfig,
  monthsChartConfig,
  trendChartConfig,
  weeklyChartConfig,
} from '../charts/chart-configs.js';
import { chartCard } from '../components/chart-card.js';
import { categoryPanel } from '../components/category-panel.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { segmentedControl } from '../components/segmented-control.js';
import { statCard } from '../components/stat-card.js';
import { stateCard } from '../components/state-card.js';
import { websitePanel } from '../components/website-panel.js';

const MODES = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const COMPARISON_TOOLTIP = 'Includes today so far, which is not yet a full day.';

/** Text values (a day or an hour range) are smaller than numbers so they fit the card. */
const textValue = (text) => el('span', { class: 'db-stat-text', text });

/** Combines cards and chart cards into one page result for the data view. */
function assemble(allParts) {
  const parts = allParts.filter(Boolean);
  const charts = parts.filter((part) => part.element);
  return {
    node: el(
      'div',
      { class: 'db-stack' },
      parts.map((part) => part.element ?? part),
    ),
    mounted: () => charts.forEach((chart) => chart.mount()),
    destroy: () => charts.forEach((chart) => chart.destroy()),
  };
}

function comparisonCard(comparison, previousMs, periodName) {
  const text = describePeriodComparison(comparison, previousMs, periodName);
  return statCard({
    label: `Vs ${periodName}`,
    iconName: 'trending-up',
    value: text.value,
    hint: text.hint,
    hintTitle: COMPARISON_TOOLTIP,
  });
}

/**
 * Mounts the Analytics page: daily, weekly, and monthly views with charts.
 *
 * Controls (view switch, day navigation) live outside the data region, so a
 * background refresh never steals keyboard focus.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(dateKey: string, now: number) => Promise<object>} deps.loadDailyAnalytics
 * @param {(now: number) => Promise<object>} deps.loadWeeklyAnalytics
 * @param {(now: number) => Promise<object>} deps.loadMonthlyAnalytics
 * @param {(canvas: HTMLCanvasElement, config: object) => {destroy: () => void}} deps.createChart
 * @param {() => object} deps.readTheme
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @param {string} [deps.locale]
 * @returns {{unmount: () => void}}
 */
export function mountAnalyticsPage(
  container,
  {
    loadDailyAnalytics,
    loadWeeklyAnalytics,
    loadMonthlyAnalytics,
    createChart,
    readTheme,
    requestLiveFlush,
    subscribe,
    now = Date.now,
    locale,
  },
) {
  let mode = 'daily';
  let dateKey = toLocalDateKey(now());
  // Animate when the user changes what is shown, not on silent background refreshes.
  let animateNext = true;

  const todayKey = () => toLocalDateKey(now());

  // ---------- rendering ----------

  const chartDeps = () => {
    const animate = animateNext;
    animateNext = false;
    return { theme: readTheme(), animate, locale };
  };

  function openDay(selectedKey) {
    mode = 'daily';
    dateKey = selectedKey;
    modeControl.select('daily');
    syncControls();
    animateNext = true;
    void view.refresh();
  }

  function renderDaily(data) {
    if (data.totalMs <= 0) {
      return stateCard({
        iconName: 'hourglass',
        title: 'No browsing time on this day',
        text: data.isToday
          ? 'Open a website and BrowseWise starts counting while you are active.'
          : `Nothing was recorded on ${dayLong(data.dateKey, locale)}.`,
      });
    }

    const busiest = data.busiestHour;
    const hourly = chartCard({
      title: 'Activity by hour',
      description: 'Active minutes in each hour of the day. An hour holds at most 60 minutes.',
      spec: hourlyChartConfig({ hourlyMs: data.hourlyMs, ...chartDeps() }),
      createChart,
      height: 260,
    });

    return assemble([
      el('div', { class: 'db-stats' }, [
        statCard({
          label: 'Screen time',
          iconName: 'clock',
          value: formatDuration(data.totalMs),
          hint: data.isToday ? 'So far today' : dayShort(data.dateKey, locale),
        }),
        statCard({
          label: 'Websites',
          iconName: 'globe',
          value: String(data.siteCount),
          hint: data.siteCount === 1 ? 'website visited' : 'websites visited',
        }),
        statCard({
          label: 'Busiest hour',
          iconName: 'activity',
          value: busiest ? textValue(hourRange(busiest.hour, locale)) : '\u2014',
          hint: busiest ? `${formatDuration(busiest.ms)} active` : 'Nothing recorded',
        }),
        statCard({
          label: 'Active hours',
          iconName: 'calendar-days',
          value: String(data.activeHours),
          hint: 'hours with at least a minute',
        }),
      ]),
      hourly,
      categoryPanel({ sites: data.ranked, overrides: data.overrides ?? {} }),
      websitePanel({
        title: data.isToday ? 'Websites today' : 'Websites on this day',
        ranked: data.ranked,
      }),
    ]);
  }

  function renderWeekly(data) {
    if (data.totalMs <= 0 && data.previousMs <= 0) {
      return stateCard({
        iconName: 'hourglass',
        title: 'No browsing time in the last 14 days',
        text: 'Weekly trends appear once BrowseWise has recorded some activity.',
      });
    }

    const weekly = chartCard({
      title: 'Daily screen time',
      description: 'The last 7 days beside the 7 days before. Click a bar to open that day.',
      spec: weeklyChartConfig({
        current: data.current,
        previous: data.previous,
        onSelectDay: openDay,
        ...chartDeps(),
      }),
      createChart,
      height: 280,
    });

    return assemble([
      el('div', { class: 'db-stats' }, [
        statCard({
          label: 'Last 7 days',
          iconName: 'clock',
          value: formatDuration(data.totalMs),
          hint: `${data.average.daysCounted} of 7 days with data`,
        }),
        statCard({
          label: 'Daily average',
          iconName: 'calendar-days',
          value: data.average.daysCounted > 0 ? formatDuration(data.average.averageMs) : '\u2014',
          hint: 'Days with data only',
        }),
        statCard({
          label: 'Busiest day',
          iconName: 'activity',
          value: data.busiestDay ? textValue(dayShort(data.busiestDay.dateKey, locale)) : '\u2014',
          hint: data.busiestDay ? formatDuration(data.busiestDay.totalMs) : 'Nothing recorded',
        }),
        comparisonCard(data.comparison, data.previousMs, 'previous 7 days'),
      ]),
      weekly,
      categoryPanel({ sites: data.ranked, overrides: data.overrides ?? {} }),
      websitePanel({ title: 'Most used this week', ranked: data.ranked }),
    ]);
  }

  function renderMonthly(data) {
    const anyData = data.totalMs > 0 || data.months.some((month) => month.totalMs > 0);
    if (!anyData) {
      return stateCard({
        iconName: 'hourglass',
        title: 'No browsing time recorded yet',
        text: 'Monthly trends appear once BrowseWise has recorded some activity.',
      });
    }

    const trend = chartCard({
      title: 'Last 30 days',
      description: 'Screen time for each of the last 30 days. Click a point to open that day.',
      spec: trendChartConfig({ totals: data.current, onSelectDay: openDay, ...chartDeps() }),
      createChart,
      height: 260,
    });
    const months = chartCard({
      title: 'Monthly totals',
      description: 'The last 6 calendar months. The current month is still in progress.',
      spec: monthsChartConfig({ months: data.months, ...chartDeps() }),
      createChart,
      height: 240,
    });

    return assemble([
      el('div', { class: 'db-stats' }, [
        statCard({
          label: 'Last 30 days',
          iconName: 'clock',
          value: formatDuration(data.totalMs),
          hint: `${data.average.daysCounted} of 30 days with data`,
        }),
        statCard({
          label: 'Daily average',
          iconName: 'calendar-days',
          value: data.average.daysCounted > 0 ? formatDuration(data.average.averageMs) : '\u2014',
          hint: 'Days with data only',
        }),
        statCard({
          label: 'Busiest day',
          iconName: 'activity',
          value: data.busiestDay ? textValue(dayShort(data.busiestDay.dateKey, locale)) : '\u2014',
          hint: data.busiestDay ? formatDuration(data.busiestDay.totalMs) : 'Nothing recorded',
        }),
        comparisonCard(data.comparison, data.previousMs, 'previous 30 days'),
      ]),
      trend,
      months,
      categoryPanel({ sites: data.ranked, overrides: data.overrides ?? {} }),
      websitePanel({ title: 'Most used in the last 30 days', ranked: data.ranked }),
    ]);
  }

  // ---------- data ----------

  const results = el('div', { class: 'db-results' });

  const view = createDataView({
    container: results,
    load: async () => {
      const kind = mode;
      if (kind === 'daily') return { kind, data: await loadDailyAnalytics(dateKey, now()) };
      if (kind === 'weekly') return { kind, data: await loadWeeklyAnalytics(now()) };
      return { kind, data: await loadMonthlyAnalytics(now()) };
    },
    renderReady: ({ kind, data }) => {
      if (kind === 'daily') return renderDaily(data);
      if (kind === 'weekly') return renderWeekly(data);
      return renderMonthly(data);
    },
    requestLiveFlush,
    subscribe,
    // Charts should be drawn once, from fresh data, so their entry animation can play.
    flushFirst: true,
  });

  // ---------- controls ----------

  const modeControl = segmentedControl({
    label: 'Time period',
    options: MODES,
    value: mode,
    onChange: (id) => {
      mode = id;
      syncControls();
      animateNext = true;
      void view.refresh();
    },
  });

  const previousDay = el(
    'button',
    { type: 'button', class: 'bw-icon-btn', 'aria-label': 'Previous day', title: 'Previous day' },
    [icon('chevron-left')],
  );
  const nextDay = el(
    'button',
    { type: 'button', class: 'bw-icon-btn', 'aria-label': 'Next day', title: 'Next day' },
    [icon('chevron-right')],
  );
  const todayButton = el('button', { type: 'button', class: 'bw-btn bw-btn-secondary db-today' }, [
    'Today',
  ]);
  const dayLabel = el('span', { class: 'db-daynav-label', 'aria-live': 'polite' });
  const dayNav = el('div', { class: 'db-daynav', role: 'group', 'aria-label': 'Choose a day' }, [
    previousDay,
    dayLabel,
    nextDay,
    todayButton,
  ]);

  function describeDay(key) {
    if (key === todayKey()) return 'Today';
    if (key === shiftDateKey(todayKey(), -1)) return 'Yesterday';
    return dayLong(key, locale);
  }

  function syncControls() {
    dayNav.hidden = mode !== 'daily';
    dayLabel.textContent = describeDay(dateKey);
    nextDay.disabled = dateKey >= todayKey();
    todayButton.disabled = dateKey === todayKey();
  }

  function goToDay(key) {
    dateKey = key;
    syncControls();
    animateNext = true;
    void view.refresh();
  }

  previousDay.addEventListener('click', () => goToDay(shiftDateKey(dateKey, -1)));
  nextDay.addEventListener('click', () => goToDay(shiftDateKey(dateKey, 1)));
  todayButton.addEventListener('click', () => goToDay(todayKey()));

  // ---------- mount ----------

  container.replaceChildren(
    pageHeader({
      title: 'Analytics',
      description: 'Trends in your active browsing time.',
    }),
    el('div', { class: 'db-toolbar' }, [modeControl, dayNav]),
    results,
  );
  syncControls();
  void view.start();

  return { unmount: () => view.dispose() };
}
