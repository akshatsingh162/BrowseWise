/**
 * Minimal hash router. Each page lives at #<id> (for example #websites), so the
 * browser's back/forward buttons and bookmarks work with no server involved.
 * A page can take parameters after a question mark: #analytics?day=2026-11-07.
 */

export const ROUTES = Object.freeze([
  Object.freeze({ id: 'overview', label: 'Overview', icon: 'layout-dashboard' }),
  Object.freeze({ id: 'analytics', label: 'Analytics', icon: 'chart-column' }),
  Object.freeze({ id: 'websites', label: 'Websites', icon: 'globe' }),
  Object.freeze({ id: 'history', label: 'History', icon: 'history' }),
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
 * The parameters in a location hash, such as {day: "2026-11-07"} for
 * "#analytics?day=2026-11-07". Values are untrusted text: pages must validate them.
 * Built with Object.fromEntries so a parameter named "__proto__" stays harmless.
 *
 * @param {string|null|undefined} hash
 * @returns {Record<string, string>}
 */
export function parseParams(hash) {
  const text = String(hash ?? '');
  const queryStart = text.indexOf('?');
  if (queryStart === -1) return {};
  return Object.fromEntries(new URLSearchParams(text.slice(queryStart + 1)));
}

/**
 * @param {object} options
 * @param {(routeId: string, params: Record<string, string>) => void} options.onNavigate
 *        called now and on every hash change
 * @param {Window} [options.win]
 */
export function createRouter({ onNavigate, win = window }) {
  const handle = () => onNavigate(parseRoute(win.location.hash), parseParams(win.location.hash));
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
