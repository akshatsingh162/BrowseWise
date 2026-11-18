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

const minutesOf = (ms) => Math.round(ms / 60_000);

/**
 * Tells the user a focus session or a break has finished.
 * @param {{completion: {phase: string, durationMs: number, sessionId: string},
 *          next: {phase: string, status: string, durationMs: number}|null}} details
 */
export function showFocusNotification({ completion, next }) {
  const id = `${NOTIFICATION_PREFIX}focus-${completion.sessionId}`;

  if (completion.phase === 'focus') {
    const focused = `You focused for ${minutesOf(completion.durationMs)} minutes.`;
    if (!next) return show(id, 'Focus session complete', focused);
    const kind = next.phase === 'longBreak' ? 'long break' : 'short break';
    const length = `${minutesOf(next.durationMs)}-minute ${kind}`;
    return show(
      id,
      'Focus session complete',
      next.status === 'running'
        ? `${focused} Your ${length} has started.`
        : `${focused} Time for a ${length}.`,
    );
  }

  return show(
    id,
    'Break over',
    next?.status === 'running'
      ? 'Your next focus session has started.'
      : 'Ready for the next focus session?',
  );
}

/** Tells the user a badge was earned. @param {{id: string, title: string, description: string}} badge */
export function showBadgeNotification(badge) {
  return show(
    `${NOTIFICATION_PREFIX}badge-${badge.id}`,
    `New badge: ${badge.title}`,
    badge.description,
  );
}
