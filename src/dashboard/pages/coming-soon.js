import { pageHeader } from '../components/page-header.js';
import { stateCard } from '../components/state-card.js';

/**
 * Honest placeholder for pages that are not built yet.
 * @param {HTMLElement} container
 * @param {{title: string, description: string, iconName: string, text: string}} options
 */
export function mountComingSoonPage(container, { title, description, iconName, text }) {
  container.replaceChildren(
    pageHeader({ title, description }),
    stateCard({ iconName, title: 'Coming soon', text }),
  );
  return { unmount() {} };
}
