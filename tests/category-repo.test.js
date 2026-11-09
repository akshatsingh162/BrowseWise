import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import {
  CATEGORY_OVERRIDES_KEY,
  clearCategoryOverrides,
  getCategoryOverrides,
  sanitizeOverrides,
  setCategoryOverride,
  withOverride,
} from '../src/shared/storage/category-repo.js';

let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stored = async () =>
  (await chromeMock.storage.local.get(CATEGORY_OVERRIDES_KEY))[CATEGORY_OVERRIDES_KEY];

describe('category overrides storage', () => {
  it('reads as empty when nothing was saved (no migration needed)', async () => {
    expect(await getCategoryOverrides()).toEqual({});
  });

  it('saves, changes, and persists an override', async () => {
    await setCategoryOverride('youtube.com', 'education');
    expect(await getCategoryOverrides()).toEqual({ 'youtube.com': 'education' });
    await setCategoryOverride('youtube.com', 'news');
    expect(await getCategoryOverrides()).toEqual({ 'youtube.com': 'news' });
  });

  it('removes an override when given null', async () => {
    await setCategoryOverride('youtube.com', 'education');
    await setCategoryOverride('reddit.com', 'news');
    const saved = await setCategoryOverride('youtube.com', null);
    expect(saved).toEqual({ 'reddit.com': 'news' });
    expect(await getCategoryOverrides()).toEqual({ 'reddit.com': 'news' });
  });

  it('rejects an unknown category or an unusable domain, and changes nothing', async () => {
    await setCategoryOverride('a.com', 'news');
    await expect(setCategoryOverride('a.com', 'not-real')).rejects.toThrow(TypeError);
    await expect(setCategoryOverride('', 'news')).rejects.toThrow(TypeError);
    await expect(setCategoryOverride('has space.com', 'news')).rejects.toThrow(TypeError);
    await expect(setCategoryOverride(undefined, 'news')).rejects.toThrow(TypeError);
    await expect(setCategoryOverride('x'.repeat(300), 'news')).rejects.toThrow(TypeError);
    expect(await getCategoryOverrides()).toEqual({ 'a.com': 'news' });
  });

  it('does not lose changes when many are saved at the same time', async () => {
    const domains = Array.from({ length: 25 }, (_, i) => `site${i}.com`);
    await Promise.all(domains.map((domain) => setCategoryOverride(domain, 'news')));
    expect(Object.keys(await getCategoryOverrides()).sort()).toEqual([...domains].sort());
  });

  it('safely stores a hostile name such as __proto__', async () => {
    await setCategoryOverride('__proto__', 'shopping');
    const overrides = await getCategoryOverrides();
    expect(Object.keys(overrides)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(overrides, '__proto__').value).toBe('shopping');
    expect(Object.getPrototypeOf(overrides)).toBe(Object.prototype);
  });

  it('clears every override', async () => {
    await setCategoryOverride('a.com', 'news');
    await clearCategoryOverrides();
    expect(await stored()).toBeUndefined();
    expect(await getCategoryOverrides()).toEqual({});
  });
});

describe('sanitizeOverrides', () => {
  it('keeps valid entries and drops junk from storage', () => {
    expect(
      sanitizeOverrides({
        'a.com': 'news',
        'b.com': 'not-real',
        'has space.com': 'news',
        '': 'news',
        'c.com': 42,
      }),
    ).toEqual({ 'a.com': 'news' });
  });

  it('treats non-objects as empty', () => {
    for (const bad of [null, undefined, 'x', 5, ['a'], true]) {
      expect(sanitizeOverrides(bad)).toEqual({});
    }
  });

  it('heals a corrupted stored value when reading', async () => {
    await chromeMock.storage.local.set({ [CATEGORY_OVERRIDES_KEY]: 'garbage' });
    expect(await getCategoryOverrides()).toEqual({});
  });
});

describe('withOverride', () => {
  it('returns a changed copy and never mutates the original', () => {
    const original = { 'a.com': 'news' };
    const added = withOverride(original, 'b.com', 'social');
    const removed = withOverride(added, 'a.com', null);
    expect(original).toEqual({ 'a.com': 'news' });
    expect(added).toEqual({ 'a.com': 'news', 'b.com': 'social' });
    expect(removed).toEqual({ 'b.com': 'social' });
  });
});
