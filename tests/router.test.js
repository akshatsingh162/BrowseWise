// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROUTE,
  ROUTES,
  createRouter,
  parseParams,
  parseRoute,
} from '../src/dashboard/router.js';

describe('parseRoute', () => {
  it.each([
    ['#overview', 'overview'],
    ['#analytics', 'analytics'],
    ['#websites', 'websites'],
    ['#history', 'history'],
    ['#focus', 'focus'],
    ['#goals', 'goals'],
    ['#settings', 'settings'],
    ['#/websites', 'websites'],
    ['#websites?range=7d', 'websites'],
    ['#analytics?day=2026-11-07', 'analytics'],
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

  it('knows exactly the seven dashboard pages, in navigation order', () => {
    expect(ROUTES.map((route) => route.id)).toEqual([
      'overview',
      'analytics',
      'websites',
      'history',
      'focus',
      'goals',
      'settings',
    ]);
  });
});

describe('parseParams', () => {
  it('reads the values after the question mark', () => {
    expect(parseParams('#analytics?day=2026-11-07')).toEqual({ day: '2026-11-07' });
    expect(parseParams('#websites?range=7d&q=a%20b')).toEqual({ range: '7d', q: 'a b' });
  });

  it.each(['', '#', '#analytics', '#analytics?', null, undefined])(
    'returns no parameters for %s',
    (hash) => {
      expect(parseParams(hash)).toEqual({});
    },
  );

  it('keeps hostile names as plain data and does not touch the prototype', () => {
    const params = parseParams('#analytics?__proto__=x&constructor=y');
    expect(Object.hasOwn(params, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(params.constructor).toBe('y');
    expect({}.x).toBeUndefined();
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
    expect(onNavigate).toHaveBeenLastCalledWith('websites', {});

    window.location.hash = '#settings';
    await vi.waitFor(() => expect(onNavigate).toHaveBeenLastCalledWith('settings', {}));
    router.stop();
  });

  it('passes the parameters along with the route', async () => {
    window.location.hash = '#analytics?day=2026-11-07';
    const onNavigate = vi.fn();
    const router = createRouter({ onNavigate });

    router.start();
    expect(onNavigate).toHaveBeenLastCalledWith('analytics', { day: '2026-11-07' });
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
