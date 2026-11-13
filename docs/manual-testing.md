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

## Sample data (optional, for testing charts)

Weekly and monthly charts need weeks of history. This snippet fills only the days that currently have **no record** (it never touches real days) and remembers exactly which keys it created, so the cleanup removes only those. Run it in the service worker console:

```js
(async () => {
  const sites = ['github.com', 'youtube.com', 'wikipedia.org', 'stackoverflow.com', 'claude.ai'];
  const existing = await chrome.storage.local.get(null);
  const created = [];
  const updates = {};
  const today = new Date();
  for (let i = 1; i <= 90; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = 'usage:' + d.toLocaleDateString('en-CA');
    if (existing[key] || Math.random() < 0.2) continue;
    const hourlyMs = new Array(24).fill(0);
    const domainMs = {};
    for (let h = 8; h < 23; h += 1) {
      if (Math.random() < 0.35) continue;
      const ms = Math.round((5 + Math.random() * 40) * 60000);
      hourlyMs[h] = ms;
      const site = sites[Math.floor(Math.random() * sites.length)];
      domainMs[site] = (domainMs[site] ?? 0) + ms;
    }
    updates[key] = { date: key.slice(6), hourlyMs, domainMs };
    created.push(key);
  }
  await chrome.storage.local.set({ ...updates, devSampleKeys: created });
  console.log('Created sample data for', created.length, 'days');
})();
```

Remove the sample data when you are done:

```js
chrome.storage.local.get('devSampleKeys').then(async ({ devSampleKeys = [] }) => {
  await chrome.storage.local.remove([...devSampleKeys, 'devSampleKeys']);
  console.log('Removed', devSampleKeys.length, 'sample days');
});
```

## Analytics (Phase 5)

Open the dashboard and choose **Analytics**. Use the sample data above for tests A5 to A9.

| #   | Test            | Steps                                                                                | Expected                                                                                            |
| --- | --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A1  | Daily view      | Open Analytics with some browsing recorded today                                     | "Today", four stat cards, an hourly bar chart, and a website list. Bars add up to roughly the total |
| A2  | Tooltips        | Hover the hourly bars                                                                | Tooltip shows the hour range (for example 2 PM – 3 PM) and the exact duration                       |
| A3  | Day navigation  | Click the left arrow, the right arrow, and **Today**                                 | Label reads Yesterday, then a full date; the right arrow and **Today** are disabled while on today  |
| A4  | Empty day       | Step back to a day before you installed BrowseWise                                   | "No browsing time on this day", no empty charts                                                     |
| A5  | Weekly          | Click **Weekly**                                                                     | Grouped bars (last 7 days and previous 7 days), a legend, four cards, a "Most used this week" list  |
| A6  | Weekly tooltip  | Hover a weekday                                                                      | Tooltip lists both bars, each with its own date                                                     |
| A7  | Click a bar     | Click any bar in the weekly chart, including a muted previous-week bar               | Switches to Daily showing exactly that day; **Daily** is highlighted                                |
| A8  | Monthly         | Click **Monthly**                                                                    | A 30-day line, a six-month bar chart with the current month lighter, a website list                 |
| A9  | Monthly details | Hover the current month's bar; click a point on the line                             | Tooltip says "so far" and shows active days; the click opens that day                               |
| A10 | Responsive      | Resize the window from wide to narrow                                                | Charts resize with it, nothing overflows sideways                                                   |
| A11 | No flicker      | Stay on a chart for a minute while doing nothing                                     | The chart does not redraw or flash                                                                  |
| A12 | Live update     | Browse another site for two minutes, then switch back to the Analytics tab           | Numbers and charts have caught up                                                                   |
| A13 | Reduced motion  | Turn off Windows animation effects (Settings, Accessibility, Visual effects), reload | Charts appear without animating                                                                     |
| A14 | Accessible data | In DevTools Elements, find `table.bw-sr-only` inside each chart card                 | A hidden table holds the same numbers as the chart                                                  |
| A15 | Keyboard        | Tab to the view buttons, day arrows, and **Today**, press Enter                      | Visible focus ring; everything works without a mouse                                                |
| A16 | Network silence | Open DevTools Network and reload the dashboard                                       | Only `chrome-extension://` requests                                                                 |

