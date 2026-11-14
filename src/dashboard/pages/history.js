import { formatDuration } from '../../shared/format.js';
import { dayLong, dayMonth, dayShort } from '../../shared/labels.js';
import { normalizeLimitDomain } from '../../shared/limits.js';
import { shiftDateKey } from '../../shared/dates.js';
import { el } from '../../ui/dom.js';
import { createFavicon } from '../../ui/favicon-image.js';
import { trendChartConfig } from '../charts/chart-configs.js';
import { chartCard } from '../components/chart-card.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { segmentedControl } from '../components/segmented-control.js';
import { statCard } from '../components/stat-card.js';
import { stateCard } from '../components/state-card.js';
import { DEFAULT_SITE_RANGE_ID, SITE_RANGES } from '../history-data.js';

const VIEWS = [
  { id: 'days', label: 'Days' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'site', label: 'One website' },
];

/** How many rows are shown before "Show more". */
export const DAYS_PAGE_SIZE = 30;
export const WEEKS_PAGE_SIZE = 12;

const SUGGESTIONS_ID = 'history-site-suggestions';

const textValue = (text) => el('span', { class: 'db-stat-text', text });

/** The default way to open a day: the Analytics page, on that day. */
function openDayInAnalytics(dateKey) {
  window.location.hash = `#analytics?day=${dateKey}`;
}

function bar(share, title) {
  return el('div', { class: 'bw-bar', title }, [
    el('div', { class: 'bw-bar-fill', style: `width: ${Math.min(Math.max(share, 0), 1) * 100}%` }),
  ]);
}

/**
 * Mounts the History page: every recorded day, the same days grouped into weeks, and
 * the history of a single website.
 *
 * The view switch, the website form and the range switch live outside the data region,
 * so a background refresh never wipes what the user typed. "Show more" counts live in
 * this module's state, so a refresh keeps the list as long as the user left it.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(now: number) => Promise<object>} deps.loadHistoryOverview
 * @param {(domain: string|null, rangeId: string, now: number) => Promise<object>} deps.loadSiteHistory
 * @param {(canvas: HTMLCanvasElement, config: object) => {destroy: () => void}} deps.createChart
 * @param {() => object} deps.readTheme
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @param {string} [deps.locale]
 * @param {(dateKey: string) => void} [deps.openDay] called when a chart point is clicked
 * @returns {{unmount: () => void}}
 */
