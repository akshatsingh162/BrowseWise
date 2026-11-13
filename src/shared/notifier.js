import { describeNotification } from './limits.js';
import { hasNotificationsPermission } from './notifications-permission.js';

/** Every notification id starts with this, so click handling can recognise ours. */
export const NOTIFICATION_PREFIX = 'browsewise-';

async function show(id, title, message) {
  // chrome.notifications does not exist until the optional permission is granted.
  if (!(await hasNotificationsPermission()) || !chrome.notifications?.create) return false;

  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
    });
    return true;
  } catch (error) {
    console.error('[BrowseWise] could not show notification', error);
    return false;
  }
}

/**
 * Shows the notification for a goal or limit that was reached.
 * @param {{type: 'goal'|'site', domain?: string, usedMs: number, limitMs: number}} item
 * @param {string} dateKey day the notification belongs to
 * @returns {Promise<boolean>} whether it was shown
 */
export function showLimitNotification(item, dateKey) {
  const { title, message } = describeNotification(item);
  const id =
    item.type === 'goal'
      ? `${NOTIFICATION_PREFIX}goal-${dateKey}`
      : `${NOTIFICATION_PREFIX}site-${dateKey}-${item.domain}`;
  return show(id, title, message);
}

/** A harmless message so the user can check that notifications reach their desktop. */
export function showTestNotification() {
  return show(
    `${NOTIFICATION_PREFIX}test`,
    'Notifications are working',
    'BrowseWise will notify you like this when you reach a goal or limit.',
  );
}