## Logo

| #   | Test               | Steps                                                          | Expected                                                   |
| --- | ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| L1  | Toolbar            | Look at the pinned toolbar icon (try a light and a dark theme) | The blue "bw" tile is clearly visible and readable on both |
| L2  | Popup and sidebar  | Open the popup and the dashboard                               | Same logo in the popup header and the dashboard sidebar    |
| L3  | Tab and extensions | Look at the dashboard browser tab and `chrome://extensions`    | The logo appears on the tab and on the extension card      |

## Categories (Phase 6)

| #   | Test                 | Steps                                                                                       | Expected                                                                                                       |
| --- | -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1  | Automatic categories | Open **Websites** after visiting github.com, youtube.com, and a few others                  | Every row has a category dropdown showing a sensible automatic choice (github.com: Development & Programming)  |
| C2  | Unknown sites        | Look at a site that is not a household name                                                 | It shows **Other**, and nothing breaks                                                                         |
| C3  | Change a category    | Change youtube.com to **Education**                                                         | The row updates instantly, a dot appears, and "Category saved for youtube.com." is announced                   |
| C4  | Persistence          | Reload the dashboard, then close and reopen Chrome                                          | The change is still there                                                                                      |
| C5  | Reset                | Open the dropdown on the changed row and choose **Reset to automatic**                      | The dot disappears and the automatic category returns                                                          |
| C6  | Applies everywhere   | After changing a category, open **Overview** and **Analytics**                              | The "Time by category" figures reflect your change                                                             |
| C7  | Category panel       | Open **Overview**                                                                           | Productive sites, Entertainment, and Social media show time and percentage; a bar and list show all categories |
| C8  | Analytics panels     | Open **Analytics**: Daily, Weekly, Monthly                                                  | Each view has a "Time by category" panel for its own period                                                    |
| C9  | Disclaimer           | Look for the note on the Overview, Analytics, and Websites pages                            | It says categories describe the website, not what you were doing                                               |
| C10 | Category filter      | On **Websites** choose **Development & Programming** in the filter                          | Only matching rows remain; rank numbers keep their original values; the summary says "N of M websites"         |
| C11 | Filter plus search   | Combine the category filter with the text filter                                            | Both apply together; a combination with no match shows a clear message                                         |
| C12 | Keyboard             | Tab to a category dropdown, change it with the arrow keys                                   | It works without a mouse and keyboard focus stays on that dropdown afterwards                                  |
| C13 | Local development    | Visit a local dev server such as http://localhost:3000                                      | It shows **Development & Programming**                                                                         |
| C14 | Subdomains           | Visit gist.github.com and mail.google.com                                                   | gist.github.com is Development & Programming; mail.google.com is Communication                                 |
| C15 | Exact-domain choices | Change github.com to Entertainment, then look at gist.github.com                            | gist.github.com keeps its automatic category                                                                   |
| C16 | Two tabs             | Open the dashboard in two tabs, change a category in one                                    | The other tab updates itself within a second or so                                                             |
| C17 | Narrow window        | Make the window narrower than about 800 px on the Websites page                             | Each row stays readable and the category dropdown drops onto its own line                                      |
| C18 | Stored data          | In the worker console run `chrome.storage.local.get('categoryOverrides').then(console.log)` | Only domain-to-category pairs, nothing else                                                                    |

## Goals and limits (Phase 7)

Open the dashboard and choose **Goals & limits**.

