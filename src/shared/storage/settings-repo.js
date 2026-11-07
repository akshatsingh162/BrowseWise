import { DEFAULT_SETTINGS, SETTINGS_LIMITS, STORAGE_KEYS } from './schema.js';
import { withStorageLock } from './lock.js';

function clampInteger(value, { min, max }, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Builds a valid settings object from untrusted input (storage or UI).
 * Unknown keys are dropped, numbers are clamped, and wrong types fall back to defaults.
 * @param {unknown} raw
 */
export function sanitizeSettings(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {};
  const bool = (key) => (typeof input[key] === 'boolean' ? input[key] : DEFAULT_SETTINGS[key]);

  return {
    idleThresholdSeconds: clampInteger(
      input.idleThresholdSeconds,
      SETTINGS_LIMITS.idleThresholdSeconds,
      DEFAULT_SETTINGS.idleThresholdSeconds,
    ),
    countAudibleTabsAsActive: bool('countAudibleTabsAsActive'),
    trackLocalHosts: bool('trackLocalHosts'),
    notificationsEnabled: bool('notificationsEnabled'),
    retentionDays: clampInteger(
      input.retentionDays,
      SETTINGS_LIMITS.retentionDays,
      DEFAULT_SETTINGS.retentionDays,
    ),
  };
}

/** Reads are lock-free; always returns a complete, valid settings object. */
export async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return sanitizeSettings(stored[STORAGE_KEYS.SETTINGS]);
}

/**
 * Merges a partial update into the stored settings.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 * @returns {Promise<ReturnType<typeof sanitizeSettings>>} the saved settings
 */
export function updateSettings(patch) {
  return withStorageLock(async () => {
    const current = await getSettings();
    const next = sanitizeSettings({ ...current, ...patch });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
    return next;
  });
}

export function resetSettings() {
  return withStorageLock(async () => {
    const defaults = sanitizeSettings(DEFAULT_SETTINGS);
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: defaults });
    return defaults;
  });
}
