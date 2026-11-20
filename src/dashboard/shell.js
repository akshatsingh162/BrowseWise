import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createDock } from './dock.js';
import { ROUTES } from './router.js';

/**
 * Builds the dashboard frame: the main content area, a floating navigation dock, and two
 * small floating buttons in the top corners (the logo, and a privacy reminder). Nothing
 * takes a column of the window, so the page gets all of it.
 *
 * The dock comes before the content in the document, so keyboard users reach the navigation
 * first, even though it is drawn at the bottom of the window.
 *
 * @param {HTMLElement} root
 * @param {{autoHide?: boolean}} [options]
 */
export function createShell(root, { autoHide = true } = {}) {
  const dock = createDock({ routes: ROUTES, autoHide });

  const brand = el(
    'a',
    { class: 'dk-corner dk-brand', href: '#overview', 'aria-label': 'BrowseWise, go to Overview' },
    [
      el('img', {
        class: 'dk-logo',
        src: chrome.runtime.getURL('icons/logo.svg'),
        alt: '',
        width: 22,
        height: 22,
      }),
      el('span', { class: 'dk-tip dk-tip-below', 'aria-hidden': 'true' }, [
        el('span', { text: 'BrowseWise' }),
      ]),
    ],
  );

  const privacy = el(
    'a',
    {
      class: 'dk-corner dk-privacy',
      href: '#settings',
      'aria-label': 'Your data stays on this device. Open Settings.',
    },
    [
      icon('shield-check', { size: 18 }),
      el('span', { class: 'dk-tip dk-tip-below', 'aria-hidden': 'true' }, [
        el('span', { text: 'Your data stays on this device' }),
      ]),
    ],
  );

  const main = el('main', { class: 'db-main', id: 'main-content', tabindex: '-1' });

  root.replaceChildren(el('div', { class: 'db-shell' }, [brand, privacy, dock.element, main]));

  return {
    main,
    dock,
    setActive: (routeId) => dock.setActive(routeId),
    setAutoHide: (value) => dock.setAutoHide(value),
    destroy: () => dock.destroy(),
  };
}
