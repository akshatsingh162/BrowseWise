// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataView } from '../src/dashboard/components/data-view.js';

let container;
let subscribeCallback;
const unsubscribe = vi.fn();

const renderReady = (data) => {
  const node = document.createElement('p');
  node.className = 'ready';
  node.textContent = String(data);
  return node;
};

function setup(overrides = {}) {
  const deps = {
    container,
    load: vi.fn(async () => 'data-1'),
    renderReady,
    renderLoading: () => {
      const node = document.createElement('p');
      node.className = 'loading';
      return node;
    },
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return unsubscribe;
    }),
    refreshMs: 1_000_000,
    ...overrides,
  };
  return { deps, view: createDataView(deps) };
}

beforeEach(() => {
  chromeStub();
  document.body.innerHTML = '<div id="c"></div>';
  container = document.getElementById('c');
  unsubscribe.mockClear();
  subscribeCallback = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function chromeStub() {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
}

describe('createDataView', () => {
  it('shows loading, then data, then updates after the live flush', async () => {
    const load = vi.fn().mockResolvedValueOnce('stored').mockResolvedValueOnce('fresh');
    const { deps, view } = setup({ load });

    const started = view.start();
    expect(container.querySelector('.loading')).not.toBeNull();
    await started;

    expect(deps.requestLiveFlush).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.ready').textContent).toBe('fresh');
    view.dispose();
  });

  it('shows an error card with a working retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValue('recovered');
    const { view } = setup({ load });

    await view.refresh();
    expect(view.getStatus()).toBe('error');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Something went wrong');

    container.querySelector('button').click();
    await vi.waitFor(() => expect(view.getStatus()).toBe('ready'));
    expect(container.querySelector('.ready').textContent).toBe('recovered');
  });

  it('keeps the last good data when a silent refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn().mockResolvedValueOnce('good').mockRejectedValue(new Error('blip'));
    const { view } = setup({ load });

    await view.refresh();
    await view.refresh({ silent: true });

    expect(view.getStatus()).toBe('ready');
    expect(container.querySelector('.ready').textContent).toBe('good');
  });

  it('does not flash a loading state during a silent refresh', async () => {
    const { view } = setup();
    await view.refresh();
    const pending = view.refresh({ silent: true });
    expect(container.querySelector('.loading')).toBeNull();
    await pending;
  });

  it('ignores an outdated response that arrives after a newer one', async () => {
    let releaseSlow;
    const slow = new Promise((resolve) => (releaseSlow = () => resolve('old')));
    const load = vi.fn().mockReturnValueOnce(slow).mockResolvedValueOnce('new');
    const { view } = setup({ load });

    const first = view.refresh({ silent: true });
    await view.refresh({ silent: true });
    releaseSlow();
    await first;

    expect(container.querySelector('.ready').textContent).toBe('new');
  });

  it('rerender() redraws from loaded data without reading storage again', async () => {
    const { deps, view } = setup();
    await view.refresh();
    container.replaceChildren();

    view.rerender();
    expect(container.querySelector('.ready').textContent).toBe('data-1');
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it('refreshes on usage changes (without flushing) and on its interval', async () => {
    const { deps, view } = setup({ refreshMs: 25 });
    await view.start();
    const loadsAfterStart = deps.load.mock.calls.length;
    const flushesAfterStart = deps.requestLiveFlush.mock.calls.length;

    subscribeCallback();
    await vi.waitFor(() => expect(deps.load.mock.calls.length).toBeGreaterThan(loadsAfterStart));
    expect(deps.requestLiveFlush.mock.calls.length).toBe(flushesAfterStart);

    await vi.waitFor(() =>
      expect(deps.requestLiveFlush.mock.calls.length).toBeGreaterThan(flushesAfterStart),
    );
    view.dispose();
  });

  it('stops everything on dispose, even for requests still in flight', async () => {
    let release;
    const pending = new Promise((resolve) => (release = () => resolve('late')));
    const { view } = setup({ load: vi.fn(() => pending) });

    const refreshing = view.refresh({ silent: true });
    view.dispose();
    release();
    await refreshing;

    expect(container.querySelector('.ready')).toBeNull();
  });

  it('never subscribes if it was disposed before start finished', async () => {
    const { deps, view } = setup();
    view.dispose();
    await view.start();
    expect(deps.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes on dispose once running', async () => {
    const { view } = setup();
    await view.start();
    view.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('createDataView: render results with mounted and destroy hooks', () => {
  it('runs mounted after the node is in the page', async () => {
    let inPageAtMount = null;
    const node = document.createElement('p');
    node.className = 'ready';
    const { view } = setup({
      renderReady: () => ({
        node,
        mounted: () => {
          inPageAtMount = container.contains(node);
        },
      }),
    });

    await view.refresh();
    expect(inPageAtMount).toBe(true);
  });

  it('destroys the previous render before showing the next one', async () => {
    const destroyed = [];
    let count = 0;
    const { view } = setup({
      // Different data each time, because a silent refresh with identical data is skipped.
      load: vi.fn().mockResolvedValueOnce('first').mockResolvedValue('second'),
      renderReady: () => {
        const id = (count += 1);
        return { node: renderReady(`r${id}`), destroy: () => destroyed.push(id) };
      },
    });

    await view.refresh();
    expect(destroyed).toEqual([]);
    await view.refresh({ silent: true });
    expect(destroyed).toEqual([1]);
  });

  it('destroys the render when replaced by a loading state, and on dispose', async () => {
    const destroy = vi.fn();
    const { view } = setup({ renderReady: () => ({ node: renderReady('x'), destroy }) });

    await view.refresh();
    const pending = view.refresh(); // non-silent refresh shows the loading state first
    expect(destroy).toHaveBeenCalledTimes(1);
    await pending;

    view.dispose();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('still accepts a plain Node from renderReady', async () => {
    const { view } = setup();
    await view.refresh();
    expect(container.querySelector('.ready')).not.toBeNull();
  });
});

describe('createDataView: flushFirst and unchanged refreshes', () => {
  it('flushFirst flushes, then draws exactly once on start', async () => {
    const draws = vi.fn(renderReady);
    const { deps, view } = setup({ renderReady: draws, flushFirst: true });

    await view.start();

    expect(deps.requestLiveFlush).toHaveBeenCalledTimes(1);
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(draws).toHaveBeenCalledTimes(1);
    expect(deps.subscribe).toHaveBeenCalled();
    view.dispose();
  });

  it('a silent refresh with identical data does not redraw', async () => {
    const draws = vi.fn(renderReady);
    const { view } = setup({ renderReady: draws, load: vi.fn(async () => ({ total: 5 })) });

    await view.refresh();
    await view.refresh({ silent: true });
    await view.refresh({ silent: true });

    expect(draws).toHaveBeenCalledTimes(1);
  });

  it('a silent refresh with different data does redraw', async () => {
    const draws = vi.fn(renderReady);
    const load = vi.fn().mockResolvedValueOnce({ total: 5 }).mockResolvedValue({ total: 6 });
    const { view } = setup({ renderReady: draws, load });

    await view.refresh();
    await view.refresh({ silent: true });

    expect(draws).toHaveBeenCalledTimes(2);
  });

  it('a normal (non-silent) refresh always redraws, even with identical data', async () => {
    const draws = vi.fn(renderReady);
    const { view } = setup({ renderReady: draws, load: vi.fn(async () => ({ total: 5 })) });

    await view.refresh();
    await view.refresh();

    expect(draws).toHaveBeenCalledTimes(2);
  });
});
