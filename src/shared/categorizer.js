import {
  CATEGORIES,
  CATEGORY_DOMAINS,
  DEFAULT_CATEGORY_ID,
  LOCAL_HOST_CATEGORY_ID,
  SUFFIX_RULES,
} from './categories.config.js';
import { isLocalOrIpHost } from './domain.js';

/**
 * Decides which category a website belongs to.
 *
 * Order of precedence (first match wins):
 *   1. the user's own override for that exact domain
 *   2. localhost, local network names and IP addresses -> development
 *   3. the domain list in categories.config.js: the domain itself, then each parent
 *      domain, so "gist.github.com" is covered by "github.com" and a more specific
 *      entry such as "docs.google.com" beats a general one
 *   4. suffix rules such as ".edu"
 *   5. "other"
 *
 * A category describes the website, not the user's intent.
 */

const CATEGORY_ID_SET = new Set(CATEGORIES.map((category) => category.id));
const LABELS = new Map(CATEGORIES.map((category) => [category.id, category.label]));

/** A Map (not an object) so hostile names such as "__proto__" or "constructor" are safe. */
const DOMAIN_TO_CATEGORY = new Map(
  Object.entries(CATEGORY_DOMAINS).flatMap(([categoryId, domains]) =>
    domains.map((domain) => [domain, categoryId]),
  ),
);

export function isCategoryId(value) {
  return typeof value === 'string' && CATEGORY_ID_SET.has(value);
}

/** @param {string} categoryId @returns {string} display name, or the id if unknown */
export function categoryLabel(categoryId) {
  return LABELS.get(categoryId) ?? categoryId;
}

/**
 * Category from the built-in rules only, ignoring any user override.
 * @param {string} domain normalised domain (see getTrackableDomain)
 * @returns {{categoryId: string, source: 'rule'|'default'}}
 */
export function categorizeAutomatically(domain) {
  if (typeof domain !== 'string' || domain === '') {
    return { categoryId: DEFAULT_CATEGORY_ID, source: 'default' };
  }

  if (isLocalOrIpHost(domain)) return { categoryId: LOCAL_HOST_CATEGORY_ID, source: 'rule' };

  const labels = domain.split('.');
  for (let start = 0; start <= labels.length - 2; start += 1) {
    const match = DOMAIN_TO_CATEGORY.get(labels.slice(start).join('.'));
    if (match !== undefined) return { categoryId: match, source: 'rule' };
  }

  for (const rule of SUFFIX_RULES) {
    if (domain.endsWith(rule.suffix)) return { categoryId: rule.categoryId, source: 'rule' };
  }

  return { categoryId: DEFAULT_CATEGORY_ID, source: 'default' };
}

/**
 * Category for a domain, honouring the user's overrides.
 * @param {string} domain
 * @param {Record<string, string>|null} [overrides] domain -> category id
 * @returns {{categoryId: string, source: 'override'|'rule'|'default'}}
 */
export function categorize(domain, overrides = {}) {
  if (overrides && typeof domain === 'string' && Object.hasOwn(overrides, domain)) {
    const override = overrides[domain];
    if (isCategoryId(override)) return { categoryId: override, source: 'override' };
  }
  return categorizeAutomatically(domain);
}

/** Convenience: just the category id. */
export function getCategoryId(domain, overrides) {
  return categorize(domain, overrides).categoryId;
}
