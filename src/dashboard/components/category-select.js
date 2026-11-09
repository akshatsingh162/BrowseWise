import { CATEGORIES } from '../../shared/categories.config.js';
import { categoryLabel } from '../../shared/categorizer.js';
import { el } from '../../ui/dom.js';

/** Value of the "reset" option, which cannot collide with a category id. */
export const AUTOMATIC_VALUE = '__automatic__';

/**
 * A dropdown showing a website's category, which the user can change.
 * While the category was changed by the user, a dot marks it and an extra option
 * resets it to the automatic choice.
 *
 * @param {object} options
 * @param {string} options.domain
 * @param {string} options.categoryId   the category currently in effect
 * @param {string} options.automaticId  what the built-in rules would choose
 * @param {boolean} options.overridden  whether the user changed it
 * @param {(value: string) => void} options.onChange category id, or AUTOMATIC_VALUE
 * @returns {HTMLElement}
 */
export function categorySelect({ domain, categoryId, automaticId, overridden, onChange }) {
  const options = CATEGORIES.map((category) =>
    el('option', {
      value: category.id,
      text: category.label,
      selected: category.id === categoryId,
    }),
  );
  if (overridden) {
    options.push(
      el('option', {
        value: AUTOMATIC_VALUE,
        text: `Reset to automatic (${categoryLabel(automaticId)})`,
      }),
    );
  }

  const select = el(
    'select',
    {
      class: 'bw-select db-cat-select',
      'data-domain': domain,
      'aria-label': `Category for ${domain}${overridden ? ' (changed by you)' : ''}`,
      title: overridden
        ? `Changed by you. Automatic category: ${categoryLabel(automaticId)}.`
        : 'Chosen automatically. Pick another category to change it.',
    },
    options,
  );
  select.addEventListener('change', () => onChange(select.value));

  return el('span', { class: 'db-cat' }, [
    overridden &&
      el('span', { class: 'db-cat-dot', 'aria-hidden': 'true', title: 'Changed by you' }),
    select,
  ]);
}
