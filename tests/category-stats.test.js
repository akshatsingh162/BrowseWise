import { describe, expect, it } from 'vitest';
import { summarizeCategories } from '../src/shared/category-stats.js';

const MIN = 60_000;
const sites = [
  { domain: 'github.com', ms: 60 * MIN },
  { domain: 'youtube.com', ms: 20 * MIN },
  { domain: 'reddit.com', ms: 10 * MIN },
  { domain: 'amazon.com', ms: 10 * MIN },
];

describe('summarizeCategories', () => {
  it('totals time per category, largest first, with shares that add up to 1', () => {
    const summary = summarizeCategories(sites);
    expect(summary.totalMs).toBe(100 * MIN);
    expect(summary.categories.map((c) => [c.id, c.ms / MIN])).toEqual([
      ['development', 60],
      ['entertainment', 20],
      ['social', 10], // ties keep the order from the config
      ['shopping', 10],
    ]);
    expect(summary.categories.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1);
    expect(summary.categories[0].label).toBe('Development & Programming');
  });

  it('omits categories with no time', () => {
    const ids = summarizeCategories(sites).categories.map((c) => c.id);
    expect(ids).not.toContain('news');
    expect(ids).not.toContain('other');
  });

  it('computes the three headline groups', () => {
    const { groups } = summarizeCategories(sites);
    expect(groups.productive.ms).toBe(60 * MIN);
    expect(groups.productive.share).toBeCloseTo(0.6);
    expect(groups.entertainment.ms).toBe(20 * MIN);
    expect(groups.social.ms).toBe(10 * MIN);
    expect(groups.productive.label).toBe('Productive sites');
  });

  it('counts education and productivity sites as productive too', () => {
    const { groups } = summarizeCategories([
      { domain: 'wikipedia.org', ms: 10 * MIN },
      { domain: 'notion.so', ms: 20 * MIN },
      { domain: 'github.com', ms: 30 * MIN },
      { domain: 'bbc.com', ms: 40 * MIN },
    ]);
    expect(groups.productive.ms).toBe(60 * MIN);
  });

  it('applies the user overrides', () => {
    const { groups, categories } = summarizeCategories(sites, { 'youtube.com': 'education' });
    expect(groups.entertainment.ms).toBe(0);
    expect(groups.productive.ms).toBe(80 * MIN);
    expect(categories.map((c) => c.id)).toContain('education');
  });

  it('puts unknown websites in "other"', () => {
    const { categories } = summarizeCategories([{ domain: 'my-blog.example', ms: 5 * MIN }]);
    expect(categories).toEqual([{ id: 'other', label: 'Other', ms: 5 * MIN, share: 1 }]);
  });

  it('ignores zero, negative, and non-numeric time', () => {
    const summary = summarizeCategories([
      { domain: 'github.com', ms: 0 },
      { domain: 'youtube.com', ms: -5 },
      { domain: 'reddit.com', ms: NaN },
    ]);
    expect(summary.totalMs).toBe(0);
    expect(summary.categories).toEqual([]);
    expect(summary.groups.productive.share).toBe(0);
  });

  it('handles no sites at all', () => {
    expect(summarizeCategories([]).totalMs).toBe(0);
  });
});
