import { formatDuration } from '../../shared/format.js';
import { DEFAULT_RANGE_ID, RANGES } from '../../shared/range.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { segmentedControl } from '../components/segmented-control.js';
import { stateCard } from '../components/state-card.js';
import { usageList } from '../components/usage-list.js';

const RANGE_PHRASES = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days' };

/** Ranks come from the full ranking, so filtering never renumbers rows. */
function withRanks(ranked) {
  return ranked.map((site, index) => ({ ...site, rank: index + 1 }));
}

function summaryLine(data, visibleCount, query) {
  const websites = data.ranked.length === 1 ? 'website' : 'websites';
  const base = `${data.ranked.length} ${websites} \u00b7 ${formatDuration(data.totalMs)} total`;
  if (query !== '') return `${visibleCount} of ${base}`;
  if (data.dayCount > 1) return `${base} across ${data.daysWithData} of ${data.dayCount} days`;
  return base;
}

function renderResults(data, query) {
  if (data.ranked.length === 0) {
    return stateCard({
      iconName: 'hourglass',
      title: 'No browsing time recorded',
      text: `Nothing was recorded ${RANGE_PHRASES[data.rangeId] ?? 'for this period'}.`,
    });
  }

  const needle = query.trim().toLowerCase();
  const visible = withRanks(data.ranked).filter((site) =>
    site.domain.toLowerCase().includes(needle),
  );

  if (visible.length === 0) {
    return stateCard({
      iconName: 'search',
      title: 'No websites match',
      text: `Nothing matches \u201c${query.trim()}\u201d. Try a shorter search.`,
    });
  }

  return el('section', { class: 'bw-card db-panel', 'aria-label': 'Website usage' }, [
    el('div', { class: 'db-panel-head' }, [
      el('p', { class: 'db-summary', text: summaryLine(data, visible.length, needle) }),
    ]),
    usageList(visible, { showRank: true }),
  ]);
}

/**
 * Mounts the Websites page: a full ranking with a time-range switch and a filter.
 * The controls live outside the data region, so refreshes never steal focus from
 * the search box.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(rangeId: string, now: number) => Promise<object>} deps.loadWebsiteUsage
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @returns {{unmount: () => void}}
 */
export function mountWebsitesPage(
  container,
  { loadWebsiteUsage, requestLiveFlush, subscribe, now = Date.now },
) {
  let rangeId = DEFAULT_RANGE_ID;
  let query = '';

  const results = el('div', { class: 'db-results' });

  const view = createDataView({
    container: results,
    load: () => loadWebsiteUsage(rangeId, now()),
    requestLiveFlush,
    subscribe,
    renderReady: (data) => renderResults(data, query),
  });

  const search = el('input', {
    type: 'search',
    class: 'bw-input',
    placeholder: 'Filter websites',
    'aria-label': 'Filter websites',
    autocomplete: 'off',
    spellcheck: 'false',
    onInput: (event) => {
      query = event.target.value;
      view.rerender();
    },
  });

  const range = segmentedControl({
    label: 'Time range',
    options: RANGES.map(({ id, label }) => ({ id, label })),
    value: rangeId,
    onChange: (id) => {
      rangeId = id;
      void view.refresh();
    },
  });

  container.replaceChildren(
    pageHeader({
      title: 'Websites',
      description: 'Where your active browsing time goes, ranked from most to least.',
    }),
    el('div', { class: 'db-toolbar' }, [
      el('div', { class: 'bw-input-wrap db-search' }, [icon('search', { size: 16 }), search]),
      range,
    ]),
    results,
  );

  void view.start();
  return { unmount: () => view.dispose() };
}
