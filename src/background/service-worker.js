import { MESSAGE_TYPES } from '../shared/messages.js';
import { runMigrations } from '../shared/storage/migrations.js';
import { STORAGE_KEYS } from '../shared/storage/schema.js';
import { getSettings } from '../shared/storage/settings-repo.js';
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
  queue = queue.then(task).catch((error) => {
    console.error(`[BrowseWise] ${label} failed`, error);
  });
  return queue;
}

function track(label, options = {}) {
  const now = Date.now();
  return enqueue(label, () => syncTracking({ now, ...options }));
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
  });
});

// UI contexts (the popup) can ask for an up-to-the-second flush so the numbers they
// display are not behind by up to one heartbeat.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.GET_LIVE_SNAPSHOT) return false;
  if (sender.id !== chrome.runtime.id) return false;

  const now = Date.now();
  void enqueue('live snapshot', () => syncTracking({ now })).then(() => {
    sendResponse({ ok: true });
  });
  return true; // keep the message channel open for the async response
});
