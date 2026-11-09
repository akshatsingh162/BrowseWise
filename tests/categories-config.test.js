import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_DOMAINS,
  CATEGORY_GROUPS,
  DEFAULT_CATEGORY_ID,
  LOCAL_HOST_CATEGORY_ID,
  SUFFIX_RULES,
} from '../src/shared/categories.config.js';

const ids = CATEGORIES.map((category) => category.id);
const entries = Object.entries(CATEGORY_DOMAINS).flatMap(([categoryId, domains]) =>
  domains.map((domain) => ({ domain, categoryId })),
);

describe('categories', () => {
  it('has the nine categories from the specification, in order', () => {
    expect(CATEGORIES.map((category) => category.label)).toEqual([
      'Education',
      'Social Media',
      'Entertainment',
      'Development & Programming',
      'Productivity',
      'Shopping',
      'News',
      'Communication',
      'Other',
    ]);
  });

  it('has unique ids, and sensible defaults', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_CATEGORY_ID);
    expect(ids).toContain(LOCAL_HOST_CATEGORY_ID);
  });
});

describe('domain lists', () => {
  it('only use declared categories, and every category has a list', () => {
    expect(Object.keys(CATEGORY_DOMAINS).sort()).toEqual([...ids].sort());
  });

  it('contain well-formed domains: lowercase, no www, no scheme or path', () => {
    for (const { domain } of entries) {
      expect(domain, domain).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
      expect(domain, domain).toContain('.');
      expect(domain.startsWith('www.'), domain).toBe(false);
    }
  });

  it('list each domain only once across all categories', () => {
    const seen = new Map();
    for (const { domain, categoryId } of entries) {
      expect(seen.has(domain), `${domain} is in both ${seen.get(domain)} and ${categoryId}`).toBe(
        false,
      );
      seen.set(domain, categoryId);
    }
  });

  it('only let a specific domain override its parent domain where that is intended', () => {
    const byDomain = new Map(entries.map((entry) => [entry.domain, entry.categoryId]));
    const exceptions = [];
    for (const { domain, categoryId } of entries) {
      const labels = domain.split('.');
      for (let start = 1; start <= labels.length - 2; start += 1) {
        const parent = labels.slice(start).join('.');
        if (byDomain.has(parent) && byDomain.get(parent) !== categoryId) {
          exceptions.push([domain, categoryId, byDomain.get(parent)]);
        }
      }
    }
    // Add to this list only on purpose: it documents deliberate exceptions.
    expect(exceptions).toEqual([
      ['aws.amazon.com', 'development', 'shopping'],
      ['outlook.office.com', 'communication', 'productivity'],
    ]);
  });
});

describe('groups and suffix rules', () => {
  it('define three headline groups made only of declared categories, with no overlap', () => {
    expect(Object.keys(CATEGORY_GROUPS)).toEqual(['productive', 'entertainment', 'social']);
    const used = Object.values(CATEGORY_GROUPS).flatMap((group) => group.categoryIds);
    for (const id of used) expect(ids).toContain(id);
    expect(new Set(used).size).toBe(used.length);
  });

  it('count education, development and productivity as productive sites', () => {
    expect([...CATEGORY_GROUPS.productive.categoryIds].sort()).toEqual([
      'development',
      'education',
      'productivity',
    ]);
  });

  it('have suffix rules that start with a dot, are lowercase, and use declared categories', () => {
    for (const rule of SUFFIX_RULES) {
      expect(rule.suffix).toMatch(/^\.[a-z.]+$/);
      expect(ids).toContain(rule.categoryId);
    }
  });
});
