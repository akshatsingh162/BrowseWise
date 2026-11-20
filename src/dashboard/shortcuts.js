/**
 * Number keys 1 to 7 jump to the pages, in the order of the navigation dock. They are
 * ignored while typing in a field, while a dialog is open, and with Ctrl, Alt or Cmd held
 * (so browser shortcuts such as Ctrl+1 are never taken over).
 *
 * @param {object} options
 * @param {{id: string}[]} options.routes
 * @param {Document} [options.doc]
 * @param {Window} [options.win]
 * @returns {() => void} detach
 */
export function attachNavigationShortcuts({ routes, doc = document, win = window }) {
  function isTyping(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(
      target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'),
    );
  }

  function onKeyDown(event) {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (!/^[1-9]$/.test(event.key)) return;
    if (isTyping(event.target) || doc.querySelector('.db-modal-overlay')) return;

    const route = routes[Number(event.key) - 1];
    if (!route) return;
    event.preventDefault();
    win.location.hash = `#${route.id}`;
  }

  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
