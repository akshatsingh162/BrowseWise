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

## History (Phase 8)

Load the **sample data** from the helper section above first (about 70 days of history), then open the dashboard and choose **History**.

| #   | Test            | Steps                                                               | Expected                                                                                              |
| --- | --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| H1  | Empty state     | On a fresh profile (or after **Clear history**), open **History**   | "No history yet" in Days and in Weeks                                                                 |
| H2  | Days list       | With sample data, open **Days**                                     | Newest first; labels say Today / Yesterday / a short date; each row has a bar, a total and a top site |
| H3  | Show more       | Scroll to the bottom                                                | "Showing 30 of N days" and a button. It adds more rows and the list keeps its place                   |
| H4  | View link       | Click **View** on an older day                                      | **Analytics** opens in the daily view on exactly that day, with its charts                            |
| H5  | Back button     | After H4 press the browser's Back button                            | You return to **History**                                                                             |
| H6  | Weeks           | Open **Weeks**                                                      | Monday-to-Sunday rows, newest first; the current week says "This week"; totals match the days         |
| H7  | Average wording | Look at a week where you were active on only some days              | "a day" average is over the active days only, and "N active days" is shown                            |
| H8  | One website     | Open **One website**, type `github.com`, press **Show history**     | Four cards (Total time, Days visited, Average per visit day, Busiest day) and a trend chart           |
| H9  | Suggestions     | Click the website box                                               | Your most-used sites are suggested                                                                    |
| H10 | Pasted address  | Paste `https://www.YouTube.com/watch?v=abc`                         | The box shows `youtube.com` and its history loads                                                     |
| H11 | Bad address     | Type `notawebsite`                                                  | "That does not look like a website address." and nothing loads                                        |
| H12 | Ranges          | Switch between **30 days**, **90 days** and **1 year**              | The chart and cards change; the 1 year chart is readable (labels thin out)                            |
| H13 | Chart click     | Click a point on the trend chart                                    | **Analytics** opens on that day                                                                       |
| H14 | Never visited   | Search for a site you never used, such as `example.org`             | "No time on example.org" with an explanation                                                          |
| H15 | Typing survives | Start typing a website and wait a minute (or browse in another tab) | Your typing is never wiped by refreshes                                                               |
| H16 | Keyboard        | Use only Tab, Enter and Space on the whole page                     | Every control works, focus ring is visible, **Show more** keeps keyboard focus on its button          |
| H17 | Narrow window   | Make the window narrower than about 800 px                          | Rows stay readable; bars are hidden; the top site drops onto its own line                             |
| H18 | Two tabs        | Open the dashboard in two tabs, then **Clear history** in one       | The other tab's History empties by itself within a second or so                                       |

## Analytics deep link (Phase 8)

| #   | Test                 | Steps                                                                                      | Expected                                 |
| --- | -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| A1  | Valid day            | Open `chrome-extension://<id>/src/dashboard/dashboard.html#analytics?day=` plus a past day | Analytics opens in **Daily** on that day |
| A2  | Invalid day          | Try `#analytics?day=2026-02-31`, `#analytics?day=tomorrow`, and a future date              | Each opens on **Today**; nothing breaks  |
| A3  | Already on Analytics | While on Analytics, change the hash in the address bar to another day and press Enter      | The page switches to that day            |

## Settings (Phase 8)

Open the dashboard and choose **Settings**.

