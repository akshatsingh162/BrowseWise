import { renderPopup } from './popup-view.js';

/**
 * Popup behaviour: loads data, tracks UI state, and re-renders.
 * Dependencies are injected so the logic can be tested without Chrome.
 *
 * Loading strategy: show stored data immediately, THEN ask the service worker to
 * flush the in-progress interval and update the screen. The popup is fast, and
 * the numbers are still accurate to the second.
 *
 * @param {object} deps
 * @param {HTMLElement} deps.root
 * @param {(now: number) => Promise<object>} deps.loadOverview
 * @param {() => Promise<void>} deps.requestLiveFlush
 * @param {() => Promise<void>|void} deps.openDashboard
 * @param {() => number} [deps.now]
 */
export function createPopupController({
  root,
  loadOverview,
  requestLiveFlush,
  openDashboard,
  now = Date.now,
}) {
  let state = { status: 'loading' };
  let latestRequest = 0;

  function render() {
    renderPopup(root, state, { onRetry: () => refresh(), onOpenDashboard: handleOpenDashboard });
  }

  async function handleOpenDashboard() {
    try {
      await openDashboard();
      window.close();
    } catch (error) {
      console.error('[BrowseWise] could not open dashboard', error);
    }
  }

  /**
   * @param {{flush?: boolean, silent?: boolean}} [options]
   *   flush:  ask the worker to write the in-progress interval first
   *   silent: keep the current screen while loading, and keep last good data on failure
   */
  async function refresh({ flush = false, silent = false } = {}) {
    // Responses can arrive out of order; only the newest request may update the UI.
    latestRequest += 1;
    const requestId = latestRequest;

    if (!silent) {
      state = { status: 'loading' };
      render();
    }

    try {
      if (flush) await requestLiveFlush();
      const overview = await loadOverview(now());
      if (requestId !== latestRequest) return;
      state = { status: 'ready', overview };
    } catch (error) {
      console.error('[BrowseWise] could not load usage', error);
      if (requestId !== latestRequest) return;
      if (silent && state.status === 'ready') return;
      state = { status: 'error', message: 'BrowseWise could not read your usage data.' };
    }
    render();
  }

  /** First paint from storage, then an accurate update after the live flush. */
  async function start() {
    render();
    await refresh();
    if (state.status === 'ready') await refresh({ flush: true, silent: true });
  }

  return { start, refresh, getState: () => state };
}
