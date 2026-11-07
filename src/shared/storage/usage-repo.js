import { HOURS_PER_DAY, STORAGE_KEYS } from './schema.js';
import { withStorageLock } from './lock.js';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const usageKey = (dateKey) => `${STORAGE_KEYS.USAGE_PREFIX}${dateKey}`;

export function createEmptyDay(dateKey) {
  return { date: dateKey, hourlyMs: new Array(HOURS_PER_DAY).fill(0), domainMs: {} };
}

/*
 * Domains are used as object keys. A hostname such as "__proto__" would hit the
 * special prototype setter if assigned normally, so we read with hasOwn and write
 * with defineProperty, which always creates a plain own property.
 */
function getOwn(target, key) {
  return Object.hasOwn(target, key) ? target[key] : 0;
}

function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Rebuilds a well-formed day record from whatever is stored (or nothing). */
function normalizeDay(raw, dateKey) {
  const day = createEmptyDay(dateKey);
  if (raw === null || typeof raw !== 'object') return day;

  if (Array.isArray(raw.hourlyMs)) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      const value = raw.hourlyMs[hour];
      if (Number.isFinite(value)) day.hourlyMs[hour] = value;
    }
  }

  if (raw.domainMs !== null && typeof raw.domainMs === 'object') {
    for (const [domain, value] of Object.entries(raw.domainMs)) {
      if (Number.isFinite(value)) setOwn(day.domainMs, domain, value);
    }
  }

  return day;
}

function isValidSegment(segment) {
  return (
    segment !== null &&
    typeof segment === 'object' &&
    typeof segment.dateKey === 'string' &&
    DATE_KEY_PATTERN.test(segment.dateKey) &&
    Number.isInteger(segment.hour) &&
    segment.hour >= 0 &&
    segment.hour < HOURS_PER_DAY &&
    Number.isFinite(segment.ms) &&
    segment.ms > 0
  );
}

async function readUsageDateKeys() {
  const everything = await chrome.storage.local.get(null);
  return Object.keys(everything)
    .filter((key) => key.startsWith(STORAGE_KEYS.USAGE_PREFIX))
    .map((key) => key.slice(STORAGE_KEYS.USAGE_PREFIX.length))
    .filter((dateKey) => DATE_KEY_PATTERN.test(dateKey))
    .sort();
}

/**
 * Credits time segments (from splitIntoSegments) to a domain.
 * Invalid segments are ignored. One locked read-modify-write covers every day touched.
 *
 * @param {string} domain
 * @param {{dateKey: string, hour: number, ms: number}[]} segments
 */
export function addUsage(domain, segments) {
  if (typeof domain !== 'string' || domain === '') return Promise.resolve();
  const valid = segments.filter(isValidSegment);
  if (valid.length === 0) return Promise.resolve();

  return withStorageLock(async () => {
    const dateKeys = [...new Set(valid.map((segment) => segment.dateKey))];
    const stored = await chrome.storage.local.get(dateKeys.map(usageKey));
    const days = new Map(dateKeys.map((key) => [key, normalizeDay(stored[usageKey(key)], key)]));

    for (const { dateKey, hour, ms } of valid) {
      const day = days.get(dateKey);
      const rounded = Math.round(ms);
      day.hourlyMs[hour] += rounded;
      setOwn(day.domainMs, domain, getOwn(day.domainMs, domain) + rounded);
    }

    const updates = {};
    for (const [dateKey, day] of days) updates[usageKey(dateKey)] = day;
    await chrome.storage.local.set(updates);
  });
}

/** Returns the stored day, or an empty day if nothing was recorded. */
export async function getUsageForDate(dateKey) {
  const stored = await chrome.storage.local.get(usageKey(dateKey));
  return normalizeDay(stored[usageKey(dateKey)], dateKey);
}

/** Returns one day record per key, in the same order as `dateKeys`. */
export async function getUsageForRange(dateKeys) {
  if (dateKeys.length === 0) return [];
  const stored = await chrome.storage.local.get(dateKeys.map(usageKey));
  return dateKeys.map((key) => normalizeDay(stored[usageKey(key)], key));
}

/** @returns {Promise<string[]>} every recorded date key, oldest first */
export function listUsageDateKeys() {
  return readUsageDateKeys();
}

/**
 * Deletes usage for days strictly before `cutoffDateKey` (retention policy).
 * @returns {Promise<number>} number of days removed
 */
export function pruneUsageBefore(cutoffDateKey) {
  return withStorageLock(async () => {
    const keys = await readUsageDateKeys();
    const expired = keys.filter((key) => key < cutoffDateKey);
    if (expired.length > 0) await chrome.storage.local.remove(expired.map(usageKey));
    return expired.length;
  });
}

/** Deletes all usage data. Settings are not touched. */
export function clearAllUsage() {
  return withStorageLock(async () => {
    const keys = await readUsageDateKeys();
    if (keys.length > 0) await chrome.storage.local.remove(keys.map(usageKey));
  });
}