| #   | Test                  | Steps                                                                                                         | Expected                                                                                              |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| S1  | Layout                | Open **Settings**                                                                                             | Tracking, History, Notifications, Your data, Privacy, and the version line (`BrowseWise 0.1.0`)       |
| S2  | Stored summary        | Look at **History**                                                                                           | Days recorded, the first and last date, and "Storage used … of about 10 MB". **Note the size shown.** |
| S3  | Idle threshold        | Enter `120` and press **Save**                                                                                | "Idle threshold saved: 120 seconds." It is still 120 after a reload                                   |
| S4  | Validation            | Try `10`, `3601`, `1.5`, an empty box                                                                         | A red message each time, nothing saved, and the text you typed is left as it was                      |
| S5  | Idle really changes   | Set `15`, stop touching the mouse and keyboard for about 20 seconds with a site open, then check **Overview** | Time stops being counted after about 15 s of inactivity (plus up to one heartbeat)                    |
| S6  | Sound switch          | Turn on **Count tabs playing sound as active**, play a video, and leave the mouse alone for 2 minutes         | Time keeps counting while the video plays                                                             |
| S7  | Local sites switch    | Turn off **Track local websites**, visit `http://localhost:3000` (or any local address)                       | Nothing is recorded for it. Turn it on again and it is                                                |
| S8  | Persistence           | Reload the dashboard, then restart Chrome                                                                     | All Settings values are still there                                                                   |
| S9  | Notifications section | Look at **Notifications**                                                                                     | A status line and a link to **Goals & limits**; there is no switch on this page                       |
| S10 | Keyboard              | Use only Tab, Enter, Space and arrow keys                                                                     | Every control works; switches toggle with Space                                                       |
| S11 | Two tabs              | Change a value in one tab                                                                                     | The other tab shows it within a second or so                                                          |

## History length (Phase 8)

| #   | Test              | Steps                                                                                                        | Expected                                                                                                   |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| R1  | Longer is silent  | Set **Keep history for** to 2 years                                                                          | Saved with no confirmation                                                                                 |
| R2  | Shorter confirms  | With sample data, choose **30 days**                                                                         | A dialog says exactly how many days will be deleted ("permanently deletes N days"), with **Delete N days** |
| R3  | Cancel            | In that dialog press **Cancel** (and repeat with Escape and a click outside)                                 | Nothing is deleted and the dropdown goes back to the previous value                                        |
| R4  | Confirm           | Choose **30 days** again and confirm                                                                         | The days vanish right away; **History** and the summary update; N matches what was deleted                 |
| R5  | Nothing to delete | Choose **90 days** after R4 (a longer value), then **30 days** again                                         | No dialog when no day is older than the limit                                                              |
| R6  | Automatic pruning | Add an old day in the worker console (see below), wait for the next heartbeat or press a **Settings** change | Days older than the retention disappear without any click; today is never removed                          |

For R6, in the worker console (replace the date with one older than your retention):

```js
chrome.storage.local.set({
  'usage:2020-01-01': {
    date: '2020-01-01',
    hourlyMs: new Array(24).fill(60000),
    domainMs: { 'old.example': 60000 },
  },
});
```

## Export (Phase 8)

