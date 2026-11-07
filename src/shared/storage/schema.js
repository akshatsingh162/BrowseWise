/**
 * Storage schema: the single source of truth for keys and defaults.
 *
 * chrome.storage.local layout
 *   meta               { schemaVersion: number }
 *   settings           { ...DEFAULT_SETTINGS }
 *   usage:YYYY-MM-DD   { date, hourlyMs: number[24], domainMs: { [domain]: ms } }
 *
 * Later phases add keys (categories, goals) through migrations.
 */

export const HOURS_PER_DAY = 24;

export const STORAGE_KEYS = Object.freeze({
  META: 'meta',
  SETTINGS: 'settings',
  USAGE_PREFIX: 'usage:',
});

export const DEFAULT_SETTINGS = Object.freeze({
  idleThresholdSeconds: 60,
  countAudibleTabsAsActive: false,
  trackLocalHosts: true,
  notificationsEnabled: false,
  retentionDays: 365,
});

export const SETTINGS_LIMITS = Object.freeze({
  idleThresholdSeconds: Object.freeze({ min: 15, max: 3600 }),
  retentionDays: Object.freeze({ min: 7, max: 3650 }),
});
