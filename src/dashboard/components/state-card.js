import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

/**
 * A centred message card used for empty, error, and "coming soon" states.
 *
 * @param {object} options
 * @param {string} options.iconName
 * @param {string} options.title
 * @param {string} [options.text]
 * @param {'neutral'|'danger'} [options.tone]
 * @param {{label: string, onClick: () => void, iconName?: string}} [options.action]
 */
export function stateCard({ iconName, title, text, tone = 'neutral', action }) {
  return el(
    'div',
    { class: 'bw-card bw-state db-state', role: tone === 'danger' ? 'alert' : null },
    [
      el('div', { class: `bw-state-icon${tone === 'danger' ? ' bw-state-icon-danger' : ''}` }, [
        icon(iconName, { size: 20 }),
      ]),
      el('h2', { class: 'bw-state-title', text: title }),
      text && el('p', { class: 'bw-state-text', text }),
      action &&
        el(
          'button',
          { type: 'button', class: 'bw-btn bw-btn-secondary', onClick: action.onClick },
          [
            action.iconName && icon(action.iconName, { size: 14 }),
            el('span', { text: action.label }),
          ],
        ),
    ],
  );
}
