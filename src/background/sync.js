import { getSettings } from '../shared/storage/settings-repo.js';
import { addUsage } from '../shared/storage/usage-repo.js';
import { loadTrackerState, saveTrackerState } from './session-store.js';
import { advance, createInitialState, resolveTrackedDomain } from './tracker.js';

/**
 * The bridge between Chrome and the pure tracker.
 *
 * Design: Chrome events are treated as HINTS TO RE-READ THE TRUTH, not as data.
 * Whatever event woke us, we ask Chrome what is really focused, active and idle
 * right now. This makes the engine self-healing: a missed or reordered event is
 * corrected by the next event or heartbeat.
 *
 * The function is also STATELESS. All state is loaded from storage on entry and
 * saved on exit, so it behaves identically on a freshly woken service worker.
 *
 * Callers must run these one at a time (service-worker.js uses a queue).
 */

/** What Chrome says is focused right now. Never throws. */
export async function readBrowserState(settings) {
  let focusedWindow;
  try {
    focusedWindow = await chrome.windows.getLastFocused();
  } catch {
    // e.g. "No last-focused window": Chrome is running with no windows open.
    return { windowFocused: false, activeDomain: null, audible: false };
  }

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, windowId: focusedWindow.id });
  } catch {
    tab = undefined;
  }

  return {
    windowFocused: focusedWindow.focused === true,
    activeDomain: resolveTrackedDomain(tab, settings),
    audible: tab?.audible === true,
  };
}

async function readIdleState(settings) {
  try {
    return await chrome.idle.queryState(settings.idleThresholdSeconds);
  } catch {
    return 'active';
  }
}

/**
 * Credits elapsed time to the previous state, then records the current one.
 *
 * @param {object} request
 * @param {number} request.now             timestamp captured when the event ARRIVED
 * @param {'active'|'idle'|'locked'} [request.idleState]
 *        idle state delivered by the event itself; skips the (racy) queryState call
 * @param {boolean} [request.resetCheckpoint]
 *        true at browser startup: do not credit anything for the time Chrome was closed
 */
export async function syncTracking({ now, idleState, resetCheckpoint = false }) {
  const settings = await getSettings();
  const options = { countAudibleTabsAsActive: settings.countAudibleTabsAsActive };

  const stored = (await loadTrackerState()) ?? createInitialState(now);
  const previous = resetCheckpoint ? { ...stored, checkpointTs: now } : stored;

  const observed = await readBrowserState(settings);
  observed.idleState = idleState ?? (await readIdleState(settings));

  const { state, credit } = advance(previous, now, observed, options);

  // Order matters. Saving the checkpoint FIRST means a crash between the two writes
  // loses one interval (at most ~30 s) rather than counting it twice on the next
  // flush. For a usage tracker, a rare small undercount beats a double count.
  await saveTrackerState(state);
  if (credit) await addUsage(credit.domain, credit.segments);

  return { state, credit };
}
