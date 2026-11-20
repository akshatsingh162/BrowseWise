/**
 * Storage schema: the single source of truth for keys and defaults.
 *
 * chrome.storage.local layout
 *   meta               { schemaVersion: number }
 *   settings           { ...DEFAULT_SETTINGS }
 *   usage:YYYY-MM-DD   { date, hourlyMs: number[24], domainMs: { [domain]: ms } }
 *
 *   focusState        the running focus/break phase, or null (see shared/focus.js)
 *   focusDay:YYYY-MM-DD  { date, sessions, focusMs, longestMs } completed focus sessions that day
 *   achievements      { earned, best, days, lastClosed } (see shared/achievements.js)
 *
 * Keys added after the first release (categories, goals, focus, ...) are optional and
 * have safe defaults, so they need no schema migration.
 */

export const HOURS_PER_DAY = 24;

export const STORAGE_KEYS = Object.freeze({
  META: 'meta',
  SETTINGS: 'settings',
  USAGE_PREFIX: 'usage:',
  FOCUS_STATE: 'focusState',
  FOCUS_DAY_PREFIX: 'focusDay:',
  ACHIEVEMENTS: 'achievements',
});

export const DEFAULT_SETTINGS = Object.freeze({
  idleThresholdSeconds: 60,
  countAudibleTabsAsActive: false,
  trackLocalHosts: true,
  notificationsEnabled: false,
  retentionDays: 365,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
  showAchievements: true,
  // The navigation dock slides away while scrolling down, to leave more room for content.
  dockAutoHide: true,
});

export const SETTINGS_LIMITS = Object.freeze({
  idleThresholdSeconds: Object.freeze({ min: 15, max: 3600 }),
  retentionDays: Object.freeze({ min: 7, max: 3650 }),
  // Focus sessions shorter than 5 minutes are not offered, so badges mean something.
  focusMinutes: Object.freeze({ min: 5, max: 120 }),
  shortBreakMinutes: Object.freeze({ min: 1, max: 30 }),
  longBreakMinutes: Object.freeze({ min: 1, max: 60 }),
  longBreakEvery: Object.freeze({ min: 2, max: 8 }),
});
