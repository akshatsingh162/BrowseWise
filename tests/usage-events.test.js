import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToUsageChanges } from '../src/shared/usage-events.js';

let listeners;

beforeEach(() => {
  vi.useFakeTimers();
  listeners = new Set();
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fire = (changes, area = 'local') => listeners.forEach((fn) => fn(changes, area));

describe('subscribeToUsageChanges', () => {
  it('calls back once, debounced, when usage records change', () => {
    const callback = vi.fn();
    subscribeToUsageChanges(callback, { debounceMs: 100 });

    fire({ 'usage:2026-11-07': {} });
    fire({ 'usage:2026-11-07': {} });
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated keys and other storage areas', () => {
    const callback = vi.fn();
    subscribeToUsageChanges(callback, { debounceMs: 10 });

    fire({ settings: {} });
    fire({ 'tracker:state': {} });
    fire({ 'usage:2026-11-07': {} }, 'sync');
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
  });

  it('stops listening and cancels a pending call when unsubscribed', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToUsageChanges(callback, { debounceMs: 100 });

    fire({ 'usage:2026-11-07': {} });
    unsubscribe();
    vi.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});

describe('subscribeToUsageChanges: category overrides', () => {
  it('also calls back when the user changes a category', () => {
    const callback = vi.fn();
    subscribeToUsageChanges(callback, { debounceMs: 10 });
    fire({ categoryOverrides: { newValue: {} } });
    vi.advanceTimersByTime(10);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
