import { formatDuration, formatPercent } from '../../shared/format.js';
import { summarizeCategories } from '../../shared/category-stats.js';
import { el } from '../../ui/dom.js';

const GROUP_ORDER = ['productive', 'entertainment', 'social'];

function groupStat(group) {
  return el('div', { class: 'db-catgroup', title: group.description }, [
    el('span', { class: 'db-catgroup-label', text: group.label }),
    el('span', { class: 'db-catgroup-value bw-num', text: formatDuration(group.ms) }),
    el('span', {
      class: 'db-catgroup-share bw-num',
      text: `${formatPercent(group.share)} of the total`,
    }),
  ]);
}

/**
 * "Time by category": three headline groups, a stacked share bar, and a list.
 * Returns null when there is no time to show.
 *
 * Colour is never the only signal: every row carries a text label and a percentage.
 *
 * @param {object} options
 * @param {{domain: string, ms: number}[]} options.sites
 * @param {Record<string, string>} [options.overrides]
 * @param {string} [options.title]
 * @returns {HTMLElement|null}
 */
export function categoryPanel({ sites, overrides = {}, title = 'Time by category' }) {
  const summary = summarizeCategories(sites, overrides);
  if (summary.totalMs <= 0) return null;

  const spoken = summary.categories
    .map((category) => `${category.label} ${formatPercent(category.share)}`)
    .join(', ');

  const bar = el(
    'div',
    { class: 'db-catbar', role: 'img', 'aria-label': `Share of time by category: ${spoken}` },
    summary.categories.map((category) =>
      el('span', {
        class: 'db-catbar-segment',
        style: `width: ${category.share * 100}%; background: var(--bw-cat-${category.id})`,
        title: `${category.label}: ${formatDuration(category.ms)} (${formatPercent(category.share)})`,
      }),
    ),
  );

  const rows = summary.categories.map((category) =>
    el('li', { class: 'db-catrow' }, [
      el('span', {
        class: 'db-catswatch',
        style: `background: var(--bw-cat-${category.id})`,
        'aria-hidden': 'true',
      }),
      el('span', { class: 'db-catrow-label', text: category.label }),
      el('span', { class: 'db-catrow-time bw-num', text: formatDuration(category.ms) }),
      el('span', { class: 'db-catrow-pct bw-num', text: formatPercent(category.share) }),
    ]),
  );

  return el('section', { class: 'bw-card db-panel db-catpanel', 'aria-label': title }, [
    el('div', { class: 'db-panel-head' }, [el('h2', { class: 'db-panel-title', text: title })]),
    el(
      'div',
      { class: 'db-catgroups' },
      GROUP_ORDER.map((key) => groupStat(summary.groups[key])),
    ),
    bar,
    el('ul', { class: 'db-catlist' }, rows),
    el('p', {
      class: 'db-cat-note',
      text: 'Categories describe the website, not what you were doing there. You can change a site\u2019s category on the Websites page.',
    }),
  ]);
}
