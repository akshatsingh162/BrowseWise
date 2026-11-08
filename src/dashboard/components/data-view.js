import { el } from '../../ui/dom.js';
import { stateCard } from './state-card.js';

const DEFAULT_REFRESH_MS = 30_000;

function defaultLoading() {
  return el('div', { class: 'db-loading', role: 'status', 'aria-label': 'Loading' }, [
    el('div', { class: 'bw-skeleton', style: 'height: 96px' }),
    el('div', { class: 'bw-skeleton', style: 'height: 240px' }),
  ]);
}

/**
 * Loads data and renders it into a container, handling the loading, error and
 * ready states, live refreshing, and out-of-order responses.
 *
 * Loading strategy (same idea as the popup): draw stored data first, then ask the
 * service worker to flush the in-progress interval and update silently.
 *
 * @param {object} options
 * @param {HTMLElement} options.container region this view owns
 * @param {() => Promise<any>} options.load reads the data
 * @param {(data: any) => Node} options.renderReady
 * @param {() => Node} [options.renderLoading]
 * @param {() => Promise<unknown>} options.requestLiveFlush
 * @param {(callback: () => void) => () => void} options.subscribe usage-change subscription
 * @param {number} [options.refreshMs]
 */
export function createDataView({
  container,
  load,
  renderReady,
  renderLoading = defaultLoading,
  requestLiveFlush,
  subscribe,
  refreshMs = DEFAULT_REFRESH_MS,
}) {
  let status = 'loading';
  let data = null;
  let latestRequest = 0;
  let disposed = false;
  let intervalId;
  let unsubscribe = () => {};

  function show(node) {
    if (!disposed) container.replaceChildren(node);
  }

  function showError() {
    show(
      stateCard({
        iconName: 'triangle-alert',
        tone: 'danger',
        title: 'Something went wrong',
        text: 'BrowseWise could not read your usage data.',
        action: { label: 'Try again', iconName: 'refresh-cw', onClick: () => refresh() },
      }),
    );
  }

  /**
   * @param {{flush?: boolean, silent?: boolean}} [options]
   *   flush:  have the worker write the in-progress interval first
   *   silent: keep the current screen while loading and keep last good data on failure
   */
  async function refresh({ flush = false, silent = false } = {}) {
    latestRequest += 1;
    const requestId = latestRequest;

    if (!silent) {
      status = 'loading';
      show(renderLoading());
    }

    try {
      if (flush) await requestLiveFlush();
      const loaded = await load();
      if (disposed || requestId !== latestRequest) return;
      data = loaded;
      status = 'ready';
      show(renderReady(data));
    } catch (error) {
      console.error('[BrowseWise] could not load data', error);
      if (disposed || requestId !== latestRequest) return;
      if (silent && status === 'ready') return;
      status = 'error';
      showError();
    }
  }

  return {
    refresh,

    /** Re-renders from the last loaded data without reading storage (e.g. after a filter change). */
    rerender() {
      if (status === 'ready') show(renderReady(data));
    },

    async start() {
      await refresh();
      if (disposed) return;
      if (status === 'ready') await refresh({ flush: true, silent: true });
      if (disposed) return;
      intervalId = setInterval(() => void refresh({ flush: true, silent: true }), refreshMs);
      // No flush here: flushing writes storage, which would trigger this again.
      unsubscribe = subscribe(() => void refresh({ silent: true }));
    },

    dispose() {
      disposed = true;
      clearInterval(intervalId);
      unsubscribe();
    },

    getStatus: () => status,
  };
}