| #   | Test              | Steps                                                | Expected                                                                                                           |
| --- | ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| X1  | JSON              | **Export JSON** with the range **All time**          | Chrome downloads `browsewise-usage-YYYY-MM-DD.json` (today's date). **Note where Chrome saved it.**                |
| X2  | JSON content      | Open it in VS Code                                   | `app`, `exportFormat`, `appVersion`, `timeUnit: "milliseconds"`, `usage`, `categoryOverrides`, `goals`, `settings` |
| X3  | CSV               | **Export CSV**                                       | Downloads `browsewise-usage-YYYY-MM-DD.csv`; header `date,domain,category,seconds`                                 |
| X4  | CSV in Excel      | Double-click the CSV (Excel on Windows)              | Opens in columns with no garbled characters. **Report what Excel shows**                                           |
| X5  | Categories        | Change a site's category on **Websites**, export CSV | That site's rows use your category                                                                                 |
| X6  | Range             | Export **Last 30 days**                              | Only days from the last 30 are in the file (compare the first date)                                                |
| X7  | Nothing to export | After **Clear history**, press either export button  | "There is no browsing data to export for this range." and no file is downloaded                                    |
| X8  | Current to now    | Browse a site for a minute, then export at once      | The file includes the latest seconds (the page asks the worker to save first)                                      |
| X9  | No permission     | Open `chrome://extensions` → BrowseWise → Details    | No "downloads" permission is listed, and the install warning is still only "Read your browsing history"            |

## Deleting data (Phase 8)

Export a copy first if you want to keep your sample data.

| #   | Test                   | Steps                                                                                                                | Expected                                                                                                                         |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Cancel clear           | Press **Clear history…**, then Cancel, Escape, and click outside                                                     | Nothing is deleted; focus returns to the button                                                                                  |
| D2  | Clear history          | Press it again and confirm                                                                                           | "History cleared."; History is empty; goals, limits, category choices and settings are all still there                           |
| D3  | Does not come back     | Keep a site open for 30 seconds before pressing **Clear history…**, confirm, then watch **Overview**                 | Today starts again from about zero. The seconds before the clear do not reappear a few seconds later                             |
| D4  | Cancel delete all      | Press **Delete everything…**, then Cancel                                                                            | Nothing changes                                                                                                                  |
| D5  | Delete everything      | Press it again and confirm                                                                                           | "Everything was deleted…"; Goals page is empty, categories are back to automatic, Settings show the defaults (60 s idle, 1 year) |
| D6  | Tracking resumes       | After D5 keep a site open for a minute                                                                               | New time is recorded from that moment                                                                                            |
| D7  | Notifications released | Before D5 turn notifications on; after D5 look at `chrome://extensions` → Details                                    | The notifications permission is gone, and the Goals page shows notifications as off                                              |
| D8  | Worker asleep          | Close the worker's DevTools window, wait until it says inactive, then **Clear history…**                             | It still works (Chrome wakes the worker for the message)                                                                         |
| D9  | Worker path used       | In the dashboard page console run `chrome.runtime.sendMessage({type:'ERASE_DATA', scope:'bogus'}).then(console.log)` | `{ok: false, error: 'Unknown erase scope.'}` and nothing is deleted                                                              |
| D10 | Uninstall              | Note the extension's ID, remove the extension, reinstall it from `dist/`                                             | A fresh install: no old history (Chrome removes extension storage on uninstall). **Report what you see**                         |

## Privacy section (Phase 8)

| #   | Test      | Steps                                                                             | Expected                                                                               |
| --- | --------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P1  | Wording   | Read **Privacy** on the Settings page                                             | Plain-language lists of what is stored and what is never stored                        |
| P2  | Network   | Open DevTools → Network on the dashboard, use every page and every button         | No requests to any website (only `chrome-extension://` and Chrome's own favicon cache) |
| P3  | Incognito | Allow BrowseWise in Incognito (`chrome://extensions` → Details), browse privately | Nothing from the private window is recorded                                            |

## Visual design and motion (Phase 9)

Open the dashboard and the popup. Run these in a normal window first, then with reduced motion on.

| #   | Test                 | Steps                                                                                          | Expected                                                                                                                         |
| --- | -------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Look                 | Open every dashboard page and the popup                                                        | Neutral graphite, a soft glow at the top, a warm glow low on the right, a faint dot grid and grain; nothing blue except the logo |
| V2  | Font                 | Read the headings and numbers                                                                  | Plus Jakarta Sans everywhere; times line up in columns                                                                           |
| V3  | Scroll parallax      | On **Analytics**, scroll down slowly and back up                                               | The background light drifts at different speeds from the content and from each other; no stutter                                 |
| V4  | Pointer parallax     | Move the mouse around the dashboard                                                            | The glows shift slightly, in opposite directions; they settle back when the mouse leaves the window                              |
| V5  | Card spotlight       | Hover over cards                                                                               | A soft highlight follows the pointer; icon chips in the top cards lean a few pixels                                              |
| V6  | Reveal               | Reload **Analytics** and scroll                                                                | Cards below the fold rise in as they arrive; cards on screen are already in place                                                |
| V7  | Header drift         | Scroll a long page                                                                             | The page title and description move up slowly and fade as they leave                                                             |
| V8  | Refresh is calm      | Leave a page open for a minute while browsing elsewhere                                        | Updating numbers does not replay any entrance animation                                                                          |
| V9  | Popup                | Open the popup and move the mouse over it                                                      | Same look in miniature; a gradient total; the glow shifts slightly                                                               |
| V10 | Reduced motion       | Turn on Windows **Settings → Accessibility → Visual effects → Animation effects: Off**, reload | Everything is still; the background is still drawn; no reveal, no entrance, no parallax                                          |
| V11 | Reduced motion, live | With the dashboard open, switch that setting on and off                                        | Movement stops and resumes without a reload                                                                                      |
| V12 | Dialog               | **Settings → Delete everything…**                                                              | A solid panel; no page text visible through it; the backdrop is dimmed and blurred; focus ring clear                             |
| V13 | Narrow window        | Make the window about 780 px wide                                                              | No sideways scrolling; rows stay readable                                                                                        |
| V14 | Long names           | **Websites** with a category set to "Development & Programming"                                | The category dropdown shows the full name                                                                                        |
| V15 | Performance          | Open DevTools → **Performance**, record while scrolling and moving the mouse for 5 seconds     | Smooth; no long tasks while scrolling. **Report the average frame rate and the machine you use**                                 |
| V16 | Zoom                 | Zoom the page to 200%                                                                          | Text stays readable and the layout does not break                                                                                |
| V17 | High contrast        | Turn on a Windows contrast theme                                                               | Background effects disappear; text and controls stay clear                                                                       |

## Focus timer (Phase 10)

Open the dashboard and choose **Focus**. For quick runs use the worker console snippet at the end of this section instead of waiting 25 minutes.

| #   | Test             | Steps                                                                           | Expected                                                                                                   |
| --- | ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| F1  | Ready state      | Open **Focus** with no timer running                                            | A ring showing 25:00 and "Ready", four empty dots, one **Start focus** button                              |
| F2  | Start            | Press **Start focus**                                                           | The ring fills as time passes; the countdown goes down once a second; the browser tab title shows the time |
| F3  | Pause and resume | Press **Pause**, wait 30 seconds, press **Resume**                              | The time stops while paused (the ring turns grey and says "Focus paused") and carries on from where it was |
| F4  | Stop             | Press **Stop**                                                                  | Back to "Ready"; no session is counted; the tab title returns to normal                                    |
| F5  | Closing the tab  | Start a session, close the dashboard tab, wait a minute, reopen **Focus**       | The timer is still running with the right time left                                                        |
| F6  | Popup            | Start a session, open the popup                                                 | A timer card under the header shows the same time with **Pause** and **Stop**                              |
| F7  | Popup controls   | Pause from the popup, then look at the dashboard                                | The dashboard shows it paused within a second or so                                                        |
| F8  | Two places       | Start from the popup, stop from the dashboard                                   | Both always agree                                                                                          |
| F9  | Length           | With no timer, change **Next focus session** to 45 minutes                      | The ring shows 45:00; the choice is also in **Settings → Focus timer**                                     |
| F10 | End of a session | Let a session finish (see the snippet below)                                    | The count goes up by one, the ring offers a **short break**, and "Focus today" increases                   |
| F11 | Break            | Press **Start break**, then try **Skip break** on another                       | The ring turns warm-coloured and says "Short break"; skipping goes to the next focus session               |
| F12 | Long break       | Finish four sessions                                                            | The fourth is followed by a **long break**, and four dots are filled                                       |
| F13 | Alarm timing     | Finish a session with the dashboard closed                                      | It is recorded within about 30 seconds of the end. **Report how long it really took**                      |
| F14 | Browser restart  | Start a session, quit Chrome completely, reopen it within the session's length  | The timer is still running with the right time left                                                        |
| F15 | Computer sleep   | Start a session, put the computer to sleep for longer than the session, wake it | The session counts (it counts clock time) and no old notification appears                                  |
| F16 | Notifications    | With notifications on (Goals page), finish a session                            | A "Focus session complete" notification; clicking it opens **Focus**                                       |
| F17 | Automatic start  | Turn on **Start the next phase automatically** in Settings, finish a session    | The break starts by itself                                                                                 |
| F18 | Keyboard         | Use only Tab, Enter and Space on the page                                       | Every button and the length selector work; focus is always visible                                         |
| F19 | Screen reader    | With a screen reader, focus the ring                                            | It reads the phase and the time left, and does not announce every second                                   |

**Quick finish (worker console, `chrome://extensions` → BrowseWise → service worker).** With a session running, make it end in 10 seconds:

```js
const s = (await chrome.storage.local.get('focusState')).focusState;
await chrome.storage.local.set({ focusState: { ...s, endsAt: Date.now() + 10000 } });
// Then wait about 40 seconds, or press a button on the Focus page to settle it at once.
```

## Streaks and badges (Phase 10)

| #   | Test               | Steps                                                             | Expected                                                                                                                                 |
| --- | ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | First badge        | Finish your first session with the Focus page open                | A short burst of confetti near the new badge; "New badge: First focus" appears as text; the badge moves to the top, marked with its date |
| K2  | Confetti placement | Do K1 with the Badges list scrolled below the visible area        | The burst still appears inside the window                                                                                                |
| K3  | Locked badges      | Look at a badge you have not earned                               | Grey, with a lock, the words "Locked" and how close you are ("4 of 10 sessions")                                                         |
| K4  | Tiers              | Look at the tier labels                                           | Bronze, Silver and Gold are written as words, not only coloured                                                                          |
| K5  | Focus streak       | Finish a session on two days in a row                             | **Focus streak** shows 2 days                                                                                                            |
| K6  | Today is safe      | On day 3, before finishing a session, look at the streak          | It still shows 2 days, not 0                                                                                                             |
| K7  | A missed day       | Skip a whole day, then look                                       | The streak shows 0 days with "Best: 2 days"; there is no warning, no loss message, and no notification                                   |
| K8  | Goal streak        | Set a daily goal (Goals page), stay within it, check the next day | **Within your goal** counts the finished day. A day with no browsing is skipped, not counted                                             |
| K9  | Reduced motion     | Turn on reduced motion in Windows, earn a badge                   | No confetti and no ring pulse, but the badge and the text message still appear                                                           |
| K10 | Hiding             | **Settings → Show streaks and badges** off                        | Streaks and badges disappear (with a link to bring them back); the timer and plain numbers stay; no badge notifications                  |
| K11 | Showing again      | Turn it back on                                                   | Everything is back, nothing was lost                                                                                                     |
| K12 | Clear history      | **Settings → Clear history…**                                     | The dialog mentions focus sessions, streaks and badges; afterwards they are gone but the settings stay and a running timer is untouched  |
| K13 | Export             | Export JSON                                                       | The file has a `focus` section with your days, badges earned and best streaks                                                            |
| K14 | Retention          | Shorten **Keep history for** so that old days are removed         | Old focus days are removed too, but earned badges and best streaks stay                                                                  |

## Focus settings (Phase 10)

| #   | Test        | Steps                                                                  | Expected                                                                                               |
| --- | ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S12 | Lengths     | **Settings → Focus timer**, set 50, 10, 30, and 3, press **Save**      | Saved; the Focus page uses 50 minutes; the third session is followed by the long break                 |
| S13 | Validation  | Try 4 minutes for the focus session, 0 for a break, 9 for the interval | A message names the field and the allowed range; nothing is saved and what you typed is left as it was |
| S14 | Persistence | Reload, then restart Chrome                                            | The values are still there                                                                             |

## Installing from a download (Phase 10)

| #   | Test             | Steps                                                                         | Expected                                                                                        |
| --- | ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D11 | Fresh install    | Follow [Distribution](distribution.md) from a clean folder on another profile | The extension loads, tracks, and the popup and dashboard open                                   |
| D12 | Update in place  | Replace the files in the same folder and press reload                         | Your data is still there                                                                        |
| D13 | Different folder | Load the same build from another folder and look at your data                 | **Report what you see** (a second copy with empty data would confirm the folder-path behaviour) |
| D14 | Chrome's message | Restart Chrome with the extension loaded                                      | **Report whether Chrome shows a developer-mode message, and what it says**                      |
