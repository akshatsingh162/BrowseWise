import { describeComparison, formatDuration, formatPercent } from '../../shared/format.js';
import { el } from '../../ui/dom.js';
import { createFavicon } from '../../ui/favicon-image.js';
import { icon } from '../../ui/icons.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { statCard } from '../components/stat-card.js';
import { stateCard } from '../components/state-card.js';
import { usageList } from '../components/usage-list.js';

const TOP_SITES_SHOWN = 8;
const COMPARISON_ICONS = {
  up: 'arrow-up-right',
  down: 'arrow-down-right',
  flat: 'minus',
  none: 'minus',
};

function totalCard({ overview }) {
  const comparison = describeComparison(overview.comparison);
  const hint = el('span', { class: 'db-hint-with-icon' }, [
    icon(COMPARISON_ICONS[comparison.direction], { size: 14 }),
    comparison.label,
  ]);
  return statCard({
    label: 'Screen time today',
    iconName: 'clock',
    value: formatDuration(overview.totalMs),
    hint,
    hintTitle: comparison.tooltip,
  });
}

function websitesCard({ overview }) {
  return statCard({
    label: 'Websites visited',
    iconName: 'globe',
    value: String(overview.siteCount),
    hint: overview.siteCount === 1 ? 'website today' : 'websites today',
  });
}

function mostUsedCard({ overview }) {
  const top = overview.topSite;
  if (!top) {
    return statCard({
      label: 'Most used',
      iconName: 'trophy',
      value: '\u2014',
      hint: 'Nothing recorded yet',
    });
  }
  return statCard({
    label: 'Most used',
    iconName: 'trophy',
    value: el('span', { class: 'db-stat-site' }, [
      createFavicon(top.domain, { size: 20 }),
      el('span', { class: 'db-stat-site-name', text: top.domain, title: top.domain }),
    ]),
    hint: `${formatDuration(top.ms)} \u00b7 ${formatPercent(top.share)} of today`,
  });
}

function averageCard({ average }) {
  if (average.daysCounted === 0) {
    return statCard({
      label: 'Daily average',
      iconName: 'calendar-days',
      value: '\u2014',
      hint: 'No earlier days recorded yet',
    });
  }
  const days = average.daysCounted;
  return statCard({
    label: 'Daily average',
    iconName: 'calendar-days',
    value: formatDuration(average.averageMs),
    hint: `Across ${days} earlier ${days === 1 ? 'day' : 'days'} with data (up to 7)`,
    hintTitle: 'Mean of the last 7 days that have recorded time. Today is not included.',
  });
}

function topWebsitesCard({ overview }) {
  const sites = overview.ranked.slice(0, TOP_SITES_SHOWN);
  const hidden = overview.ranked.length - sites.length;

  const body =
    sites.length === 0
      ? stateCard({
          iconName: 'hourglass',
          title: 'No browsing time yet today',
          text: 'Open a website and BrowseWise starts counting while you are active.',
        })
      : el('div', {}, [
          usageList(sites),
          hidden > 0 && el('p', { class: 'db-more', text: `+${hidden} more on the Websites page` }),
        ]);

  return el('section', { class: 'bw-card db-panel', 'aria-label': 'Top websites today' }, [
    el('div', { class: 'db-panel-head' }, [
      el('h2', { class: 'db-panel-title', text: 'Top websites today' }),
      el('a', { class: 'db-link', href: '#websites' }, [
        'View all',
        icon('external-link', { size: 12 }),
      ]),
    ]),
    body,
  ]);
}

/**
 * Mounts the Overview page into `container`.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(now: number) => Promise<object>} deps.loadOverviewData
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @returns {{unmount: () => void}}
 */
export function mountOverviewPage(
  container,
  { loadOverviewData, requestLiveFlush, subscribe, now = Date.now },
) {
  const results = el('div', { class: 'db-results' });
  container.replaceChildren(
    pageHeader({
      title: 'Overview',
      description: 'Your active browsing time today, at a glance.',
    }),
    results,
  );

  const view = createDataView({
    container: results,
    load: () => loadOverviewData(now()),
    requestLiveFlush,
    subscribe,
    renderReady: (data) =>
      el('div', { class: 'db-stack' }, [
        el('div', { class: 'db-stats' }, [
          totalCard(data),
          websitesCard(data),
          mostUsedCard(data),
          averageCard(data),
        ]),
        topWebsitesCard(data),
      ]),
  });
  void view.start();

  return { unmount: () => view.dispose() };
}
