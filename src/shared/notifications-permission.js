/**
 * The "notifications" permission is OPTIONAL: it is not requested at install and
 * never shows an install warning. It is requested only when the user turns
 * notifications on, and removed again when they turn them off.
 *
 * chrome.permissions.request() must be called straight from a user gesture such as
 * a click, so callers must not await anything before calling requestNotificationsPermission().
 */

const PERMISSION = { permissions: ['notifications'] };

export async function hasNotificationsPermission() {
  try {
    return await chrome.permissions.contains(PERMISSION);
  } catch {
    return false;
  }
}

/** @returns {Promise<boolean>} whether the user granted it */
export async function requestNotificationsPermission() {
  try {
    return await chrome.permissions.request(PERMISSION);
  } catch (error) {
    console.error('[BrowseWise] notifications permission request failed', error);
    return false;
  }
}

export async function removeNotificationsPermission() {
  try {
    return await chrome.permissions.remove(PERMISSION);
  } catch (error) {
    console.error('[BrowseWise] could not remove notifications permission', error);
    return false;
  }
}
