import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { ROUTES } from './router.js';

/**
 * Builds the dashboard frame (sidebar navigation + main content area).
 * Navigation items are plain links to #<route>, so they work with the keyboard,
 * middle-click, and the browser's back button without extra code.
 *
 * @param {HTMLElement} root
 */
export function createShell(root) {
  const links = new Map(
    ROUTES.map((route) => [
      route.id,
      el('a', { class: 'db-nav-link', href: `#${route.id}` }, [
        icon(route.icon, { size: 18 }),
        el('span', { text: route.label }),
      ]),
    ]),
  );

  const main = el('main', { class: 'db-main', id: 'main-content', tabindex: '-1' });

  root.replaceChildren(
    el('div', { class: 'db-shell' }, [
      el('aside', { class: 'db-sidebar' }, [
        el('div', { class: 'db-brand' }, [
          el('img', {
            class: 'db-logo',
            src: chrome.runtime.getURL('icons/icon-32.png'),
            alt: '',
            width: 24,
            height: 24,
          }),
          el('span', { class: 'db-brand-name', text: 'BrowseWise' }),
        ]),
        el('nav', { class: 'db-nav', 'aria-label': 'Main' }, [...links.values()]),
        el('div', { class: 'db-sidebar-foot' }, [
          icon('shield-check', { size: 16 }),
          el('p', { text: 'Your data stays on this device.' }),
        ]),
      ]),
      main,
    ]),
  );

  return {
    main,

    /** Marks the current page in the navigation (visually and for screen readers). */
    setActive(routeId) {
      for (const [id, link] of links) {
        if (id === routeId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
  };
}
