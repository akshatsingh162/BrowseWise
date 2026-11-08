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

## Popup (Phase 3)

Open the popup by clicking the BrowseWise icon in the toolbar (pin it from the puzzle-piece menu first). Right-click inside the popup and choose **Inspect** to see its console.

| #   | Test              | Steps                                                                                      | Expected                                                                                    |
| --- | ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| P1  | Empty state       | Run `chrome.storage.local.clear()` in the worker console, reload the extension, open popup | "No browsing time yet today" with an icon; the button still works                           |
| P2  | Live numbers      | Browse a site for 2 minutes, then open the popup                                           | Total and the site row include time up to the last few seconds (no 30 s lag)                |
| P3  | Live updates      | Keep the popup open ~30 s while on a tracked page                                          | Numbers update on their own (refresh runs every 15 s)                                       |
| P4  | Ranking           | Visit three sites for different lengths                                                    | Rows ordered most to least, percentages sensible, bars proportional                         |
| P5  | Favicons          | Check the icons next to sites                                                              | Real favicons for visited sites; a neutral globe if none is available                       |
| P6  | Top-5 limit       | Visit 6 or more sites                                                                      | Only 5 rows plus "+N more in the dashboard"                                                 |
| P7  | Dashboard button  | Click **Open dashboard** (and the icon in the header)                                      | A tab opens with the placeholder page; clicking again focuses that tab instead of a new one |
| P8  | Keyboard          | Press Tab repeatedly in the popup                                                          | A visible focus ring moves through the buttons; Enter activates them                        |
| P9  | Hover tooltips    | Hover the comparison chip and a site's bar                                                 | Tooltips explain the comparison and the percentage                                          |
| P10 | Popup vs. focus   | Watch whether total keeps growing while the popup is open                                  | Note what you see. Opening the popup may change window focus on your system (report it)     |
| P11 | Network silence   | In popup DevTools open the **Network** tab, reload the popup                               | Only `chrome-extension://` requests; nothing to any website                                 |
| P12 | Permission prompt | `chrome://extensions` → BrowseWise → Details → Permissions                                 | Note the exact wording Chrome shows (we expect the browsing-history line from `tabs`)       |

## Dashboard (Phase 4)

Open it from the popup's **Open dashboard** button.

| #   | Test               | Steps                                                                                            | Expected                                                                                       |
| --- | ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| D1  | Opens once         | Click **Open dashboard** twice from the popup                                                    | One dashboard tab; the second click focuses it                                                 |
| D2  | Navigation         | Click each of the five sidebar items, then use the browser Back and Forward buttons              | Page changes, address ends in `#overview`, `#analytics`, etc., highlight follows, Back works   |
| D3  | Deep link / reload | On `#websites` press F5                                                                          | Stays on Websites                                                                              |
| D4  | Overview numbers   | Compare Overview with the popup                                                                  | Total, website count, and most-used site agree (within a few seconds)                          |
| D5  | Live update        | Leave the dashboard open, browse another site for a minute in a different tab, switch back       | Numbers have caught up without reloading                                                       |
| D6  | Comparison tooltip | Hover the line under the total                                                                   | Tooltip explains the comparison with yesterday                                                 |
| D7  | Ranges             | On Websites click **Today**, **7 days**, **30 days**                                             | List reloads; multi-day summary reads "across N of 7 days" (or 30); the selected button is lit |
| D8  | Filter             | Type part of a domain                                                                            | Only matches remain, rank numbers keep their original values; clearing restores the list       |
| D9  | Filter focus       | Type in the filter box and keep typing for 30 s or more                                          | The box never loses focus or text when data refreshes                                          |
| D10 | Empty state        | Run `chrome.storage.local.clear()` in the worker console and reload the extension, open Websites | "No browsing time recorded" message; Overview shows zeros and "—" without errors               |
| D11 | Placeholder pages  | Open Analytics, Goals & limits, Settings                                                         | Each shows a heading and "Coming soon", nothing broken                                         |
| D12 | Keyboard           | Tab through the sidebar and page controls; press Enter on a nav item                             | Visible focus ring everywhere; after navigating, focus moves into the page                     |
| D13 | Narrow window      | Drag the window narrower than about 800 px                                                       | Sidebar becomes a top bar, list stays readable, no sideways page scroll                        |
| D14 | Favicons           | Check icons in the lists                                                                         | Real icons for visited sites, a neutral globe otherwise                                        |
| D15 | Network silence    | In dashboard DevTools open **Network** and reload                                                | Only `chrome-extension://` requests                                                            |
