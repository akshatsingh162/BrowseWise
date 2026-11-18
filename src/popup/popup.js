import '../ui/styles/tokens.css';
import '../ui/styles/base.css';
import '../ui/styles/components.css';
import '../ui/styles/ambient.css';
import './popup.css';

import { mountAmbient } from '../ui/ambient.js';
import { sendFocusCommand } from '../shared/focus-client.js';
import { requestLiveFlush } from '../shared/live-flush.js';
import { shiftDateKey } from '../shared/dates.js';
import { openDashboard } from '../shared/navigation.js';
import { buildOverview } from '../shared/stats.js';
import { getFocusState, subscribeToFocusChanges } from '../shared/storage/focus-repo.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { getUsageForRange } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';
import { subscribeToUsageChanges } from '../shared/usage-events.js';
import { createFocusWidget } from './focus-widget.js';
import { createPopupController } from './popup-controller.js';

/** While the popup stays open, flush and refresh this often. */
const LIVE_REFRESH_MS = 15_000;

async function loadOverview(now) {
  const todayKey = toLocalDateKey(now);
  const [today, yesterday] = await getUsageForRange([todayKey, shiftDateKey(todayKey, -1)]);
  return buildOverview({ today, yesterday, now });
}

mountAmbient();

const focusWidget = createFocusWidget({
  loadSnapshot: async () => {
    const [state, settings] = await Promise.all([getFocusState(), getSettings()]);
    return { state, focusMinutes: settings.focusMinutes };
  },
  sendFocusCommand,
  subscribe: (callback) => subscribeToFocusChanges(callback, { debounceMs: 50 }),
});

const controller = createPopupController({
  root: document.getElementById('app'),
  loadOverview,
  requestLiveFlush: () => requestLiveFlush(),
  openDashboard,
  focusSlot: focusWidget.element,
});

void controller.start();
void focusWidget.start();

// Keep numbers fresh while the popup is open.
setInterval(() => void controller.refresh({ flush: true, silent: true }), LIVE_REFRESH_MS);

// No flush here: flushing writes storage, which would trigger this subscription again.
subscribeToUsageChanges(() => void controller.refresh({ silent: true }), { debounceMs: 250 });
