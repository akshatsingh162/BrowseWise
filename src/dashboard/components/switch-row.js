import { el } from '../../ui/dom.js';

/** A labelled on/off switch with a line of explanation. */
export function switchRow({ id, label, description }) {
  const button = el('button', {
    type: 'button',
    class: 'bw-switch',
    role: 'switch',
    id,
    'aria-checked': 'false',
    'aria-describedby': `${id}-help`,
  });
  return {
    button,
    element: el('div', { class: 'db-switch-block' }, [
      el('div', { class: 'db-switch-row' }, [button, el('label', { for: id, text: label })]),
      el('p', { class: 'db-config-desc', id: `${id}-help`, text: description }),
    ]),
  };
}
