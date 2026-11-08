import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

/**
 * A single headline number.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {string} options.iconName
 * @param {string|Node} options.value      text, or a node for richer values
 * @param {string|Node} [options.hint]     small supporting line
 * @param {string} [options.hintTitle]     tooltip for the hint
 */
export function statCard({ label, iconName, value, hint, hintTitle }) {
  return el('section', { class: 'bw-card db-stat', 'aria-label': label }, [
    el('div', { class: 'db-stat-top' }, [
      el('span', { class: 'db-stat-label', text: label }),
      el('span', { class: 'db-stat-icon' }, [icon(iconName, { size: 16 })]),
    ]),
    el('div', { class: 'db-stat-value bw-num' }, [value]),
    hint && el('div', { class: 'db-stat-hint', title: hintTitle }, [hint]),
  ]);
}
