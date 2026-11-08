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
 * `renderReady` may return a Node, or `{ node, mounted?, destroy? }`:
 *   mounted  runs right after the node is in the page (e.g. to draw charts)
 *   destroy  runs before the node is replaced or the view is disposed
 *
 * Loading strategy (same idea as the popup): draw stored data first, then ask the
 * service worker to flush the in-progress interval and update silently. Views that
 * would visibly redraw (charts) can set `flushFirst` to flush before the one and
 * only first draw instead.
 *
 * A silent refresh whose data is identical to what is already shown changes
 * nothing, so an idle page never flickers or loses focus.
 *
 * @param {object} options
 * @param {HTMLElement} options.container region this view owns
 * @param {() => Promise<any>} options.load reads the data
 * @param {(data: any) => Node | {node: Node, mounted?: () => void, destroy?: () => void}} options.renderReady
 * @param {() => Node} [options.renderLoading]
 * @param {() => Promise<unknown>} options.requestLiveFlush
 * @param {(callback: () => void) => () => void} options.subscribe usage-change subscription
 * @param {number} [options.refreshMs]
 * @param {boolean} [options.flushFirst] flush before the first draw instead of after
 */
export function createDataView({
  container,
  load,
  renderReady,
  renderLoading = defaultLoading,
  requestLiveFlush,
  subscribe,
  refreshMs = DEFAULT_REFRESH_MS,
  flushFirst = false,
}) {
  let status = 'loading';
  let data = null;
  let shownSignature = null;
  let latestRequest = 0;
  let disposed = false;
  let intervalId;
  let unsubscribe = () => {};
  let cleanup = null;

  function runCleanup() {
    const pending = cleanup;
    cleanup = null;
    pending?.();
  }

  function show(result) {
    if (disposed) return;
    runCleanup();

    const { node, mounted, destroy } = result instanceof Node ? { node: result } : result;
    container.replaceChildren(node);
    cleanup = destroy ?? null;
    mounted?.();
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
      const signature = JSON.stringify(loaded);
      if (silent && status === 'ready' && signature === shownSignature) return;
      data = loaded;
      status = 'ready';
      shownSignature = signature;
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
      if (flushFirst) {
        await refresh({ flush: true });
      } else {
        await refresh();
        if (disposed) return;
        if (status === 'ready') await refresh({ flush: true, silent: true });
      }
      if (disposed) return;
      intervalId = setInterval(() => void refresh({ flush: true, silent: true }), refreshMs);
      // No flush here: flushing writes storage, which would trigger this again.
      unsubscribe = subscribe(() => void refresh({ silent: true }));
    },

    dispose() {
      disposed = true;
      clearInterval(intervalId);
      unsubscribe();
      runCleanup();
    },

    getStatus: () => status,
  };
}
