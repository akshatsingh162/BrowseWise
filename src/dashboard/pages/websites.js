import { CATEGORIES } from '../../shared/categories.config.js';
import { categorize, categorizeAutomatically } from '../../shared/categorizer.js';
import { formatDuration } from '../../shared/format.js';
import { DEFAULT_RANGE_ID, RANGES } from '../../shared/range.js';
import { withOverride } from '../../shared/storage/category-repo.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { AUTOMATIC_VALUE, categorySelect } from '../components/category-select.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { segmentedControl } from '../components/segmented-control.js';
import { stateCard } from '../components/state-card.js';
import { usageList } from '../components/usage-list.js';

const RANGE_PHRASES = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days' };
const STATUS_MS = 3000;

/** Ranks come from the full ranking, so filtering never renumbers rows. */
function withRanks(ranked) {
  return ranked.map((site, index) => ({ ...site, rank: index + 1 }));
}

function summaryLine(data, visibleCount, filtered) {
  const websites = data.ranked.length === 1 ? 'website' : 'websites';
  const base = `${data.ranked.length} ${websites} \u00b7 ${formatDuration(data.totalMs)} total`;
  if (filtered) return `${visibleCount} of ${base}`;
  if (data.dayCount > 1) return `${base} across ${data.daysWithData} of ${data.dayCount} days`;
  return base;
}

/**
 * @param {object} data loaded website usage
 * @param {{query: string, categoryId: string, overrides: object,
 *          onCategoryChange: (domain: string, value: string) => void}} view current view state
 */
function renderResults(data, { query, categoryId, overrides, onCategoryChange }) {
  if (data.ranked.length === 0) {
    return stateCard({
      iconName: 'hourglass',
      title: 'No browsing time recorded',
      text: `Nothing was recorded ${RANGE_PHRASES[data.rangeId] ?? 'for this period'}.`,
    });
  }

  const needle = query.trim().toLowerCase();
  const visible = withRanks(data.ranked)
    .map((site) => ({ ...site, category: categorize(site.domain, overrides) }))
    .filter(
      (site) =>
        site.domain.toLowerCase().includes(needle) &&
        (categoryId === '' || site.category.categoryId === categoryId),
    );

  if (visible.length === 0) {
    return stateCard({
      iconName: 'search',
      title: 'No websites match',
      text:
        categoryId !== ''
          ? 'Nothing matches the current filters. Try clearing the search or choosing another category.'
          : `Nothing matches \u201c${query.trim()}\u201d. Try a shorter search.`,
    });
  }

  const categoryCell = (site) =>
    categorySelect({
      domain: site.domain,
      categoryId: site.category.categoryId,
      automaticId: categorizeAutomatically(site.domain).categoryId,
      overridden: site.category.source === 'override',
      onChange: (value) => onCategoryChange(site.domain, value),
    });

  return el('section', { class: 'bw-card db-panel', 'aria-label': 'Website usage' }, [
    el('div', { class: 'db-panel-head' }, [
      el('p', {
        class: 'db-summary',
        text: summaryLine(data, visible.length, needle !== '' || categoryId !== ''),
      }),
    ]),
    usageList(visible, { showRank: true, categoryCell }),
    el('p', {
      class: 'db-cat-note',
      text: 'Categories describe the website, not what you were doing there. Change one with the dropdown.',
    }),
  ]);
}

/**
 * Mounts the Websites page: a full ranking with a time-range switch, a text
 * filter, a category filter, and a category dropdown on every row.
 *
 * The controls live outside the data region, so refreshes never steal focus from
 * the search box. Category changes are applied to the screen immediately and then
 * saved; if saving fails the change is rolled back and the user is told.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(rangeId: string, now: number) => Promise<object>} deps.loadWebsiteUsage
 * @param {(domain: string, categoryId: string|null) => Promise<unknown>} deps.setCategoryOverride
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @returns {{unmount: () => void}}
 */
export function mountWebsitesPage(
  container,
  { loadWebsiteUsage, setCategoryOverride, requestLiveFlush, subscribe, now = Date.now },
) {
  let rangeId = DEFAULT_RANGE_ID;
  let query = '';
  let categoryId = '';
  let overrides = {};
  let pendingSaves = 0;
  let statusTimer;

  const results = el('div', { class: 'db-results' });
  const status = el('p', { class: 'db-status', role: 'status' });

  function announce(text) {
    clearTimeout(statusTimer);
    status.textContent = text;
    statusTimer = setTimeout(() => (status.textContent = ''), STATUS_MS);
  }

  function focusCategorySelect(domain) {
    const select = [...results.querySelectorAll('select[data-domain]')].find(
      (candidate) => candidate.dataset.domain === domain,
    );
    select?.focus();
  }

  async function changeCategory(domain, value) {
    const automaticId = categorizeAutomatically(domain).categoryId;
    // Choosing the automatic category is the same as having no override.
    const next = value === AUTOMATIC_VALUE || value === automaticId ? null : value;

    const previous = overrides;
    overrides = withOverride(overrides, domain, next);
    view.rerender();
    focusCategorySelect(domain);

    pendingSaves += 1;
    try {
      await setCategoryOverride(domain, next);
      announce(next === null ? `${domain} reset to automatic.` : `Category saved for ${domain}.`);
    } catch (error) {
      console.error('[BrowseWise] could not save category', error);
      overrides = previous;
      view.rerender();
      focusCategorySelect(domain);
      announce('Could not save the category. Please try again.');
    } finally {
      pendingSaves -= 1;
    }
  }

  const view = createDataView({
    container: results,
    load: async () => {
      const data = await loadWebsiteUsage(rangeId, now());
      // A load that started before a save must not undo the user's change on screen.
      if (pendingSaves === 0) overrides = data.overrides ?? {};
      return data;
    },
    requestLiveFlush,
    subscribe,
    renderReady: (data) =>
      renderResults(data, { query, categoryId, overrides, onCategoryChange: changeCategory }),
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

  const categoryFilter = el(
    'select',
    {
      class: 'bw-select',
      'aria-label': 'Filter by category',
      onChange: (event) => {
        categoryId = event.target.value;
        view.rerender();
      },
    },
    [
      el('option', { value: '', text: 'All categories' }),
      ...CATEGORIES.map((category) => el('option', { value: category.id, text: category.label })),
    ],
  );

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
      el('div', { class: 'db-toolbar-filters' }, [
        el('div', { class: 'bw-input-wrap db-search' }, [icon('search', { size: 16 }), search]),
        categoryFilter,
      ]),
      range,
    ]),
    status,
    results,
  );

  void view.start();
  return {
    unmount: () => {
      clearTimeout(statusTimer);
      view.dispose();
    },
  };
}
