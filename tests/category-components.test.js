// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { AUTOMATIC_VALUE, categorySelect } from '../src/dashboard/components/category-select.js';
import { categoryPanel } from '../src/dashboard/components/category-panel.js';

const MIN = 60_000;

describe('categorySelect', () => {
  const build = (overrides = {}) =>
    categorySelect({
      domain: 'youtube.com',
      categoryId: 'entertainment',
      automaticId: 'entertainment',
      overridden: false,
      onChange: vi.fn(),
      ...overrides,
    });

  it('lists the nine categories with the current one selected', () => {
    const wrapper = build();
    const select = wrapper.querySelector('select');
    expect([...select.options].map((o) => o.textContent)).toEqual([
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
    expect(select.value).toBe('entertainment');
    expect(select.dataset.domain).toBe('youtube.com');
    expect(select.getAttribute('aria-label')).toBe('Category for youtube.com');
  });

  it('shows no marker and no reset option while the category is automatic', () => {
    const wrapper = build();
    expect(wrapper.querySelector('.db-cat-dot')).toBeNull();
    expect(wrapper.querySelectorAll('option')).toHaveLength(9);
  });

  it('marks a changed category and offers a reset to the automatic one', () => {
    const wrapper = build({ categoryId: 'education', overridden: true });
    const select = wrapper.querySelector('select');
    expect(wrapper.querySelector('.db-cat-dot')).not.toBeNull();
    expect(select.value).toBe('education');
    expect(select.getAttribute('aria-label')).toContain('changed by you');
    expect(select.title).toContain('Automatic category: Entertainment');
    const reset = [...select.options].find((o) => o.value === AUTOMATIC_VALUE);
    expect(reset.textContent).toBe('Reset to automatic (Entertainment)');
  });

  it('reports the chosen value', () => {
    const onChange = vi.fn();
    const wrapper = build({ onChange });
    const select = wrapper.querySelector('select');
    select.value = 'news';
    select.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('news');
  });

  it('never treats a hostile domain as HTML', () => {
    const hostile = '<img src=x onerror=alert(1)>.com';
    const wrapper = build({ domain: hostile });
    expect(wrapper.querySelectorAll('img')).toHaveLength(0);
    expect(wrapper.querySelector('select').getAttribute('aria-label')).toContain(hostile);
  });
});

describe('categoryPanel', () => {
  const sites = [
    { domain: 'github.com', ms: 60 * MIN },
    { domain: 'youtube.com', ms: 20 * MIN },
    { domain: 'reddit.com', ms: 10 * MIN },
    { domain: 'amazon.com', ms: 10 * MIN },
  ];
  const groupValue = (panel, label) =>
    [...panel.querySelectorAll('.db-catgroup')].find(
      (g) => g.querySelector('.db-catgroup-label').textContent === label,
    );

  it('shows the three headline groups with time and share', () => {
    const panel = categoryPanel({ sites });
    const productive = groupValue(panel, 'Productive sites');
    expect(productive.querySelector('.db-catgroup-value').textContent).toBe('1h 00m');
    expect(productive.querySelector('.db-catgroup-share').textContent).toBe('60% of the total');
    expect(groupValue(panel, 'Entertainment').querySelector('.db-catgroup-value').textContent).toBe(
      '20m',
    );
    expect(groupValue(panel, 'Social media').querySelector('.db-catgroup-value').textContent).toBe(
      '10m',
    );
  });

  it('lists categories largest first, with a percentage on every row', () => {
    const panel = categoryPanel({ sites });
    const rows = [...panel.querySelectorAll('.db-catrow')];
    expect(rows.map((r) => r.querySelector('.db-catrow-label').textContent)).toEqual([
      'Development & Programming',
      'Entertainment',
      'Social Media',
      'Shopping',
    ]);
    expect(rows.map((r) => r.querySelector('.db-catrow-pct').textContent)).toEqual([
      '60%',
      '20%',
      '10%',
      '10%',
    ]);
  });

  it('describes the share bar in words so colour is never the only signal', () => {
    const panel = categoryPanel({ sites });
    const bar = panel.querySelector('.db-catbar');
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toContain('Development & Programming 60%');
    expect(bar.querySelectorAll('.db-catbar-segment')).toHaveLength(4);
    expect(bar.querySelector('.db-catbar-segment').getAttribute('style')).toContain('width: 60%');
  });

  it('always says a category describes the website, not the user\u2019s intent', () => {
    const note = categoryPanel({ sites }).querySelector('.db-cat-note').textContent;
    expect(note).toContain('describe the website, not what you were doing');
  });

  it('applies the user overrides', () => {
    const panel = categoryPanel({ sites, overrides: { 'youtube.com': 'education' } });
    expect(groupValue(panel, 'Entertainment').querySelector('.db-catgroup-value').textContent).toBe(
      '0m',
    );
    expect(
      groupValue(panel, 'Productive sites').querySelector('.db-catgroup-value').textContent,
    ).toBe('1h 20m');
  });

  it('returns nothing when there is no time to show', () => {
    expect(categoryPanel({ sites: [] })).toBeNull();
    expect(categoryPanel({ sites: [{ domain: 'a.com', ms: 0 }] })).toBeNull();
  });

  it('uses a custom title and does not interpret domains as HTML', () => {
    const panel = categoryPanel({
      sites: [{ domain: '<b>x</b>.example', ms: MIN }],
      title: 'This week',
    });
    expect(panel.getAttribute('aria-label')).toBe('This week');
    expect(panel.querySelectorAll('b')).toHaveLength(0);
  });
});