| #   | Test              | Steps                                                                                            | Expected                                                                                         |
| --- | ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| G1  | Empty state       | Open the page with nothing set                                                                   | "No goals or limits yet"; **Remove all** and the test button are disabled; notifications are off |
| G2  | Daily goal        | Enter 2 hours and 0 minutes and press **Save goal**                                              | "Daily goal saved: 2h 00m." and a progress bar for today appears                                 |
| G3  | Progress          | Browse for a few minutes, then reopen or refresh the page                                        | The bar and "time left" reflect real use; the dashboard itself does not add time                 |
| G4  | Validation        | Try 0 hours 2 minutes, 25 hours, 1 hour 60 minutes, and 1.5 hours                                | A clear message each time, red outline on the fields, nothing is saved                           |
| G5  | Edit the goal     | Click the pencil on the goal row                                                                 | The form fills with the current value and focus moves to it; saving changes the goal             |
| G6  | Website limit     | Add youtube.com with 30 minutes                                                                  | "Limit saved for youtube.com: 30m a day." and a row with a bar                                   |
| G7  | Pasted address    | Paste a full address such as `https://www.youtube.com/watch?v=abc` as the website                | It is saved as `youtube.com`                                                                     |
| G8  | Bad address       | Type `notawebsite`                                                                               | "That does not look like a website address."                                                     |
| G9  | Suggestions       | Click the website box and look at the suggestions                                                | Your most-used sites from the last 30 days are offered                                           |
| G10 | Update a limit    | Type a website that already has a limit                                                          | The button changes to **Update limit**                                                           |
| G11 | Remove a limit    | Click the bin on a limit row                                                                     | "Limit removed for …" and the row disappears; other limits stay                                  |
| G12 | Levels in words   | Look at a limit that is over 80%, and one that is passed                                         | Text says "N left" or "Over by N" or "Limit reached"; the bar colour changes as well             |
| G13 | Remove everything | Press **Remove all goals and limits**, then try Cancel, Escape, and clicking outside             | Each cancels and removes nothing. Focus returns to the button                                    |
| G14 | Confirm removal   | Press it again and choose **Remove all**                                                         | Everything is removed with a message                                                             |
| G15 | Persistence       | Reload the dashboard, then restart Chrome                                                        | Goals and limits are still there                                                                 |
| G16 | Typing survives   | Start typing a website and keep the page open for a minute                                       | Your typing is never wiped by background updates                                                 |
| G17 | Keyboard          | Use only Tab, Enter, Space, and arrow keys                                                       | Every control works, with a visible focus ring; the switch toggles with Space                    |
| G18 | Narrow window     | Make the window narrower than about 800 px                                                       | Forms wrap onto several lines and stay usable                                                    |
| G19 | Two tabs          | Open the dashboard in two tabs and change a limit in one                                         | The other tab updates itself within a second or so                                               |
| G20 | Stored data       | In the worker console run `chrome.storage.local.get(['goals','limitNotices']).then(console.log)` | Only the goal, limits in minutes, and the notification record                                    |

## Notifications (Phase 7)

| #   | Test                   | Steps                                                                                                     | Expected                                                                                         |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| N1  | Permission is optional | Look at the permissions Chrome shows on `chrome://extensions` details **before** turning notifications on | No notifications permission yet. **Note exactly what it shows.**                                 |
| N2  | Turn on                | Switch notifications on                                                                                   | Chrome shows a permission prompt. **Note its exact wording.** Allow it. The switch turns on      |
| N3  | Decline                | Turn off, then on again and choose to block it                                                            | The switch stays off with "Chrome did not grant the permission, so notifications stay off."      |
| N4  | Test notification      | With notifications on, press **Send a test notification**                                                 | A desktop notification appears. If not, check Focus assist and Chrome notifications in Windows   |
| N5  | A limit is reached     | Set a **5 minute** limit on a site and keep that tab active for about 5 minutes (move the mouse)          | One notification: "<site> limit reached", within about 30 seconds of reaching it                 |
| N6  | Only once              | Keep browsing the same site                                                                               | No second notification that day                                                                  |
| N7  | Click it               | Click the notification                                                                                    | The dashboard opens (or focuses) on the Goals page                                               |
| N8  | Raising the limit      | Raise that limit to 15 minutes and keep browsing past it                                                  | It notifies again once the new limit is reached                                                  |
| N9  | Already over           | Set a limit lower than what you have already used today                                                   | No notification, and the row shows as reached                                                    |
| N10 | Turning on while over  | Turn notifications off, go over a limit, then turn notifications on                                       | No notification for limits you have already passed                                               |
| N11 | Daily goal             | Set a 5 minute daily goal on a day with little use, then browse past it                                   | A "Daily goal reached" notification                                                              |
| N12 | Turn off               | Switch notifications off                                                                                  | The permission is removed (check `chrome://extensions` details) and no more notifications arrive |
| N13 | Worker restart         | Close the worker DevTools, wait for it to go inactive, then reach a limit                                 | The notification still arrives                                                                   |
