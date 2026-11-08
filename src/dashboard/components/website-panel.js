import { el } from '../../ui/dom.js';
import { usageList } from './usage-list.js';

/**
 * A card listing the most-used websites.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {{domain: string, ms: number, share: number}[]} options.ranked full ranking
 * @param {number} [options.limit]
 */
export function websitePanel({ title, ranked, limit = 8 }) {
  const shown = ranked.slice(0, limit);
  const hidden = ranked.length - shown.length;

  return el('section', { class: 'bw-card db-panel', 'aria-label': title }, [
    el('div', { class: 'db-panel-head' }, [
      el('h2', { class: 'db-panel-title', text: title }),
      el('a', { class: 'db-link', href: '#websites' }, ['All websites']),
    ]),
    usageList(shown),
    hidden > 0 && el('p', { class: 'db-more', text: `+${hidden} more on the Websites page` }),
  ]);
}
