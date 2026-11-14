/**
 * Chrome's documented limit for chrome.storage.local is about 10 MB (the
 * "unlimitedStorage" permission would lift it, and BrowseWise does not request it).
 * Typical use stays far below it; a very heavy user keeping many years of history
 * could approach it, so the Settings page shows the figure and warns near the end.
 */
export const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;

/** Share of the quota at which the Settings page starts warning. */
export const STORAGE_WARNING_SHARE = 0.8;

/**
 * Whether storage is close enough to the limit that new time might stop being saved.
 * @param {number|null} bytes
 */
export function isStorageNearlyFull(bytes) {
  return Number.isFinite(bytes) && bytes >= STORAGE_QUOTA_BYTES * STORAGE_WARNING_SHARE;
}

/**
 * How much of the extension's storage is in use. Informational only.
 * @param {{getBytesInUse: (keys: null) => Promise<number>}} [area] injectable for tests
 * @returns {Promise<number|null>} bytes, or null when Chrome cannot say
 */
export async function getStorageUsage(area) {
  try {
    const target = area ?? chrome.storage.local;
    const bytes = await target.getBytesInUse(null);
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * "812 B", "14.2 KB", "1.3 MB". Binary units (1 KB = 1024 bytes).
 * @param {number|null} bytes
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '\u2014';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}
