/**
 * Minimal hash router. Each page lives at #<id> (for example #websites), so the
 * browser's back/forward buttons and bookmarks work with no server involved.
 */

export const ROUTES = Object.freeze([
  Object.freeze({ id: 'overview', label: 'Overview', icon: 'layout-dashboard' }),
  Object.freeze({ id: 'analytics', label: 'Analytics', icon: 'chart-column' }),
  Object.freeze({ id: 'websites', label: 'Websites', icon: 'globe' }),
  Object.freeze({ id: 'goals', label: 'Goals & limits', icon: 'target' }),
  Object.freeze({ id: 'settings', label: 'Settings', icon: 'settings' }),
]);

export const DEFAULT_ROUTE = 'overview';

/**
 * Turns a location hash into a known route id. Anything unrecognised (empty,
 * misspelled, or tampered with) falls back to the default page.
 *
 * @param {string|null|undefined} hash e.g. "#websites"
 * @returns {string}
 */
export function parseRoute(hash) {
  const id = String(hash ?? '')
    .replace(/^#\/?/, '')
    .split(/[/?]/)[0];
  return ROUTES.some((route) => route.id === id) ? id : DEFAULT_ROUTE;
}

/**
 * @param {object} options
 * @param {(routeId: string) => void} options.onNavigate called now and on every hash change
 * @param {Window} [options.win]
 */
export function createRouter({ onNavigate, win = window }) {
  const handle = () => onNavigate(parseRoute(win.location.hash));
  return {
    start() {
      win.addEventListener('hashchange', handle);
      handle();
    },
    stop() {
      win.removeEventListener('hashchange', handle);
    },
  };
}
