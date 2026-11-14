# History, export, and data deletion

Design notes for the History page, the Settings page, and everything that reads, exports, prunes, or erases stored data (Phase 8).

## History page

Three views, switched with a segmented control:

| View        | What it shows                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Days        | Every recorded day, newest first, 30 at a time. Each row: date (Today, Yesterday, or a short date), a bar, the total, the most-used site, and a **View** link. |
| Weeks       | Monday to Sunday, newest first, 12 at a time. Each row: total, daily average over the days that have data, and the number of active days.                      |
| One website | A form (accepts a pasted address) with your most-used sites as suggestions, a range of 30 days, 90 days, or 1 year, four stat cards, and a trend chart.        |

- **View** links and chart points open `#analytics?day=YYYY-MM-DD`. The Analytics page accepts that parameter only if it is a real calendar date that is not in the future; anything else is ignored and the page opens on today.
- "Days visited" and "Average per visit day" count only days with time on the site. Days with nothing are not averaged in as zero.
- The current week is marked "This week" because it is still in progress.
- The website form and range switch live outside the live-updating region, so a background refresh never clears what you typed.

## Retention

The **Keep history for** setting (Settings → History) decides how many days are kept: today plus the days before it. With 30 days, on 30 November the oldest day kept is 1 November.

- Presets: 30, 90, 180, 365 (default), 730, 1825, and 3650 days. A stored value that is not a preset (for example set by an older build) gets its own "custom" entry.
- **Shortening it asks first**, naming exactly how many recorded days will be deleted, and goes back to the previous value if you cancel. If no recorded day is older than the new limit, nothing is deleted and no confirmation is shown.
- Pruning is done by the service worker (`src/background/maintenance.js`): at most once per local day, after tracking, and straight away when settings change. The day it last ran is stored under the key `maintenance`. A failure there is logged and never interrupts tracking.
- Today is never deleted: the shortest retention is 7 days.

## Export

Settings → Your data. Pick a range (all time, last 30 days, last 90 days, last year), then **Export JSON** or **Export CSV**.

The file is created in the page with a `Blob` and a temporary link, so the browser saves it as an ordinary download. No permission is needed and nothing is uploaded. Before exporting, the worker is asked to save the in-progress interval, so the file is current to the second. If the range has no recorded time, a message is shown instead of an empty file.

### JSON

```json
{
  "app": "BrowseWise",
  "exportFormat": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-11-14T08:30:00.000Z",
  "timeUnit": "milliseconds",
  "usage": [
    {
      "date": "2026-11-13",
      "totalMs": 5400000,
      "domains": { "github.com": 3600000, "youtube.com": 1800000 },
      "hourlyMs": [0, 0, "... 24 values ..."]
    }
  ],
  "categoryOverrides": { "youtube.com": "education" },
  "goals": { "dailyGoalMs": 7200000, "siteLimits": { "youtube.com": 1800000 } },
  "settings": { "idleThresholdSeconds": 60, "retentionDays": 365 }
}
```

Days are oldest first. `exportFormat` changes only if the structure changes in a way that would break a reader.

### CSV

One row per website per day. Header: `date,domain,category,seconds`. Lines end in CRLF.

- Sorted by date, then by seconds (most first), then by name.
- The category follows your own choices (overrides), then the built-in rules.
- Seconds are rounded to whole seconds. A website with under half a second in a day is left out.
- The file starts with a UTF-8 byte order mark so Excel reads accents and non-Latin names correctly.
- **Formula injection:** a text cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets a leading apostrophe, so a spreadsheet shows it as text instead of running it. Website names come from addresses, which can contain such characters.

## Deleting data

| Action                | What it deletes                                                         | What it keeps                                          |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| **Clear history**     | All recorded time (every `usage:*` record).                             | Settings, goals and limits, and your category choices. |
| **Delete everything** | All stored data. Settings return to their defaults (notifications off). | Nothing. The extension is as freshly installed.        |

Both ask first with an accessible confirmation dialog.

### Why the service worker does the erasing

The service worker writes usage every time you switch tabs and every 30 seconds. If the dashboard erased storage on its own, one of those writes could land half-way through and bring back a stray record. So the dashboard sends an `ERASE_DATA` message (`{ scope: 'history' | 'everything' }`). The worker validates the scope and the sender, then runs the erase **inside its own task queue**, between tracking tasks, and answers when it is done.

- **History:** the interval since the last checkpoint is saved first, so it is erased with everything else instead of reappearing a few seconds later.
- **Everything:** storage is cleared, defaults are written again (`runMigrations`), the idle threshold is re-applied, and tracking starts afresh from that moment. The Settings page also releases the optional `notifications` permission, because the reset setting says notifications are off.
- **Fallback:** if the worker cannot be reached, the dashboard erases directly (`eraseData`). That path has a very small window in which a tracking write could interleave, which is why it is only a fallback.

## Storage size

`chrome.storage.local` has a documented limit of about 10 MB, and BrowseWise does not request `unlimitedStorage`. Rough measurements of one day's record (a few hundred bytes to a few kilobytes, depending on how many sites you visit):

| Sites per day | One year | Five years | Ten years |
| ------------- | -------- | ---------- | --------- |
| 10            | 0.2 MB   | 1.1 MB     | 2.1 MB    |
| 30            | 0.5 MB   | 2.3 MB     | 4.6 MB    |
| 100           | 1.4 MB   | 6.8 MB     | 13.6 MB   |

These figures use deliberately long made-up domain names, so real use is probably smaller, but a very heavy user keeping ten years could reach the limit. Settings shows the current size and warns from 80% of the limit.

## Known limitations

- Pruning trusts the computer's clock. If the system date is set far into the future, days older than the retention (counted from that date) are deleted. A guard against this is a candidate for the hardening phase.
- An export contains the domains you visited. Treat it as private.
- The stored-history summary counts day records; it does not read any individual site.
- Exporting a very long history builds the file in memory, which is fine for years of data but not designed for gigabytes.
