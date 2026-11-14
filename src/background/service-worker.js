import { ERASE_SCOPES, eraseData, isEraseScope } from '../shared/data-erase.js';
import { MESSAGE_TYPES } from '../shared/messages.js';
import { openDashboard } from '../shared/navigation.js';
import { NOTIFICATION_PREFIX } from '../shared/notifier.js';
import { runMigrations } from '../shared/storage/migrations.js';
import { STORAGE_KEYS } from '../shared/storage/schema.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { errorMessage, reportFailure } from './errors.js';
import { checkLimits } from './limits-monitor.js';
import { runMaintenance } from './maintenance.js';
import { syncTracking } from './sync.js';

/**
 * Service worker entry point: wires Chrome events to the tracking engine.
 *
 * Rules this file follows:
 *  - Every listener is registered synchronously at the top level, so Chrome can
 *    wake a suspended worker and deliver the event that woke it.
 *  - No tracking state lives in memory. Each event calls syncTracking, which loads
 *    and saves state through storage.
 *  - Events are processed one at a time through a queue (below), because two
 *    overlapping read-modify-write cycles would corrupt the checkpoint.
 *  - The timestamp is captured when the event ARRIVES, not when it is processed.
 */

const HEARTBEAT_ALARM = 'browsewise-heartbeat';
// Chrome does not honour periods below 0.5 minutes (30 seconds).
const HEARTBEAT_PERIOD_MINUTES = 0.5;

let queue = Promise.resolve();

/** Runs tasks strictly in arrival order. A failing task never blocks later ones. */
function enqueue(label, task) {
  queue = queue.then(task).catch((error) => reportFailure(label, error));
  return queue;
}

/**
 * Like enqueue, but for tasks whose outcome the caller needs (a message that must be
 * answered). The task still runs in arrival order, between tracking tasks. The returned
 * promise never rejects: it resolves to `{ ok: true }` or `{ ok: false, error }`.
 */
function enqueueWithResult(label, task) {
  const result = queue.then(async () => {
    try {
      await task();
      return { ok: true };
    } catch (error) {
      reportFailure(label, error);
      return { ok: false, error: errorMessage(error) };
    }
  });
  queue = result.then(() => {});
  return result;
}

/**
 * Records tracking, then checks goals and limits, then does housekeeping. The last two
 * are separate and guarded: if either fails, tracking has already been saved and
 * nothing is lost.
 */
async function trackAndCheckLimits(request) {
  await syncTracking(request);
  try {
    await checkLimits({ now: request.now });
  } catch (error) {
    reportFailure('limit check', error);
  }
  await maintain({ now: request.now });
}

/** Deletes days past the retention setting (at most once a day unless forced). */
async function maintain(options) {
  try {
    await runMaintenance(options);
  } catch (error) {
    reportFailure('maintenance', error);
  }
}

function track(label, options = {}) {
  const now = Date.now();
  return enqueue(label, () => trackAndCheckLimits({ now, ...options }));
}

/** Idle detection uses a global interval; make sure it matches the user's setting. */
async function applyIdleThreshold() {
  const { idleThresholdSeconds } = await getSettings();
  chrome.idle.setDetectionInterval(idleThresholdSeconds);
}

/**
 * The heartbeat bounds how much a missed event or crash can cost, and keeps the
 * worker waking regularly. Chrome may drop alarms (for example after a browser
 * restart), so this runs on every worker start and only creates the alarm if missing.
 */
async function ensureHeartbeat() {
  const existing = await chrome.alarms.get(HEARTBEAT_ALARM);
  if (!existing) {
    await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
  }
}

async function prepare() {
  await applyIdleThreshold();
  await ensureHeartbeat();
}

// --- Lifecycle -------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  const now = Date.now();
  enqueue(`onInstalled:${details.reason}`, async () => {
    await runMigrations();
    await prepare();
    await syncTracking({ now });
  });
});

