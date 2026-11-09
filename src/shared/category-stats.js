import { CATEGORIES, CATEGORY_GROUPS } from './categories.config.js';
import { getCategoryId } from './categorizer.js';

/**
 * Time per category and per headline group, for the dashboard.
 *
 * @param {{domain: string, ms: number}[]} sites usage per domain (for example a ranking)
 * @param {Record<string, string>|null} [overrides] the user's category overrides
 * @returns {{
 *   totalMs: number,
 *   categories: {id: string, label: string, ms: number, share: number}[],
 *   groups: Record<string, {label: string, description: string, ms: number, share: number}>
 * }} `categories` lists only categories with time, largest first
 */
export function summarizeCategories(sites, overrides = {}) {
  const msById = new Map(CATEGORIES.map((category) => [category.id, 0]));
  let totalMs = 0;

  for (const { domain, ms } of sites) {
    if (!(ms > 0)) continue;
    const id = getCategoryId(domain, overrides);
    msById.set(id, msById.get(id) + ms);
    totalMs += ms;
  }

  const share = (ms) => (totalMs > 0 ? ms / totalMs : 0);

  const categories = CATEGORIES.map((category, order) => ({
    id: category.id,
    label: category.label,
    ms: msById.get(category.id),
    share: share(msById.get(category.id)),
    order,
  }))
    .filter((category) => category.ms > 0)
    .sort((a, b) => b.ms - a.ms || a.order - b.order)
    .map(({ order: _order, ...category }) => category);

  const groups = Object.fromEntries(
    Object.entries(CATEGORY_GROUPS).map(([key, group]) => {
      const ms = group.categoryIds.reduce((sum, id) => sum + (msById.get(id) ?? 0), 0);
      return [key, { label: group.label, description: group.description, ms, share: share(ms) }];
    }),
  );

  return { totalMs, categories, groups };
}
