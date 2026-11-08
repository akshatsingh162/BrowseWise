import '../ui/styles/tokens.css';
import '../ui/styles/base.css';
import '../ui/styles/components.css';

import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * Placeholder. The full dashboard (router, five pages, charts) arrives in Phase 4.
 * It exists now so the popup's "Open dashboard" button has a real destination.
 */
document.getElementById('app').replaceChildren(
  el(
    'div',
    {
      class: 'bw-card bw-state',
      style: 'max-width: 420px; margin: 20vh auto 0; padding: 40px 24px',
    },
    [
      el('div', { class: 'bw-state-icon' }, [icon('hourglass', { size: 20 })]),
      el('h1', { class: 'bw-state-title', text: 'Dashboard coming soon' }),
      el('p', {
        class: 'bw-state-text',
        text: 'Tracking is already running. The full analytics dashboard is built in the next phase.',
      }),
    ],
  ),
);
