import { isCategoryId } from '../categorizer.js';
import { withStorageLock } from './lock.js';

/**
 * The user's manual category choices: { [domain]: categoryId }.
 *
 * Stored under its own key. Adding an optional key with a safe default (no
 * overrides) needs no schema migration: a missing key simply reads as {}.
 */

export const CATEGORY_OVERRIDES_KEY = 'categoryOverrides';

const MAX_DOMAIN_LENGTH = 253;

/*
 * Domains are object keys, so a name like "__proto__" must be written with
 * defineProperty (same precaution as the usage records).
 */
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function isValidDomain(domain) {
  return (
    typeof domain === 'string' &&
    domain.length > 0 &&
    domain.length <= MAX_DOMAIN_LENGTH &&
    !/\s/.test(domain)
  );
}

/**
 * Builds a clean overrides object from untrusted input (storage or UI): entries with
 * an unusable domain or an unknown category are dropped.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function sanitizeOverrides(raw) {
  const clean = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  for (const [domain, categoryId] of Object.entries(raw)) {
    if (isValidDomain(domain) && isCategoryId(categoryId)) setOwn(clean, domain, categoryId);
  }
  return clean;
}

/**
 * Pure helper: a copy of `overrides` with one entry set (or removed when
 * `categoryId` is null).
 * @param {Record<string, string>} overrides
 * @param {string} domain
 * @param {string|null} categoryId
 */
export function withOverride(overrides, domain, categoryId) {
  const next = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== domain) setOwn(next, key, value);
  }
  if (categoryId !== null) setOwn(next, domain, categoryId);
  return next;
}

/** Reads are lock-free and always return a clean object. */
export async function getCategoryOverrides() {
  const stored = await chrome.storage.local.get(CATEGORY_OVERRIDES_KEY);
  return sanitizeOverrides(stored[CATEGORY_OVERRIDES_KEY]);
}

/**
 * Sets, changes, or (with null) removes the override for one domain.
 * @param {string} domain
 * @param {string|null} categoryId a category id, or null to go back to automatic
 * @returns {Promise<Record<string, string>>} the saved overrides
 */
export function setCategoryOverride(domain, categoryId) {
  if (!isValidDomain(domain)) return Promise.reject(new TypeError('Invalid domain'));
  if (categoryId !== null && !isCategoryId(categoryId)) {
    return Promise.reject(new TypeError(`Unknown category: ${categoryId}`));
  }

  return withStorageLock(async () => {
    const next = withOverride(await getCategoryOverrides(), domain, categoryId);
    await chrome.storage.local.set({ [CATEGORY_OVERRIDES_KEY]: next });
    return next;
  });
}

/** Removes every override (everything goes back to automatic). */
export function clearCategoryOverrides() {
  return withStorageLock(() => chrome.storage.local.remove(CATEGORY_OVERRIDES_KEY));
}
