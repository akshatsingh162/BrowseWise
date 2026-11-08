import { el } from '../../ui/dom.js';

/**
 * A small set of mutually exclusive buttons (for example Today / 7 days / 30 days).
 * Uses aria-pressed so assistive technology announces which one is selected.
 *
 * @param {object} options
 * @param {string} options.label accessible name of the group
 * @param {{id: string, label: string}[]} options.options
 * @param {string} options.value currently selected id
 * @param {(id: string) => void} options.onChange
 * @returns {HTMLElement}
 */
export function segmentedControl({ label, options, value, onChange }) {
  const group = el('div', { class: 'bw-segmented', role: 'group', 'aria-label': label });

  const select = (selectedId) => {
    group.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.id === selectedId));
    });
  };

  for (const option of options) {
    group.append(
      el('button', {
        type: 'button',
        class: 'bw-segmented-btn',
        text: option.label,
        'data-id': option.id,
        'aria-pressed': String(option.id === value),
        onClick: () => {
          select(option.id);
          onChange(option.id);
        },
      }),
    );
  }
  return group;
}