chrome.runtime.onStartup.addListener(() => {
  const now = Date.now();
  enqueue('onStartup', async () => {
    await runMigrations();
    await prepare();
    // Chrome was closed until just now, so nothing is credited for the gap.
    await syncTracking({ now, resetCheckpoint: true });
  });
});

// Runs on EVERY wake of the worker (not only install/startup).
enqueue('wake', prepare);

// --- Tracking events: each one just asks the engine to re-read the browser ---

chrome.tabs.onActivated.addListener(() => {
  void track('tabs.onActivated');
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Only URL or audio changes of the foreground tab can alter what we track.
  if (tab.active && (changeInfo.url !== undefined || changeInfo.audible !== undefined)) {
    void track('tabs.onUpdated');
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void track('tabs.onRemoved');
});

chrome.tabs.onReplaced.addListener(() => {
  void track('tabs.onReplaced');
});

chrome.windows.onFocusChanged.addListener(() => {
  void track('windows.onFocusChanged');
});

chrome.idle.onStateChanged.addListener((idleState) => {
  void track('idle.onStateChanged', { idleState });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) void track('heartbeat');
});

// Settings can change from the dashboard (a different context): re-apply them.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEYS.SETTINGS]) return;
  const now = Date.now();
  enqueue('settings changed', async () => {
    await applyIdleThreshold();
    await syncTracking({ now });
    // A shorter retention should take effect now, not at the next daily run.
    await maintain({ now, force: true });
  });
});

/**
 * Erases data inside the task queue, so tracking cannot write halfway through.
 *
 * For history: the time since the last checkpoint is saved first, so it is erased too
 * and cannot reappear afterwards as a stray few seconds. For everything: storage is
 * cleared and the defaults rewritten, then the worker's own set-up is applied again
 * and tracking starts afresh from now.
 */
async function eraseInWorker(scope, now) {
  if (scope === ERASE_SCOPES.HISTORY) await syncTracking({ now });
  await eraseData(scope);
  if (scope === ERASE_SCOPES.EVERYTHING) {
    await prepare();
    await syncTracking({ now: Date.now() });
  }
}

// UI contexts (the popup, the dashboard) talk to the worker through messages:
//   GET_LIVE_SNAPSHOT  flush the in-progress interval so displayed numbers are current
//   ERASE_DATA         erase history or everything, in order with tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === MESSAGE_TYPES.GET_LIVE_SNAPSHOT) {
    const now = Date.now();
    void enqueue('live snapshot', () => trackAndCheckLimits({ now })).then(() => {
      sendResponse({ ok: true });
    });
    return true; // keep the message channel open for the async response
  }

  if (message?.type === MESSAGE_TYPES.ERASE_DATA) {
    if (!isEraseScope(message.scope)) {
      sendResponse({ ok: false, error: 'Unknown erase scope.' });
      return false;
    }
    const now = Date.now();
    void enqueueWithResult('erase data', () => eraseInWorker(message.scope, now)).then(
      sendResponse,
    );
    return true;
  }

  return false;
});

// --- Notifications (optional permission) ------------------------------------
//
// chrome.notifications does not exist until the user grants the optional
// "notifications" permission, so it must never be touched unguarded: doing so at the
// top level would throw and stop the whole worker. The listener is registered at
// startup if the API is already there, and again if the permission is granted while
// the worker is running.

let notificationHandlersRegistered = false;

function handleNotificationClick(notificationId) {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;
  chrome.notifications.clear(notificationId);
  void openDashboard('goals').catch((error) => {
    reportFailure('opening the dashboard from a notification', error);
  });
}

function registerNotificationHandlers() {
  const onClicked = chrome.notifications?.onClicked;
  if (!onClicked || notificationHandlersRegistered) return;
  notificationHandlersRegistered = true;
  onClicked.addListener(handleNotificationClick);
}

registerNotificationHandlers();
chrome.permissions?.onAdded?.addListener(registerNotificationHandlers);
