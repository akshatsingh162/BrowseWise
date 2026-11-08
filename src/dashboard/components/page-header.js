import { el } from '../../ui/dom.js';

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {Node[]} [options.actions] controls shown on the right
 */
export function pageHeader({ title, description, actions = [] }) {
  return el('header', { class: 'db-page-header' }, [
    el('div', {}, [
      el('h1', { class: 'db-page-title', text: title }),
      description && el('p', { class: 'db-page-desc', text: description }),
    ]),
    actions.length > 0 && el('div', { class: 'db-page-actions' }, actions),
  ]);
}
