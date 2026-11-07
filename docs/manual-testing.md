# Manual testing: tracking engine

Unit tests cover the logic. These steps verify the real Chrome behaviour that unit tests cannot.

## Helper: show today's usage

Open the extension's service worker console (`chrome://extensions` → BrowseWise → **service worker**). If Chrome asks, type `allow pasting` and press Enter, then paste:

```js
(async () => {
  const key = 'usage:' + new Date().toLocaleDateString('en-CA');
  const all = await chrome.storage.local.get([key, 'tracker:state']);
  console.table(
    Object.entries(all[key]?.domainMs ?? {}).map(([domain, ms]) => ({
      domain,
      seconds: Math.round(ms / 1000),
    })),
  );
  console.log('tracker state', all['tracker:state']);
})();
```

Press the up arrow to re-run it. Stored totals lag real time by up to about 30 s.

**Important:** an open DevTools window keeps the service worker alive. Close it for the suspension test.

## Tests

| #   | Test                 | Steps                                                                                    | Expected                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Heartbeat alarm      | Run `chrome.alarms.getAll().then(console.log)`                                           | One alarm `browsewise-heartbeat`, `periodInMinutes: 0.5`               |
| 2   | Basic tracking       | Open github.com, keep it focused for 2 minutes, moving the mouse now and then            | `github.com` grows to roughly 90-120 s                                 |
| 3   | Tab switching        | 60 s on site A, switch tab, 60 s on site B                                               | A and B each about 60 s, within the 30 s lag                           |
| 4   | Focus loss           | Alt-Tab to another app for 90 s, then return                                             | Total does not grow during the 90 s                                    |
| 5   | Multiple windows     | Open a second Chrome window (Ctrl+N) with another site and click between windows         | Only the focused window's active tab grows                             |
| 6   | Idle detection       | See "Fast idle" below. Do not touch mouse or keyboard for 60 s                           | Total stops growing about 15 s after your last input; resumes on input |
| 7   | Locked screen        | Press Win+L for 90 s, then unlock                                                        | No growth while locked                                                 |
| 8   | Internal pages       | Keep `chrome://extensions` focused for 90 s                                              | No new rows, no growth                                                 |
| 9   | Worker suspension    | Close the worker DevTools. Wait until the card shows "inactive". Switch tabs a few times | Tracking continues; totals still grow after the worker wakes           |
| 10  | Extension reload     | Click the reload icon on the extension card, then browse for 60 s                        | Previous totals are kept and growth resumes                            |
| 11  | Browser restart      | Close ALL Chrome windows (check the tray for a background Chrome), wait 2 min, reopen    | Totals kept, closed period not counted, test 1 shows the alarm again   |
| 12  | Incognito (optional) | Enable incognito access for the extension, browse in an incognito window for 60 s        | No growth                                                              |

### Fast idle

In the service worker console:

```js
chrome.storage.local
  .get('settings')
  .then(({ settings }) =>
    chrome.storage.local.set({ settings: { ...settings, idleThresholdSeconds: 15 } }),
  );
```

Restore the default afterwards by setting the value back to `60`.

### Midnight

Covered by unit tests (including a randomised run across midnight). End-to-end verification is part of the Phase 9 hardening pass.
