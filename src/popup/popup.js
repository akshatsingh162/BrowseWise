import '../ui/styles/tokens.css';
import '../ui/styles/base.css';
import '../ui/styles/components.css';
import './popup.css';

import { MESSAGE_TYPES } from '../shared/messages.js';
import { shiftDateKey } from '../shared/dates.js';
import { openDashboard } from '../shared/navigation.js';
import { buildOverview } from '../shared/stats.js';
import { STORAGE_KEYS } from '../shared/storage/schema.js';
import { getUsageForRange } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';
import { createPopupController } from './popup-controller.js';

/** While the popup stays open, flush and refresh this often. */
const LIVE_REFRESH_MS = 15_000;
/** Never let a slow or suspended worker block the popup. */
const FLUSH_TIMEOUT_MS = 2_000;
const STORAGE_REFRESH_DEBOUNCE_MS = 250;

async function loadOverview(now) {
  const todayKey = toLocalDateKey(now);
  const [today, yesterday] = await getUsageForRange([todayKey, shiftDateKey(todayKey, -1)]);
  return buildOverview({ today, yesterday, now });
}

async function requestLiveFlush() {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('live flush timed out')), FLUSH_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }),
      timeout,
    ]);
  } catch (error) {
    // Not fatal: we still show whatever is stored.
    console.warn('[BrowseWise] live flush unavailable', error);
  }
}

const controller = createPopupController({
  root: document.getElementById('app'),
  loadOverview,
  requestLiveFlush,
  openDashboard,
});

void controller.start();

// Keep numbers fresh while the popup is open.
setInterval(() => void controller.refresh({ flush: true, silent: true }), LIVE_REFRESH_MS);

let storageTimer;
chrome.storage.onChanged.addListener((changes, areaName) => {
  const usageChanged = Object.keys(changes).some((key) =>
    key.startsWith(STORAGE_KEYS.USAGE_PREFIX),
  );
  if (areaName !== 'local' || !usageChanged) return;
  // No flush here: flushing writes storage, which would trigger this listener again.
  clearTimeout(storageTimer);
  storageTimer = setTimeout(
    () => void controller.refresh({ silent: true }),
    STORAGE_REFRESH_DEBOUNCE_MS,
  );
});
