// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTE, ROUTES, createRouter, parseRoute } from '../src/dashboard/router.js';

describe('parseRoute', () => {
  it.each([
    ['#overview', 'overview'],
    ['#analytics', 'analytics'],
    ['#websites', 'websites'],
    ['#goals', 'goals'],
    ['#settings', 'settings'],
    ['#/websites', 'websites'],
    ['#websites?range=7d', 'websites'],
    ['#websites/extra', 'websites'],
  ])('maps %s to %s', (hash, expected) => {
    expect(parseRoute(hash)).toBe(expected);
  });

  it.each(['', '#', '#nope', '#Overview', '#__proto__', '#<script>', null, undefined])(
    'falls back to the default for %s',
    (hash) => {
      expect(parseRoute(hash)).toBe(DEFAULT_ROUTE);
    },
  );

  it('knows exactly the five dashboard pages', () => {
    expect(ROUTES.map((route) => route.id)).toEqual([
      'overview',
      'analytics',
      'websites',
      'goals',
      'settings',
    ]);
  });
});

describe('createRouter', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('navigates immediately to the current hash, then on every change', async () => {
    window.location.hash = '#websites';
    const onNavigate = vi.fn();
    const router = createRouter({ onNavigate });

    router.start();
    expect(onNavigate).toHaveBeenLastCalledWith('websites');

    window.location.hash = '#settings';
    await vi.waitFor(() => expect(onNavigate).toHaveBeenLastCalledWith('settings'));
    router.stop();
  });

  it('stops reacting after stop()', async () => {
    const onNavigate = vi.fn();
    const router = createRouter({ onNavigate });
    router.start();
    router.stop();
    onNavigate.mockClear();

    window.location.hash = '#goals';
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