export function mountHistoryPage(
  container,
  {
    loadHistoryOverview,
    loadSiteHistory,
    createChart,
    readTheme,
    requestLiveFlush,
    subscribe,
    now = Date.now,
    locale,
    openDay = openDayInAnalytics,
  },
) {
  let viewId = 'days';
  let daysShown = DAYS_PAGE_SIZE;
  let weeksShown = WEEKS_PAGE_SIZE;
  let siteDomain = null;
  let siteRangeId = DEFAULT_SITE_RANGE_ID;
  // Animate when the user changes what is shown, not on silent background refreshes.
  let animateNext = true;

  // ---------- rendering ----------

  function dateLabel(dateKey, todayKey) {
    if (dateKey === todayKey) return 'Today';
    if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
    return dayShort(dateKey, locale);
  }

  function focusShowMore() {
    results.querySelector('.db-showmore')?.focus({ preventScroll: true });
  }

  function showMoreButton({ shown, total, step, noun, onMore }) {
    if (shown >= total) return null;
    const next = Math.min(step, total - shown);
    return el('div', { class: 'db-more db-more-actions' }, [
      el('span', { class: 'bw-num', text: `Showing ${shown} of ${total} ${noun}` }),
      el('button', {
        type: 'button',
        class: 'bw-btn bw-btn-secondary db-showmore',
        text: `Show ${next} more`,
        onClick: () => {
          onMore();
          view.rerender();
          focusShowMore();
        },
      }),
    ]);
  }

  function renderDays(data) {
    if (data.days.length === 0) {
      return stateCard({
        iconName: 'history',
        title: 'No history yet',
        text: 'Days appear here once BrowseWise has recorded some browsing time.',
      });
    }

    const longest = Math.max(...data.days.map((entry) => entry.totalMs));
    const shown = data.days.slice(0, daysShown);

    const rows = shown.map((entry) =>
      el('li', { class: 'db-history-row' }, [
        el('span', {
          class: 'db-history-date',
          text: dateLabel(entry.dateKey, data.todayKey),
          title: dayLong(entry.dateKey, locale),
        }),
        bar(entry.totalMs / longest, `${formatDuration(entry.totalMs)} on this day`),
        el('span', { class: 'db-time bw-num', text: formatDuration(entry.totalMs) }),
        el('span', { class: 'db-history-top' }, [
          entry.topSite && createFavicon(entry.topSite.domain, { size: 16 }),
          entry.topSite &&
            el('span', {
              class: 'db-site-name',
              text: entry.topSite.domain,
              title: `Most used: ${entry.topSite.domain}`,
            }),
        ]),
        el('a', {
          class: 'db-link',
          href: `#analytics?day=${entry.dateKey}`,
          'aria-label': `View ${dayLong(entry.dateKey, locale)} in Analytics`,
          text: 'View',
        }),
      ]),
    );

    return el('section', { class: 'bw-card db-panel', 'aria-label': 'Daily history' }, [
      el('div', { class: 'db-panel-head' }, [
        el('p', {
          class: 'db-summary',
          text: `${data.days.length} ${data.days.length === 1 ? 'day' : 'days'} recorded, newest first`,
        }),
      ]),
      el('ol', { class: 'db-history' }, rows),
      showMoreButton({
        shown: shown.length,
        total: data.days.length,
        step: DAYS_PAGE_SIZE,
        noun: 'days',
        onMore: () => (daysShown += DAYS_PAGE_SIZE),
      }),
    ]);
  }

  function renderWeeks(data) {
    if (data.weeks.length === 0) {
      return stateCard({
        iconName: 'history',
        title: 'No history yet',
        text: 'Weeks appear here once BrowseWise has recorded some browsing time.',
      });
    }

    const longest = Math.max(...data.weeks.map((week) => week.totalMs));
    const shown = data.weeks.slice(0, weeksShown);

    const rows = shown.map((week) => {
      const inProgress = data.todayKey >= week.weekStart && data.todayKey <= week.weekEnd;
      return el('li', { class: 'db-history-row db-history-week' }, [
        el('span', {
          class: 'db-history-date',
          text: `${dayMonth(week.weekStart, locale)} \u2013 ${dayMonth(week.weekEnd, locale)}`,
          title: inProgress ? 'This week is still in progress.' : undefined,
        }),
        bar(week.totalMs / longest, `${formatDuration(week.totalMs)} this week`),
        el('span', { class: 'db-time bw-num', text: formatDuration(week.totalMs) }),
        el('span', {
          class: 'db-history-avg bw-num',
          text: `${formatDuration(week.averageMs)} a day \u00b7 ${week.activeDays} active ${week.activeDays === 1 ? 'day' : 'days'}`,
          title: 'The daily average counts only days with recorded time.',
        }),
        el(
          'span',
          { class: 'db-history-flag' },
          inProgress ? [el('span', { class: 'bw-chip', text: 'This week' })] : [],
        ),
      ]);
    });

    return el('section', { class: 'bw-card db-panel', 'aria-label': 'Weekly history' }, [
      el('div', { class: 'db-panel-head' }, [
        el('p', { class: 'db-summary', text: 'Monday to Sunday, newest first' }),
      ]),
      el('ol', { class: 'db-history' }, rows),
      showMoreButton({
        shown: shown.length,
        total: data.weeks.length,
        step: WEEKS_PAGE_SIZE,
        noun: 'weeks',
        onMore: () => (weeksShown += WEEKS_PAGE_SIZE),
      }),
    ]);
  }

  function renderSite(data) {
    suggestions.replaceChildren(
      ...data.suggestions.map((domain) => el('option', { value: domain })),
    );

    if (data.domain === null) {
      return stateCard({
        iconName: 'search',
        title: 'Choose a website',
        text: 'Enter a website above to see how much time you spent on it, day by day.',
      });
    }

    const rangeLabel = SITE_RANGES.find((range) => range.id === data.rangeId).label;
    if (data.summary.totalMs <= 0) {
      return stateCard({
        iconName: 'hourglass',
        title: `No time on ${data.domain}`,
        text: data.visitedInLastYear
          ? `Nothing was recorded for this website in the last ${rangeLabel}. Try a longer range.`
          : 'BrowseWise has not recorded any time on this website in the last year.',
      });
    }

    const { summary, series } = data;
    const trend = chartCard({
      title: `${data.domain} over time`,
      description: `Daily time on this website for the last ${rangeLabel}. Click a point to open that day.`,
      spec: trendChartConfig({
        totals: series,
        onSelectDay: openDay,
        theme: readTheme(),
        animate: consumeAnimation(),
        locale,
      }),
      createChart,
      height: 260,
    });

    return {
      node: el('div', { class: 'db-stack' }, [
        el('div', { class: 'db-stats' }, [
          statCard({
            label: 'Total time',
            iconName: 'clock',
            value: formatDuration(summary.totalMs),
            hint: `Last ${rangeLabel}`,
          }),
          statCard({
            label: 'Days visited',
            iconName: 'calendar-days',
            value: String(summary.daysVisited),
            hint: `of ${series.length} days`,
          }),
          statCard({
            label: 'Average per visit day',
            iconName: 'trending-up',
            value: formatDuration(summary.averageMs),
            hint: 'Days with time only',
          }),
          statCard({
            label: 'Busiest day',
            iconName: 'activity',
            value: summary.busiestDay
              ? textValue(dayShort(summary.busiestDay.dateKey, locale))
              : '\u2014',
            hint: summary.busiestDay ? formatDuration(summary.busiestDay.totalMs) : '',
          }),
        ]),
        trend.element,
      ]),
      mounted: () => trend.mount(),
      destroy: () => trend.destroy(),
    };
  }

  function consumeAnimation() {
    const animate = animateNext;
    animateNext = false;
    return animate;
  }

  // ---------- data ----------

  const results = el('div', { class: 'db-results' });

  const view = createDataView({
    container: results,
    load: async () => {
      const kind = viewId;
      if (kind === 'site') {
        return { kind, data: await loadSiteHistory(siteDomain, siteRangeId, now()) };
      }
      return { kind, data: await loadHistoryOverview(now()) };
    },
    renderReady: ({ kind, data }) => {
      if (kind === 'days') return renderDays(data);
      if (kind === 'weeks') return renderWeeks(data);
      return renderSite(data);
    },
    requestLiveFlush,
    subscribe,
    // The chart should be drawn once, from fresh data, so its entry animation can play.
    flushFirst: true,
  });

  // ---------- controls ----------

  const suggestions = el('datalist', { id: SUGGESTIONS_ID });
  const siteInput = el('input', {
    id: 'history-site',
    type: 'text',
    class: 'bw-input bw-input-plain',
    placeholder: 'youtube.com',
    list: SUGGESTIONS_ID,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Website',
    'aria-describedby': 'history-site-error',
  });
  const siteError = el('p', { class: 'db-field-error', id: 'history-site-error', role: 'alert' });

  const siteForm = el(
    'form',
    {
      class: 'db-form db-history-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const parsed = normalizeLimitDomain(siteInput.value);
        siteError.textContent = parsed.ok ? '' : parsed.error;
        siteInput.setAttribute('aria-invalid', parsed.ok ? 'false' : 'true');
        if (!parsed.ok) return;

        siteDomain = parsed.domain;
        siteInput.value = parsed.domain; // show what was understood, e.g. a pasted address
        animateNext = true;
        void view.refresh();
      },
    },
    [
      el('div', { class: 'db-form-row' }, [
        el('div', { class: 'db-field db-field-grow' }, [
          el('label', { for: 'history-site', text: 'Website' }),
          siteInput,
          suggestions,
        ]),
        el('button', { type: 'submit', class: 'bw-btn bw-btn-primary', text: 'Show history' }),
      ]),
      siteError,
    ],
  );

  const viewControl = segmentedControl({
    label: 'History view',
    options: VIEWS,
    value: viewId,
    onChange: (id) => {
      viewId = id;
      syncControls();
      animateNext = true;
      void view.refresh();
    },
  });

  const rangeControl = segmentedControl({
    label: 'Time range',
    options: SITE_RANGES.map(({ id, label }) => ({ id, label })),
    value: siteRangeId,
    onChange: (id) => {
      siteRangeId = id;
      animateNext = true;
      if (siteDomain !== null) void view.refresh();
    },
  });

  function syncControls() {
    const isSite = viewId === 'site';
    siteForm.hidden = !isSite;
    rangeControl.hidden = !isSite;
  }

  // ---------- mount ----------

  container.replaceChildren(
    pageHeader({
      title: 'History',
      description: 'Every day BrowseWise has recorded, by day, by week, or for one website.',
    }),
    el('div', { class: 'db-toolbar' }, [viewControl, rangeControl]),
    siteForm,
    results,
  );
  syncControls();
  void view.start();

  return { unmount: () => view.dispose() };
}
